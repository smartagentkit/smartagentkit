import { parseEther, type Address, type Hex, type Chain } from "viem";
import { privateKeyToAccount, mnemonicToAccount } from "viem/accounts";
import type {
  AgentWallet,
  CreateWalletParams,
  ExecuteParams,
  ExecuteBatchParams,
  CreateSessionParams,
  ActiveSession,
  InstalledPolicy,
  PolicyConfig,
  TokenLimit,
  SignerKey,
  ISmartAgentKitClient,
} from "@smartagentkit/sdk";
import {
  SpendingLimitExceededError,
  WalletPausedError,
  ExecutionError,
  SessionError,
  PRESETS,
  pluginRegistry,
} from "@smartagentkit/sdk";
import type { PresetName } from "@smartagentkit/sdk";
import type { MockClientOptions, MockLogEntry, MockWalletState } from "./types.js";
import { createDefaultState, deterministicAddress } from "./mock-state.js";

const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000" as Address;

// ERC-20 transfer selector: transfer(address,uint256)
const TRANSFER_SELECTOR = "0xa9059cbb";

/**
 * In-memory mock of SmartAgentKitClient for running examples
 * without funded wallets, deployed contracts, or RPC connections.
 *
 * Mirrors the real client's public API but operates entirely in memory.
 */
export class MockSmartAgentKitClient implements ISmartAgentKitClient {
  private wallets: Map<string, MockWalletState> = new Map();
  private log: MockLogEntry[] = [];
  private verbose: boolean;
  private defaultBalance: bigint;
  private defaultTokenBalances: Record<string, bigint>;
  private walletCounter = 1;

  constructor(options: MockClientOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.defaultBalance = options.initialBalance ?? parseEther("10");
    this.defaultTokenBalances = options.tokenBalances ?? {};
  }

  // ─── Wallet Management ────────────────────────────────────────

  async createWallet(params: CreateWalletParams): Promise<AgentWallet> {
    const address = deterministicAddress(this.walletCounter++);
    const state = createDefaultState(address, params.owner, this.defaultBalance);

    // Apply default token balances
    for (const [token, balance] of Object.entries(this.defaultTokenBalances)) {
      state.tokenBalances.set(token.toLowerCase(), balance);
    }

    // Resolve policies
    const policies = this.resolvePolicies(params);
    state.policies = policies;

    // Apply policy effects to state
    for (const policy of policies) {
      this.applyPolicy(state, policy);
    }

    this.wallets.set(address.toLowerCase(), state);
    this.addLog("createWallet", { address, owner: params.owner, preset: params.preset });

    return this.stateToWallet(state);
  }

  async connectWallet(walletAddress: Address, _ownerKey: SignerKey): Promise<void> {
    const key = walletAddress.toLowerCase();
    if (!this.wallets.has(key)) {
      // Create a minimal state for the connected wallet
      const state = createDefaultState(walletAddress, walletAddress, this.defaultBalance);
      for (const [token, balance] of Object.entries(this.defaultTokenBalances)) {
        state.tokenBalances.set(token.toLowerCase(), balance);
      }
      this.wallets.set(key, state);
    }
    this.addLog("connectWallet", { address: walletAddress });
  }

  // ─── Execution ────────────────────────────────────────────────

  async execute(wallet: AgentWallet, params: ExecuteParams): Promise<Hex> {
    const state = this.getState(wallet.address);
    this.enforceNotPaused(state);

    const value = params.value ?? 0n;

    // Check allowlist
    this.enforceAllowlist(state, params.target);

    // Calculate spending (ETH value + token transfers)
    if (value > 0n) {
      this.enforceAndDeductSpending(state, NATIVE_TOKEN, value);
      state.ethBalance -= value;
    }

    // Detect ERC-20 transfer from calldata
    if (params.data && params.data.startsWith(TRANSFER_SELECTOR)) {
      this.deductTokenTransfer(state, params.target, params.data);
    }

    const txHash = this.fakeTxHash();
    this.addLog("execute", {
      target: params.target,
      value: value.toString(),
      txHash,
    });
    return txHash;
  }

