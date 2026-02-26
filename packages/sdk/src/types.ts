import type { Address, Hex, Chain } from "viem";

// ─── Signer Credentials ──────────────────────────────────────

/** BIP-39 mnemonic phrase with optional HD derivation index */
export interface MnemonicCredential {
  mnemonic: string;
  /** HD derivation index (default: 0) — derives m/44'/60'/0'/0/{index} */
  addressIndex?: number;
}

/**
 * A signer credential: either a raw private key (0x-prefixed hex)
 * or a BIP-39 mnemonic phrase.
 *
 * @example
 * // Private key
 * const key: SignerKey = "0xac09...f2ff80";
 *
 * // Mnemonic (default account index 0)
 * const key: SignerKey = { mnemonic: "test test test..." };
 *
 * // Mnemonic with specific derivation index
 * const key: SignerKey = { mnemonic: "test test test...", addressIndex: 2 };
 */
export type SignerKey = Hex | MnemonicCredential;

// ─── Configuration ────────────────────────────────────────────

export interface SmartAgentKitConfig {
  /** The chain to deploy on */
  chain: Chain;
  /** RPC URL for the chain */
  rpcUrl: string;
  /** Bundler URL (Pimlico, Alchemy, etc.) */
  bundlerUrl: string;
  /** Optional paymaster URL for gas sponsorship */
  paymasterUrl?: string;
  /** Deployed module contract addresses (required for wallet creation) */
  moduleAddresses?: ModuleAddresses;
}

export interface ModuleAddresses {
  /** SpendingLimitHook contract address */
  spendingLimitHook: Address;
  /** AllowlistHook contract address */
  allowlistHook: Address;
  /** EmergencyPauseHook contract address */
  emergencyPauseHook: Address;
  /** AutomationExecutor contract address (optional, Sprint 3) */
  automationExecutor?: Address;
}

// ─── Wallet ───────────────────────────────────────────────────

export interface AgentWallet {
  /** The smart account address */
  address: Address;
  /** The owner address (human/multisig with override control) */
  owner: Address;
  /** Chain the wallet is deployed on */
  chain: Chain;
  /** Whether the wallet is deployed on-chain yet */
  isDeployed: boolean;
  /** Installed policy modules */
  policies: InstalledPolicy[];
  /** Active session keys */
  sessions: ActiveSession[];
}

export interface CreateWalletParams {
  /** Owner address — retains override/recovery control */
  owner: Address;
  /** Private key of the owner for signing the deployment. Provide this OR ownerMnemonic. */
  ownerPrivateKey?: Hex;
  /** BIP-39 mnemonic phrase of the owner. Provide this OR ownerPrivateKey. */
  ownerMnemonic?: string;
  /** HD derivation index (default: 0). Only used with ownerMnemonic. */
  addressIndex?: number;
  /** Policy modules to install at deployment */
  policies?: PolicyConfig[];
  /** Or use a named preset */
  preset?: PresetName;
  /** Preset-specific initialization parameters */
  presetParams?: Record<string, unknown>;
  /** Optional CREATE2 salt for deterministic address */
  salt?: bigint;
}

// ─── Policies ─────────────────────────────────────────────────

export type PresetName =
  | "defi-trader"
  | "treasury-agent"
  | "payment-agent"
  | "minimal";

export type PolicyConfig =
  | SpendingLimitPolicy
  | AllowlistPolicy
  | EmergencyPausePolicy
  | AutomationPolicy;

export interface SpendingLimitPolicy {
  type: "spending-limit";
  limits: TokenLimit[];
}

export interface TokenLimit {
  /** Token address (use "0x0000...0000" for native ETH) */
  token: Address;
  /** Maximum amount per window (in token's smallest unit, e.g., wei) */
  limit: bigint;
  /** Window duration in seconds */
  window: number;
}

export interface AllowlistPolicy {
  type: "allowlist";
  mode: "allow" | "block";
  targets: TargetPermission[];
  /** Infrastructure addresses blocked from being called as targets (hooks, multiplexer, executor) */
  protectedAddresses?: Address[];
}

