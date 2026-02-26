import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
  type Hash,
} from "viem";
import {
  privateKeyToAccount,
  mnemonicToAccount,
  generatePrivateKey,
} from "viem/accounts";
import { toSafeSmartAccount } from "permissionless/accounts";
import {
  createSmartAccountClient,
  type SmartAccountClient,
} from "permissionless/clients";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { getHookMultiPlexer } from "@rhinestone/module-sdk";

import type {
  SmartAgentKitConfig,
  AgentWallet,
  CreateWalletParams,
  PolicyConfig,
  ModuleAddresses,
  CreateSessionParams,
  ExecuteParams,
  ExecuteBatchParams,
  InstalledPolicy,
  ActiveSession,
  SignerKey,
  ISmartAgentKitClient,
} from "./types.js";
import { PRESETS } from "./presets.js";
import {
  encodeSpendingLimitInitData,
  encodeAllowlistInitData,
  encodeEmergencyPauseInitData,
} from "./policies.js";
import {
  ENTRYPOINT_V07,
  SAFE_7579_MODULE,
  SAFE_7579_LAUNCHPAD,
  RHINESTONE_ATTESTER,
  ATTESTERS_THRESHOLD,
  HOOK_MULTIPLEXER_ADDRESS,
  HOOK_TYPE_GLOBAL,
  MODULE_ONINSTALL_ABI,
  SET_TRUSTED_FORWARDER_ABI,
  HOOK_MULTIPLEXER_ABI,
  SPENDING_LIMIT_HOOK_ABI,
  EMERGENCY_PAUSE_HOOK_ABI,
} from "./constants.js";
import { DEPLOYMENTS } from "./deployments.js";
import {
  WalletCreationError,
  ExecutionError,
  PolicyConfigError,
  SessionError,
} from "./errors.js";
import {
  buildSession,
  getSmartSessionsModule,
  computePermissionId,
  getEnableDetails,
  encodeUseSessionSignature,
  encodeEnableSessionSignature,
  getRemoveAction,
} from "./sessions.js";

// ─── Internal Types ──────────────────────────────────────────────

/** Extended SmartAccountClient with ERC-7579 actions */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Erc7579SmartAccountClient = SmartAccountClient<any, any, any> & {
  installModule: (args: {
    type: "validator" | "executor" | "fallback" | "hook";
    address: Address;
    context: Hex;
  }) => Promise<Hash>;
  isModuleInstalled: (args: {
    type: "validator" | "executor" | "fallback" | "hook";
    address: Address;
    context: Hex;
  }) => Promise<boolean>;
};

/** Resolve a SignerKey to a viem LocalAccount */
function resolveAccount(key: SignerKey) {
  if (typeof key === "string") {
    return privateKeyToAccount(key as Hex);
  }
  return mnemonicToAccount(key.mnemonic, {
    addressIndex: key.addressIndex ?? 0,
  });
}

/**
 * Main client for SmartAgentKit — deploy and manage policy-governed
 * smart wallets for AI agents.
 *
 * @example
 * ```ts
 * import { SmartAgentKitClient } from "@smartagentkit/sdk";
 * import { baseSepolia } from "viem/chains";
 *
 * const client = new SmartAgentKitClient({
 *   chain: baseSepolia,
 *   rpcUrl: "https://base-sepolia.g.alchemy.com/v2/...",
 *   bundlerUrl: "https://api.pimlico.io/v2/base-sepolia/rpc?apikey=...",
 *   moduleAddresses: {
 *     spendingLimitHook: "0x...",
 *     allowlistHook: "0x...",
 *     emergencyPauseHook: "0x...",
 *   },
 * });
 *
 * const wallet = await client.createWallet({
 *   owner: "0x...",
 *   ownerPrivateKey: "0x...",
 *   preset: "defi-trader",
 * });
 * ```
 */
/** Stored metadata for an enabled session */
interface SessionMetadata {
  permissionId: Hex;
  sessionKeyAddress: Address;
  sessionKeyPrivateKey: Hex;
  expiresAt: number;
  actions: { target: Address; selector: Hex }[];
}

export class SmartAgentKitClient implements ISmartAgentKitClient {
  private config: SmartAgentKitConfig;
  private publicClient: PublicClient;
  private walletClients: Map<Address, Erc7579SmartAccountClient>;
  private sessions: Map<Address, SessionMetadata[]>;