  async executeBatch(wallet: AgentWallet, params: ExecuteBatchParams): Promise<Hex> {
    const state = this.getState(wallet.address);
    this.enforceNotPaused(state);

    // Validate all calls first (atomic: all-or-nothing)
    const deductions: Array<{ token: string; amount: bigint }> = [];
    for (const call of params.calls) {
      const value = call.value ?? 0n;
      this.enforceAllowlist(state, call.target);

      if (value > 0n) {
        // Check spending limit without deducting yet
        const tokenKey = NATIVE_TOKEN.toLowerCase();
        const limitEntry = state.spendingLimits.get(tokenKey);
        if (limitEntry) {
          const used = state.spendingUsed.get(tokenKey) ?? 0n;
          const totalPending = deductions
            .filter((d) => d.token === tokenKey)
            .reduce((sum, d) => sum + d.amount, 0n);
          const remaining = limitEntry.limit - used - totalPending;
          if (value > remaining) {
            throw new SpendingLimitExceededError(NATIVE_TOKEN, value, remaining);
          }
        }
        deductions.push({ token: tokenKey, amount: value });
      }
    }

    // Apply all deductions
    for (const { token, amount } of deductions) {
      const used = state.spendingUsed.get(token) ?? 0n;
      state.spendingUsed.set(token, used + amount);
      if (token === NATIVE_TOKEN.toLowerCase()) {
        state.ethBalance -= amount;
      }
    }

    const txHash = this.fakeTxHash();
    this.addLog("executeBatch", {
      callCount: params.calls.length,
      txHash,
    });
    return txHash;
  }

  // ─── Query Functions ──────────────────────────────────────────

  async getRemainingAllowance(walletAddress: Address, token: Address): Promise<bigint> {
    const state = this.getState(walletAddress);
    const tokenKey = token.toLowerCase();
    const limitEntry = state.spendingLimits.get(tokenKey);
    if (!limitEntry) return parseEther("999999"); // No limit configured
    const used = state.spendingUsed.get(tokenKey) ?? 0n;
    return limitEntry.limit - used;
  }

  async isPaused(walletAddress: Address): Promise<boolean> {
    const state = this.getState(walletAddress);
    return state.paused;
  }

  async getBalances(walletAddress: Address): Promise<{
    eth: bigint;
    tokens: { address: Address; symbol: string; balance: bigint }[];
  }> {
    const state = this.getState(walletAddress);
    const tokens: { address: Address; symbol: string; balance: bigint }[] = [];
    for (const [addr, balance] of state.tokenBalances) {
      tokens.push({
        address: addr as Address,
        symbol: this.tokenSymbol(addr),
        balance,
      });
    }
    return { eth: state.ethBalance, tokens };
  }

  // ─── Guardian Actions ─────────────────────────────────────────

  async pause(walletAddress: Address, guardianKey: SignerKey): Promise<Hex> {
    const state = this.getState(walletAddress);
    this.enforceGuardianAuth(state, guardianKey);
    state.paused = true;
    const txHash = this.fakeTxHash();
    this.addLog("pause", { address: walletAddress, txHash });
    return txHash;
  }

  async unpause(walletAddress: Address, guardianKey: SignerKey): Promise<Hex> {
    const state = this.getState(walletAddress);
    this.enforceGuardianAuth(state, guardianKey);
    state.paused = false;
    const txHash = this.fakeTxHash();
    this.addLog("unpause", { address: walletAddress, txHash });
    return txHash;
  }

  // ─── Session Management ───────────────────────────────────────