export interface TargetPermission {
  /** Contract address to allow/block */
  address: Address;
  /** Function selector (e.g., "0xa9059cbb" for transfer). Omit for wildcard (all functions).
   *  NOTE: "0x00000000" is NOT a wildcard — it matches empty calldata (ETH transfers only).
   *  The actual wildcard selector is 0x431e2cf5 (bytes4(keccak256("WILDCARD"))). */
  selector?: Hex;
}

export interface EmergencyPausePolicy {
  type: "emergency-pause";
  /** Address authorized to pause/unpause (typically the owner) */
  guardian: Address;
  /** Auto-unpause after this many seconds (0 = manual only) */
  autoUnpauseAfter?: number;
}

export interface AutomationPolicy {
  type: "automation";
  tasks: AutomationTask[];
}

export interface AutomationTask {
  id: string;
  /** Address of the automation service (e.g., Gelato relay) */
  caller: Address;
  /** Target contract to call */
  target: Address;
  /** ETH value to send */
  value?: bigint;
  /** Calldata for the target function */
  calldata: Hex;
  /** Minimum seconds between executions */
  cooldown: number;
  /** Maximum number of executions (0 = unlimited) */
  maxExecutions?: number;
}

// ─── Sessions ─────────────────────────────────────────────────

export interface CreateSessionParams {
  /** The session key address (generated or provided) */
  sessionKey: Address;
  /** Allowed actions for this session */
  actions: SessionAction[];
  /** Expiry timestamp (Unix seconds) */
  expiresAt: number;
  /** Optional: spending limits specific to this session */
  spendingLimits?: TokenLimit[];
}

export interface SessionAction {
  /** Target contract address */
  target: Address;
  /** Allowed function selector */
  selector: Hex;
  /** Optional: parameter-level restrictions */
  rules?: SessionRule[];
}

export interface SessionRule {
  /** Byte offset in calldata to check */
  offset: bigint;
  /** Comparison condition */
  condition: "equal" | "greater" | "less" | "notEqual";
  /** Reference value to compare against */
  value: Hex;
}

export interface ActiveSession {
  sessionKey: Address;
  actions: SessionAction[];
  expiresAt: number;
  isActive: boolean;
}

// ─── Execution ────────────────────────────────────────────────

export interface ExecuteParams {
  /** Target contract address */
  target: Address;
  /** ETH value to send */
  value?: bigint;
  /** Calldata for the function call */
  data?: Hex;
  /** Session key private key to sign with (if using session-based execution) */
  sessionKey?: Hex;
}

export interface ExecuteBatchParams {
  calls: ExecuteParams[];
  sessionKey?: Hex;
}

export interface InstalledPolicy {
  moduleAddress: Address;
  moduleType: number;
  name: string;
  config: PolicyConfig;
}

// ─── Client Interface ────────────────────────────────────────

/**
 * Shared interface for SmartAgentKit clients.
 * Both the real SmartAgentKitClient and MockSmartAgentKitClient implement this.
 */
export interface ISmartAgentKitClient {
  createWallet(params: CreateWalletParams): Promise<AgentWallet>;
  connectWallet(walletAddress: Address, ownerKey: SignerKey): Promise<void>;
  execute(wallet: AgentWallet, params: ExecuteParams): Promise<Hex>;
  executeBatch(wallet: AgentWallet, params: ExecuteBatchParams): Promise<Hex>;
  getRemainingAllowance(walletAddress: Address, token: Address): Promise<bigint>;
  isPaused(walletAddress: Address): Promise<boolean>;
  getBalances(walletAddress: Address): Promise<{
    eth: bigint;
    tokens: { address: Address; symbol: string; balance: bigint }[];
  }>;
  pause(walletAddress: Address, guardianKey: SignerKey): Promise<Hex>;
  unpause(walletAddress: Address, guardianKey: SignerKey): Promise<Hex>;
  createSession(
    wallet: AgentWallet,
    params: CreateSessionParams,
    ownerKey: SignerKey,
  ): Promise<{ sessionKey: Address; privateKey: Hex; permissionId: Hex }>;
  revokeSession(wallet: AgentWallet, permissionId: Hex, ownerKey: SignerKey): Promise<void>;
  getActiveSessions(walletAddress: Address): ActiveSession[];
}