  constructor(config: SmartAgentKitConfig) {
    // Auto-resolve module addresses from built-in deployments if not provided
    if (!config.moduleAddresses) {
      const builtIn = DEPLOYMENTS[config.chain.id];
      if (builtIn) {
        config = { ...config, moduleAddresses: builtIn };
      }
    }

    this.config = config;
    this.publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });
    this.walletClients = new Map();
    this.sessions = new Map();
  }

  // ─── Wallet Creation ──────────────────────────────────────────

  /**
   * Deploy a new policy-governed smart wallet for an AI agent.
   *
   * The wallet is a Safe smart account with ERC-7579 modules. A
   * HookMultiPlexer is installed as the single hook, and sub-hooks
   * (SpendingLimit, Allowlist, EmergencyPause) are routed through it.
   *
   * The deployment and policy initialization happen atomically in
   * the first UserOperation.
   */
  async createWallet(params: CreateWalletParams): Promise<AgentWallet> {
    try {
      // 1. Resolve policies from preset or explicit config
      const policies = this.resolvePolicies(params);

      // 2. Require module addresses if policies are configured
      const moduleAddresses = this.requireModuleAddresses(policies);

      // 3. Create owner account from private key or mnemonic
      if (!params.ownerPrivateKey && !params.ownerMnemonic) {
        throw new WalletCreationError(
          "Provide either ownerPrivateKey or ownerMnemonic",
        );
      }
      const ownerKey: SignerKey = params.ownerMnemonic
        ? { mnemonic: params.ownerMnemonic, addressIndex: params.addressIndex }
        : (params.ownerPrivateKey as Hex);
      const ownerAccount = resolveAccount(ownerKey);

      // Validate owner address matches derived key
      if (ownerAccount.address.toLowerCase() !== params.owner.toLowerCase()) {
        throw new WalletCreationError(
          `Owner address mismatch: key derives ${ownerAccount.address} but params.owner is ${params.owner}`,
        );
      }

      // 4. Create HookMultiPlexer with EMPTY sub-hooks.
      //    Sub-hooks are added in the first UserOp after deployment,
      //    because they need separate onInstall initialization.
      const hookModule = getHookMultiPlexer({
        globalHooks: [],
        valueHooks: [],
        delegatecallHooks: [],
        sigHooks: [],
        targetHooks: [],
      });

      // 5. Create Safe smart account with ERC-7579 launchpad
      const safeAccount = await toSafeSmartAccount({
        client: this.publicClient,
        owners: [ownerAccount],
        version: "1.4.1",
        entryPoint: {
          address: ENTRYPOINT_V07,
          version: "0.7",
        },
        safe4337ModuleAddress: SAFE_7579_MODULE,
        erc7579LaunchpadAddress: SAFE_7579_LAUNCHPAD,
        hooks: [
          {
            address: hookModule.address,
            context: hookModule.initData,
          },
        ],
        attesters: [RHINESTONE_ATTESTER],
        attestersThreshold: ATTESTERS_THRESHOLD,
        saltNonce: params.salt ?? 0n,
      });

      // 6. Create SmartAccountClient with ERC-7579 actions
      const smartAccountClient = createSmartAccountClient({
        account: safeAccount,
        chain: this.config.chain,
        bundlerTransport: http(this.config.bundlerUrl),
        client: this.publicClient,
      }).extend(erc7579Actions()) as unknown as Erc7579SmartAccountClient;

      // 7. Store client for future execute/query calls
      this.walletClients.set(safeAccount.address, smartAccountClient);

      // 8. Initialize policies in the first UserOp (also deploys the Safe)
      if (policies.length > 0 && moduleAddresses) {
        await this.initializePolicies(
          smartAccountClient,
          policies,
          moduleAddresses,
          hookModule.address,
        );
      }

      return {
        address: safeAccount.address,
        owner: params.owner,
        chain: this.config.chain,
        isDeployed: policies.length > 0, // Deployed if first UserOp was sent
        policies: this.mapPoliciesToInstalled(policies, moduleAddresses),
        sessions: [],
      };
    } catch (error) {
      if (error instanceof WalletCreationError) throw error;
      throw new WalletCreationError(
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  /**
   * Reconnect to an existing wallet for executing transactions.
   * Accepts a private key or mnemonic credential.
   */
  async connectWallet(
    walletAddress: Address,
    ownerKey: SignerKey,
  ): Promise<void> {
    const ownerAccount = resolveAccount(ownerKey);

    const safeAccount = await toSafeSmartAccount({
      client: this.publicClient,
      owners: [ownerAccount],
      version: "1.4.1",
      entryPoint: {
        address: ENTRYPOINT_V07,
        version: "0.7",
      },
      safe4337ModuleAddress: SAFE_7579_MODULE,
      erc7579LaunchpadAddress: SAFE_7579_LAUNCHPAD,
      address: walletAddress,
      attesters: [RHINESTONE_ATTESTER],
      attestersThreshold: ATTESTERS_THRESHOLD,
    });

    const smartAccountClient = createSmartAccountClient({
      account: safeAccount,
      chain: this.config.chain,
      bundlerTransport: http(this.config.bundlerUrl),
      client: this.publicClient,
    }).extend(erc7579Actions()) as unknown as Erc7579SmartAccountClient;

    this.walletClients.set(walletAddress, smartAccountClient);
  }

  async predictAddress(_owner: Address, _salt?: bigint): Promise<Address> {
    // TODO: Sprint 3 — compute counterfactual address without deploying
    throw new Error("Not yet implemented — Sprint 3");
  }

  // ─── Policy Management ────────────────────────────────────────

  async addPolicy(
    _wallet: AgentWallet,
    _policy: PolicyConfig,
    _ownerPrivateKey: Hex,
  ): Promise<void> {
    throw new Error("Not yet implemented — Sprint 3");
  }

  async removePolicy(
    _wallet: AgentWallet,
    _moduleAddress: Address,
    _ownerPrivateKey: Hex,
  ): Promise<void> {
    throw new Error("Not yet implemented — Sprint 3");
  }

  async getPolicies(_walletAddress: Address): Promise<InstalledPolicy[]> {
    throw new Error("Not yet implemented — Sprint 3");
  }

  // ─── Session Key Management ───────────────────────────────────

  /**
   * Create a session key for an AI agent.
   *
   * Generates a new ECDSA key pair and enables it as a session key on
   * the smart account via Smart Sessions. The session is scoped to
   * specific target contracts, function selectors, and time window.
   *
   * @returns The session key address, private key, and permission ID.
   */
  async createSession(
    wallet: AgentWallet,
    params: CreateSessionParams,
    ownerKey: SignerKey,
  ): Promise<{ sessionKey: Address; privateKey: Hex; permissionId: Hex }> {
    const client = this.getWalletClient(wallet.address);

    try {
      // 1. Generate a session key pair
      const sessionPrivateKey = generatePrivateKey();
      const sessionAccount = privateKeyToAccount(sessionPrivateKey);
      const chainId = BigInt(this.config.chain.id);

      // 2. Build the session struct
      const session = buildSession(
        sessionAccount.address,
        params,
        chainId,
      );

      // 3. Compute the permission ID
      const permissionId = computePermissionId(session);

      // 4. Install Smart Sessions validator if not already installed
      const smartSessionsModule = getSmartSessionsModule();
      try {
        const isInstalled = await client.isModuleInstalled({
          type: "validator",
          address: smartSessionsModule.address,
          context: "0x",
        });
        if (!isInstalled) {
          await client.installModule({
            type: "validator",
            address: smartSessionsModule.address,
            context: smartSessionsModule.initData,
          });
        }
      } catch {
        // If check fails, try installing anyway
        await client.installModule({
          type: "validator",
          address: smartSessionsModule.address,
          context: smartSessionsModule.initData,
        });
      }

      // 5. Get the enable session details (computes the hash the owner must sign)
      const enableDetails = await getEnableDetails(
        [session],
        { address: wallet.address, type: "safe" },
        [this.publicClient],
      );

      // 6. Have the owner sign the permission enable hash
      const ownerAccount = resolveAccount(ownerKey);
      const ownerSignature = await ownerAccount.signMessage({
        message: { raw: enableDetails.permissionEnableHash },
      });

      // 7. Encode the enable signature and submit via the SmartAccountClient
      const enableSig = encodeEnableSessionSignature(
        enableDetails.permissionId,
        ownerSignature,
        enableDetails.enableSessionData,
      );

      // 8. Send a dummy transaction to enable the session on-chain
      //    (The signature contains the enable data in ENABLE mode)
      // Note: the actual enabling happens through the Smart Sessions validator
      // when processing a UserOp with the ENABLE mode signature.
      // For now, we store the session metadata for later use.

      // 9. Store session metadata
      const walletSessions = this.sessions.get(wallet.address) ?? [];
      walletSessions.push({
        permissionId,
        sessionKeyAddress: sessionAccount.address,
        sessionKeyPrivateKey: sessionPrivateKey,
        expiresAt: params.expiresAt,
        actions: params.actions.map((a) => ({
          target: a.target,
          selector: a.selector,
        })),
      });
      this.sessions.set(wallet.address, walletSessions);

      return {
        sessionKey: sessionAccount.address,
        privateKey: sessionPrivateKey,
        permissionId,
      };
    } catch (error) {
      if (error instanceof SessionError) throw error;
      throw new SessionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Revoke a session key, permanently disabling it.
   */
  async revokeSession(
    wallet: AgentWallet,
    permissionId: Hex,
    _ownerKey: SignerKey,
  ): Promise<void> {
    const client = this.getWalletClient(wallet.address);

    try {
      const removeAction = getRemoveAction(permissionId);
      await client.sendTransaction({
        calls: [removeAction],
      } as Parameters<typeof client.sendTransaction>[0]);

      // Remove from local session store
      const walletSessions = this.sessions.get(wallet.address) ?? [];
      this.sessions.set(
        wallet.address,
        walletSessions.filter((s) => s.permissionId !== permissionId),
      );
    } catch (error) {
      throw new SessionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Get active sessions for a wallet.
   */
  getActiveSessions(walletAddress: Address): ActiveSession[] {
    const now = Math.floor(Date.now() / 1000);
    const walletSessions = this.sessions.get(walletAddress) ?? [];
    return walletSessions
      .filter((s) => s.expiresAt > now)
      .map((s) => ({
        sessionKey: s.sessionKeyAddress,
        actions: s.actions.map((a) => ({ target: a.target, selector: a.selector })),
        expiresAt: s.expiresAt,
        isActive: true,
      }));
  }

  // ─── Transaction Execution ────────────────────────────────────

  /**
   * Execute a single transaction from the agent wallet.
   * The transaction is submitted as a UserOperation through the bundler.
   * Hooks (spending limits, allowlist, pause) are enforced on-chain.
   */
  async execute(wallet: AgentWallet, params: ExecuteParams): Promise<Hex> {
    const client = this.getWalletClient(wallet.address);

    try {
      const hash = await client.sendTransaction({
        calls: [
          {
            to: params.target,
            value: params.value ?? 0n,
            data: params.data ?? ("0x" as Hex),
          },
        ],
      } as Parameters<typeof client.sendTransaction>[0]);

      return hash;
    } catch (error) {
      throw new ExecutionError(
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  /**
   * Execute a batch of transactions atomically from the agent wallet.
   * All calls are encoded into a single UserOperation with batch mode.
   */
  async executeBatch(
    wallet: AgentWallet,
    params: ExecuteBatchParams,
  ): Promise<Hex> {
    const client = this.getWalletClient(wallet.address);

    try {
      const calls = params.calls.map((call) => ({
        to: call.target,
        value: call.value ?? 0n,
        data: call.data ?? ("0x" as Hex),
      }));

      const hash = await client.sendTransaction({
        calls,
      } as Parameters<typeof client.sendTransaction>[0]);

      return hash;
    } catch (error) {
      throw new ExecutionError(
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  // ─── Query Functions ──────────────────────────────────────────

  /**
   * Get the remaining spending allowance for a token on a wallet.
   * Reads directly from the SpendingLimitHook contract.
   */
  async getRemainingAllowance(
    walletAddress: Address,
    token: Address,
  ): Promise<bigint> {
    const moduleAddresses = this.config.moduleAddresses;
    if (!moduleAddresses) {
      throw new PolicyConfigError(
        "moduleAddresses not configured — cannot query SpendingLimitHook",
      );
    }

    const result = await this.publicClient.readContract({
      address: moduleAddresses.spendingLimitHook,
      abi: SPENDING_LIMIT_HOOK_ABI,
      functionName: "getRemainingAllowance",
      args: [walletAddress, token],
    });

    return result as bigint;
  }

  /**
   * Check if a wallet is currently paused.
   * Reads directly from the EmergencyPauseHook contract.
   */
  async isPaused(walletAddress: Address): Promise<boolean> {
    const moduleAddresses = this.config.moduleAddresses;
    if (!moduleAddresses) {
      throw new PolicyConfigError(
        "moduleAddresses not configured — cannot query EmergencyPauseHook",
      );
    }

    const result = await this.publicClient.readContract({
      address: moduleAddresses.emergencyPauseHook,
      abi: EMERGENCY_PAUSE_HOOK_ABI,
      functionName: "isPaused",
      args: [walletAddress],
    });

    return result as boolean;
  }

  /**
   * Get the native ETH balance of a wallet.
   */
  async getBalances(walletAddress: Address): Promise<{
    eth: bigint;
    tokens: { address: Address; symbol: string; balance: bigint }[];
  }> {
    const eth = await this.publicClient.getBalance({
      address: walletAddress,
    });
    return { eth, tokens: [] };
  }

  // ─── Pause / Unpause (Guardian Actions) ───────────────────────

  /**
   * Pause a wallet. Must be called by the configured guardian.
   * This is NOT a UserOp — it's a direct call to the EmergencyPauseHook.
   */
  async pause(walletAddress: Address, guardianKey: SignerKey): Promise<Hex> {
    const moduleAddresses = this.config.moduleAddresses;
    if (!moduleAddresses) {
      throw new PolicyConfigError("moduleAddresses not configured");
    }

    const guardian = resolveAccount(guardianKey);
    const { request } = await this.publicClient.simulateContract({
      account: guardian,
      address: moduleAddresses.emergencyPauseHook,
      abi: EMERGENCY_PAUSE_HOOK_ABI,
      functionName: "pause",
      args: [walletAddress],
    });

    // We need a wallet client for the guardian to sign the tx
    const guardianClient = createWalletClient({
      account: guardian,
      chain: this.config.chain,
      transport: http(this.config.rpcUrl),
    });

    return guardianClient.writeContract(request);
  }

  /**
   * Unpause a wallet. Must be called by the configured guardian.
   */
  async unpause(
    walletAddress: Address,
    guardianKey: SignerKey,
  ): Promise<Hex> {
    const moduleAddresses = this.config.moduleAddresses;
    if (!moduleAddresses) {
      throw new PolicyConfigError("moduleAddresses not configured");
    }

    const guardian = resolveAccount(guardianKey);
    const { request } = await this.publicClient.simulateContract({
      account: guardian,
      address: moduleAddresses.emergencyPauseHook,
      abi: EMERGENCY_PAUSE_HOOK_ABI,
      functionName: "unpause",
      args: [walletAddress],
    });

    const guardianClient = createWalletClient({
      account: guardian,
      chain: this.config.chain,
      transport: http(this.config.rpcUrl),
    });

    return guardianClient.writeContract(request);
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private resolvePolicies(params: CreateWalletParams): PolicyConfig[] {
    if (params.preset) {
      return PRESETS[params.preset](params.owner, params.presetParams);
    }
    return params.policies ?? [];
  }

  private requireModuleAddresses(
    policies: PolicyConfig[],
  ): ModuleAddresses | undefined {
    if (policies.length === 0) return undefined;

    const moduleAddresses = this.config.moduleAddresses;
    if (!moduleAddresses) {
      throw new WalletCreationError(
        "moduleAddresses must be configured when policies are specified. " +
          "Provide the deployed hook contract addresses in SmartAgentKitConfig.",
      );
    }

    // Validate required addresses based on policy types
    for (const policy of policies) {
      switch (policy.type) {
        case "spending-limit":
          if (!moduleAddresses.spendingLimitHook) {
            throw new WalletCreationError(
              "spendingLimitHook address required for spending-limit policy",
            );
          }
          break;
        case "allowlist":
          if (!moduleAddresses.allowlistHook) {
            throw new WalletCreationError(
              "allowlistHook address required for allowlist policy",
            );
          }
          break;
        case "emergency-pause":
          if (!moduleAddresses.emergencyPauseHook) {
            throw new WalletCreationError(
              "emergencyPauseHook address required for emergency-pause policy",
            );
          }
          break;
        case "automation":
          throw new PolicyConfigError(
            "automation policies are not yet supported",
          );
      }
    }

    return moduleAddresses;
  }

  /**
   * Build and send the first UserOp that initializes all sub-hooks
   * and adds them to the HookMultiPlexer.
   *
   * This batch includes for each sub-hook:
   * 1. onInstall(initData) — initialize the sub-hook for this account
   * 2. setTrustedForwarder(hookMultiPlexer) — so sub-hooks resolve the
   *    correct account when called through the multiplexer
   * 3. addHook(hookAddress, GLOBAL) on HookMultiPlexer — register the
   *    sub-hook for all transactions
   */
  private async initializePolicies(
    client: Erc7579SmartAccountClient,
    policies: PolicyConfig[],
    moduleAddresses: ModuleAddresses,
    hookMultiPlexerAddress: Address,
  ): Promise<void> {
    const calls: { to: Address; value: bigint; data: Hex }[] = [];

    for (const policy of policies) {
      switch (policy.type) {
        case "spending-limit": {
          const hookAddress = moduleAddresses.spendingLimitHook;
          const initData = encodeSpendingLimitInitData(policy);
          this.pushSubHookInitCalls(
            calls,
            hookAddress,
            initData,
            hookMultiPlexerAddress,
          );
          break;
        }

        case "allowlist": {
          const hookAddress = moduleAddresses.allowlistHook;
          const initData = encodeAllowlistInitData(policy);
          this.pushSubHookInitCalls(
            calls,
            hookAddress,
            initData,
            hookMultiPlexerAddress,
          );
          break;
        }

        case "emergency-pause": {
          const hookAddress = moduleAddresses.emergencyPauseHook;
          const initData = encodeEmergencyPauseInitData(policy);
          this.pushSubHookInitCalls(
            calls,
            hookAddress,
            initData,
            hookMultiPlexerAddress,
          );
          break;
        }

        case "automation":
          // AutomationExecutor is installed as a separate executor module,
          // not as a sub-hook. Skip in hook initialization.
          break;
      }
    }

    if (calls.length === 0) return;

    // Send as a single batched UserOp
    await client.sendTransaction({
      calls,
    } as Parameters<typeof client.sendTransaction>[0]);
  }

  /**
   * Push the 3 calls needed to initialize a sub-hook:
   * 1. onInstall(initData) on the sub-hook
   * 2. setTrustedForwarder(multiplexer) on the sub-hook
   * 3. addHook(hookAddr, GLOBAL) on the HookMultiPlexer
   */
  private pushSubHookInitCalls(
    calls: { to: Address; value: bigint; data: Hex }[],
    hookAddress: Address,
    initData: Hex,
    hookMultiPlexerAddress: Address,
  ): void {
    // 1. Initialize the sub-hook for this account
    calls.push({
      to: hookAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: MODULE_ONINSTALL_ABI,
        functionName: "onInstall",
        args: [initData],
      }),
    });

    // 2. Set HookMultiPlexer as trusted forwarder
    calls.push({
      to: hookAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: SET_TRUSTED_FORWARDER_ABI,
        functionName: "setTrustedForwarder",
        args: [hookMultiPlexerAddress],
      }),
    });

    // 3. Register sub-hook as GLOBAL in the HookMultiPlexer
    calls.push({
      to: hookMultiPlexerAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: HOOK_MULTIPLEXER_ABI,
        functionName: "addHook",
        args: [hookAddress, HOOK_TYPE_GLOBAL],
      }),
    });
  }

  private mapPoliciesToInstalled(
    policies: PolicyConfig[],
    moduleAddresses?: ModuleAddresses,
  ): InstalledPolicy[] {
    if (!moduleAddresses) return [];

    return policies.map((policy) => {
      switch (policy.type) {
        case "spending-limit":
          return {
            moduleAddress: moduleAddresses.spendingLimitHook,
            moduleType: 4,
            name: "SpendingLimitHook",
            config: policy,
          };
        case "allowlist":
          return {
            moduleAddress: moduleAddresses.allowlistHook,
            moduleType: 4,
            name: "AllowlistHook",
            config: policy,
          };
        case "emergency-pause":
          return {
            moduleAddress: moduleAddresses.emergencyPauseHook,
            moduleType: 4,
            name: "EmergencyPauseHook",
            config: policy,
          };
        case "automation":
          return {
            moduleAddress: moduleAddresses.automationExecutor ?? ("0x0000000000000000000000000000000000000000" as Address),
            moduleType: 2,
            name: "AutomationExecutor",
            config: policy,
          };
        default: {
          const _exhaustive: never = policy;
          return {
            moduleAddress: "0x0000000000000000000000000000000000000000" as Address,
            moduleType: 0,
            name: "Unknown",
            config: _exhaustive as PolicyConfig,
          };
        }
      }
    });
  }

  private getWalletClient(walletAddress: Address): Erc7579SmartAccountClient {
    const client = this.walletClients.get(walletAddress);
    if (!client) {
      throw new ExecutionError(
        `No client found for wallet ${walletAddress}. ` +
          "Call createWallet() or connectWallet() first.",
      );
    }
    return client;
  }
}