  async createSession(
    wallet: AgentWallet,
    params: CreateSessionParams,
    _ownerKey: SignerKey,
  ): Promise<{ sessionKey: Address; permissionId: Hex }> {
    const state = this.getState(wallet.address);

    const sessionKey = deterministicAddress(Date.now() % 100000);
    const permissionId = `0x${"cd".repeat(32)}` as Hex;

    const session: ActiveSession = {
      sessionKey,
      actions: params.actions,
      expiresAt: params.expiresAt,
      isActive: true,
    };
    state.sessions.push(session);

    this.addLog("createSession", {
      wallet: wallet.address,
      sessionKey,
      expiresAt: params.expiresAt,
    });

    return { sessionKey, permissionId };
  }

  async revokeSession(
    wallet: AgentWallet,
    permissionId: Hex,
    _ownerKey: SignerKey,
  ): Promise<void> {
    const state = this.getState(wallet.address);
    // Remove the most recent session (simplified — real impl uses permissionId)
    state.sessions = state.sessions.filter((s) => s.isActive);
    if (state.sessions.length > 0) {
      state.sessions[state.sessions.length - 1].isActive = false;
    }
    this.addLog("revokeSession", { wallet: wallet.address, permissionId });
  }

  getActiveSessions(walletAddress: Address): ActiveSession[] {
    const state = this.getState(walletAddress);
    const now = Math.floor(Date.now() / 1000);
    return state.sessions.filter((s) => s.isActive && s.expiresAt > now);
  }

  // ─── Mock-Specific Methods ────────────────────────────────────

  /** Get the full operation log for inspection */
  getLog(): MockLogEntry[] {
    return [...this.log];
  }

  /** Directly manipulate wallet state for test setup */
  setState(walletAddress: Address, updates: Partial<MockWalletState>): void {
    const state = this.getState(walletAddress);
    if (updates.ethBalance !== undefined) state.ethBalance = updates.ethBalance;
    if (updates.paused !== undefined) state.paused = updates.paused;
    if (updates.tokenBalances !== undefined) state.tokenBalances = updates.tokenBalances;
    if (updates.spendingUsed !== undefined) state.spendingUsed = updates.spendingUsed;
    if (updates.allowlistMode !== undefined) state.allowlistMode = updates.allowlistMode;
    if (updates.allowlistTargets !== undefined) state.allowlistTargets = updates.allowlistTargets;
    if (updates.spendingLimits !== undefined) state.spendingLimits = updates.spendingLimits;
    if (updates.guardian !== undefined) state.guardian = updates.guardian;
  }

  /** Get current wallet state (read-only copy) */
  getWalletState(walletAddress: Address): MockWalletState {
    return { ...this.getState(walletAddress) };
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private getState(walletAddress: Address): MockWalletState {
    const state = this.wallets.get(walletAddress.toLowerCase());
    if (!state) {
      throw new ExecutionError(
        `No wallet found at ${walletAddress}. Call createWallet() or connectWallet() first.`,
      );
    }
    return state;
  }

  private enforceNotPaused(state: MockWalletState): void {
    if (state.paused) {
      throw new WalletPausedError(state.address);
    }
  }

  private enforceGuardianAuth(state: MockWalletState, guardianKey: SignerKey): void {
    if (!state.guardian) return; // No guardian configured — allow
    // Resolve the key to an address and check against configured guardian
    const guardianAccount =
      typeof guardianKey === "string"
        ? privateKeyToAccount(guardianKey as Hex)
        : mnemonicToAccount(guardianKey.mnemonic, { addressIndex: guardianKey.addressIndex ?? 0 });
    if (guardianAccount.address.toLowerCase() !== state.guardian.toLowerCase()) {
      throw new ExecutionError(
        `Guardian key mismatch: expected guardian ${state.guardian}, ` +
          `got ${guardianAccount.address}`,
      );
    }
  }

  private enforceAllowlist(state: MockWalletState, target: Address): void {
    if (state.allowlistMode === "allow") {
      if (!state.allowlistTargets.has(target.toLowerCase())) {
        throw new ExecutionError(
          `Target ${target} is not on the allowlist`,
        );
      }
    } else if (state.allowlistMode === "block") {
      if (state.allowlistTargets.has(target.toLowerCase())) {
        throw new ExecutionError(
          `Target ${target} is on the blocklist`,
        );
      }
    }
  }

  private enforceAndDeductSpending(
    state: MockWalletState,
    token: Address,
    amount: bigint,
  ): void {
    const tokenKey = token.toLowerCase();
    const limitEntry = state.spendingLimits.get(tokenKey);
    if (!limitEntry) return; // No limit configured

    const used = state.spendingUsed.get(tokenKey) ?? 0n;
    const remaining = limitEntry.limit - used;

    if (amount > remaining) {
      throw new SpendingLimitExceededError(token, amount, remaining);
    }

    state.spendingUsed.set(tokenKey, used + amount);
  }

  private deductTokenTransfer(
    state: MockWalletState,
    tokenAddress: Address,
    data: Hex,
  ): void {
    // Extract amount from transfer(address,uint256) calldata
    // Selector (4 bytes) + address (32 bytes) + uint256 (32 bytes) = 68 bytes
    if (data.length < 138) return; // "0x" + 4 + 32 + 32 hex chars = 2 + 136
    const amountHex = "0x" + data.slice(74, 138);
    const amount = BigInt(amountHex);
    const tokenKey = tokenAddress.toLowerCase();

    // Deduct from token balance
    const balance = state.tokenBalances.get(tokenKey) ?? 0n;
    state.tokenBalances.set(tokenKey, balance - amount);

    // Enforce spending limit for token
    this.enforceAndDeductSpending(state, tokenAddress as Address, amount);
  }

  private resolvePolicies(params: CreateWalletParams): PolicyConfig[] {
    if (params.preset) {
      // Use SDK PRESETS directly instead of duplicating logic
      const presetFn = PRESETS[params.preset as PresetName];
      if (presetFn) {
        return presetFn(params.owner, params.presetParams);
      }
      return [];
    }
    return params.policies ?? [];
  }

  private applyPolicy(state: MockWalletState, policy: PolicyConfig): void {
    switch (policy.type) {
      case "spending-limit":
        for (const limit of policy.limits) {
          state.spendingLimits.set(limit.token.toLowerCase(), {
            limit: limit.limit,
            window: limit.window,
          });
        }
        break;
      case "allowlist":
        state.allowlistMode = policy.mode;
        for (const target of policy.targets) {
          state.allowlistTargets.add(target.address.toLowerCase());
        }
        break;
      case "emergency-pause":
        state.guardian = policy.guardian;
        break;
      case "automation":
        // Not relevant for mock
        break;
      default:
        // Custom plugin types — skip enforcement in mock (can't generically enforce)
        if (pluginRegistry.has((policy as { type: string }).type)) {
          // Known custom plugin — no-op in mock
        }
        break;
    }
  }

  private stateToWallet(state: MockWalletState): AgentWallet {
    return {
      address: state.address,
      owner: state.owner,
      chain: { id: 84532, name: "Base Sepolia" } as Chain,
      isDeployed: state.isDeployed,
      policies: state.policies.map((p) => ({
        moduleAddress: NATIVE_TOKEN,
        moduleType: 4,
        name: p.type,
        config: p,
      })),
      sessions: state.sessions,
    };
  }

  private tokenSymbol(address: string): string {
    const symbols: Record<string, string> = {
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
      "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
      "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
    };
    return symbols[address.toLowerCase()] ?? "TOKEN";
  }

  private fakeTxHash(): Hex {
    const rand = Math.random().toString(16).slice(2).padEnd(64, "0");
    return `0x${rand}` as Hex;
  }

  private addLog(operation: string, details: Record<string, unknown>): void {
    const entry: MockLogEntry = {
      timestamp: Date.now(),
      operation,
      details,
    };
    this.log.push(entry);
    if (this.verbose) {
      console.log(`[mock] ${operation}:`, JSON.stringify(details));
    }
  }
}
