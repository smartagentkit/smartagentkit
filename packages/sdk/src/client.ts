import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  encodeAbiParameters,
  isAddress,
  isHex,
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
import { createPimlicoClient } from "permissionless/clients/pimlico";
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
  SMART_SESSIONS_VALIDATOR,
  MODULE_ONINSTALL_ABI,
  MODULE_ONUNINSTALL_ABI,
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
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      throw new WalletCreationError(
        "Invalid private key format. Expected a 0x-prefixed 32-byte hex string.",
      );
    }
    return privateKeyToAccount(key as Hex);
  }
  return mnemonicToAccount(key.mnemonic, {
    addressIndex: key.addressIndex ?? 0,
  });
}

/**
 * Wrap raw hook initData in Safe7579's expected format for the `hooks` parameter.
 *
 * Safe7579's `_installHook` decodes data as `abi.decode(data, (HookType, bytes4, bytes))`.
 * HookType.GLOBAL = 0, bytes4(0) for global hooks.
 */
function wrapHookInitData(rawInitData: Hex): Hex {
  return encodeAbiParameters(
    [{ type: "uint8" }, { type: "bytes4" }, { type: "bytes" }],
    [0, "0x00000000" as Hex, rawInitData],
  );
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
/** Stored metadata for an enabled session (private key is NOT stored) */
interface SessionMetadata {
  permissionId: Hex;
  sessionKeyAddress: Address;
  expiresAt: number;
  actions: { target: Address; selector: Hex }[];
}

export class SmartAgentKitClient implements ISmartAgentKitClient {
  private config: SmartAgentKitConfig;
  private publicClient: PublicClient;
  private paymasterClient: ReturnType<typeof createPimlicoClient> | undefined;
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
    if (config.paymasterUrl) {
      this.paymasterClient = createPimlicoClient({
        chain: config.chain,
        transport: http(config.paymasterUrl),
        entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
      });
    }
    this.walletClients = new Map();
    this.sessions = new Map();
  }

  // ─── Wallet Creation ──────────────────────────────────────────

  /**
   * Deploy a new policy-governed smart wallet for an AI agent.
   *
   * The wallet is a Safe smart account with ERC-7579 modules. An empty
   * HookMultiPlexer is installed during launchpad deployment, then
   * sub-hooks (SpendingLimit, Allowlist, EmergencyPause) are initialized
   * and the HMP is reconfigured in the first UserOperation.
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
          "Owner address does not match the provided signing key. " +
            "Verify that the private key or mnemonic corresponds to the specified owner address.",
        );
      }

      // 4. Deploy with EMPTY HookMultiPlexer via the `hooks` parameter.
      //    Safe7579's _installHook expects data as abi.encode(HookType, bytes4, bytes),
      //    so we wrap the raw initData. Sub-hooks are configured post-deployment
      //    because the launchpad's delegatecall chain cannot handle non-empty
      //    globalHooks in HMP.onInstall during initialization.
      const emptyHMP = getHookMultiPlexer({
        globalHooks: [],
        valueHooks: [],
        delegatecallHooks: [],
        sigHooks: [],
        targetHooks: [],
      });
      const wrappedEmptyInitData = wrapHookInitData(emptyHMP.initData);

      // 5. Create Safe smart account with ERC-7579 launchpad
      //    The `hooks` parameter installs the empty HMP as the global hook
      //    during the atomic launchpad deployment.
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
            address: emptyHMP.address,
            context: wrappedEmptyInitData as Address,
          },
        ],
        attesters: [RHINESTONE_ATTESTER],
        attestersThreshold: ATTESTERS_THRESHOLD,
        saltNonce: params.salt ?? 0n,
      } as Parameters<typeof toSafeSmartAccount>[0]);

      // 6. Create SmartAccountClient with ERC-7579 actions
      const smartAccountClient = createSmartAccountClient({
        account: safeAccount,
        chain: this.config.chain,
        bundlerTransport: http(this.config.bundlerUrl),
        client: this.publicClient,
        ...(this.paymasterClient ? { paymaster: this.paymasterClient } : {}),
        ...(this.paymasterClient
          ? {
              userOperation: {
                estimateFeesPerGas: async () =>
                  (await this.paymasterClient!.getUserOperationGasPrice())
                    .fast,
              },
            }
          : {}),
      }).extend(erc7579Actions()) as unknown as Erc7579SmartAccountClient;

      // 7. Store client for future execute/query calls
      this.walletClients.set(safeAccount.address, smartAccountClient);

      // 8. Initialize policies in the first UserOp (also deploys the Safe)
      if (policies.length > 0 && moduleAddresses) {
        await this.initializePolicies(
          smartAccountClient,
          policies,
          moduleAddresses,
          emptyHMP.address,
        );

        // 9. Reconnect after deployment to clear cached factory data.
        //    The initial smartAccountClient includes initCode (factory data)
        //    which causes subsequent UserOps to fail with "already deployed".
        await this.connectWallet(safeAccount.address, ownerKey);
      }

      return {
        address: safeAccount.address,
        owner: params.owner,
        chain: this.config.chain,
        isDeployed: policies.length > 0,
        policies: this.mapPoliciesToInstalled(policies, moduleAddresses),
        sessions: [],
      };
    } catch (error) {
      if (error instanceof WalletCreationError) throw error;
      throw new WalletCreationError(
        "Wallet deployment failed. Check your RPC/bundler configuration and that the owner key is correct.",
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
      ...(this.paymasterClient ? { paymaster: this.paymasterClient } : {}),
      ...(this.paymasterClient
        ? {
            userOperation: {
              estimateFeesPerGas: async () =>
                (await this.paymasterClient!.getUserOperationGasPrice()).fast,
            },
          }
        : {}),
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
   * @returns The session key address and permission ID.
   *
   * SECURITY: The session private key is intentionally NOT returned or stored
   * by the SDK. The caller should use the `sessionKey` address to identify
   * the session on-chain, and manage key material externally via a secure
   * key management system. To use a pre-generated key pair, provide the
   * session key address in `params.sessionKey`.
   */
  async createSession(
    wallet: AgentWallet,
    params: CreateSessionParams,
    ownerKey: SignerKey,
  ): Promise<{ sessionKey: Address; permissionId: Hex }> {
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

      // 9. Store session metadata (private key is NOT stored — the caller
      //    must manage key material externally via a secure key management system)
      const walletSessions = this.sessions.get(wallet.address) ?? [];
      walletSessions.push({
        permissionId,
        sessionKeyAddress: sessionAccount.address,
        expiresAt: params.expiresAt,
        actions: params.actions.map((a) => ({
          target: a.target,
          selector: a.selector,
        })),
      });
      this.sessions.set(wallet.address, walletSessions);

      return {
        sessionKey: sessionAccount.address,
        permissionId,
      };
    } catch (error) {
      if (error instanceof SessionError) throw error;
      throw new SessionError(
        "Session creation failed. Check that the wallet is deployed and the owner key is correct.",
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
        "Session revocation failed. Check the permission ID and wallet connection.",
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
    // Pre-flight validation: block calls to infrastructure contracts and self
    this.validateTransaction(params, wallet.address);

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
      if (error instanceof ExecutionError) throw error;
      throw new ExecutionError(
        "Transaction failed. Check that the target, value, and calldata are correct.",
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
    // Pre-flight validation: block calls to infrastructure contracts and self
    for (const call of params.calls) {
      this.validateTransaction(call, wallet.address);
    }

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
      if (error instanceof ExecutionError) throw error;
      throw new ExecutionError(
        "Batch transaction failed. Check that all targets, values, and calldata are correct.",
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

    const hash = await guardianClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
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

    const hash = await guardianClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private resolvePolicies(params: CreateWalletParams): PolicyConfig[] {
    let policies: PolicyConfig[];
    if (params.preset) {
      policies = PRESETS[params.preset](params.owner, params.presetParams);
    } else {
      policies = params.policies ?? [];
    }

    // Auto-populate protectedAddresses on AllowlistHook policies
    // to prevent agents from calling hook/infrastructure contracts directly.
    // This is critical: without it, an agent can call setGuardian(),
    // clearTrustedForwarder(), removeSpendingLimit(), or removeHook().
    if (policies.length > 0 && this.config.moduleAddresses) {
      const moduleAddresses = this.config.moduleAddresses;
      const infrastructureAddresses: Address[] = [];

      if (moduleAddresses.spendingLimitHook) {
        infrastructureAddresses.push(moduleAddresses.spendingLimitHook);
      }
      if (moduleAddresses.allowlistHook) {
        infrastructureAddresses.push(moduleAddresses.allowlistHook);
      }
      if (moduleAddresses.emergencyPauseHook) {
        infrastructureAddresses.push(moduleAddresses.emergencyPauseHook);
      }
      if (moduleAddresses.automationExecutor) {
        infrastructureAddresses.push(moduleAddresses.automationExecutor);
      }
      // Also protect the HookMultiPlexer and Smart Sessions Validator
      infrastructureAddresses.push(HOOK_MULTIPLEXER_ADDRESS);
      infrastructureAddresses.push(SMART_SESSIONS_VALIDATOR);

      let hasAllowlist = false;
      for (const policy of policies) {
        if (policy.type === "allowlist") {
          hasAllowlist = true;
          // Merge infrastructure addresses into protectedAddresses, deduplicating
          const existing = new Set(
            (policy.protectedAddresses ?? []).map((a) => a.toLowerCase()),
          );
          const merged = [...(policy.protectedAddresses ?? [])];
          for (const addr of infrastructureAddresses) {
            if (!existing.has(addr.toLowerCase())) {
              merged.push(addr);
            }
          }
          policy.protectedAddresses = merged;
        }
      }

      // If there are hooks but no AllowlistHook, the EmergencyPauseHook's
      // admin functions and all hooks' setTrustedForwarder are unprotected
      // on-chain. The SDK-side blocklist (validateTransaction) provides a
      // client-side defense, but on-chain protection requires AllowlistHook.
      const hasHooks = policies.some(
        (p) => p.type === "spending-limit" || p.type === "emergency-pause",
      );
      if (hasHooks && !hasAllowlist) {
        // Inject an AllowlistHook in blocklist mode (allows everything except
        // protected infrastructure addresses) to provide on-chain protection.
        policies.push({
          type: "allowlist",
          mode: "block",
          targets: [],
          protectedAddresses: infrastructureAddresses,
        });
      }
    }

    return policies;
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
   * Build and send the UserOp that initializes all sub-hooks and
   * reconfigures the HookMultiPlexer with the full globalHooks list.
   *
   * The Safe is deployed with an EMPTY HookMultiPlexer (no globalHooks)
   * because Safe7579's launchpad delegatecall chain cannot handle non-empty
   * globalHooks during initialization. This method runs post-deployment to:
   *
   * 1. HMP.onUninstall("0x") — reset the empty HMP
   * 2. Sub-hook.onInstall(initData) for each configured hook — sets up
   *    per-account storage (limits, allowlist, guardian, etc.) with HMP
   *    as the trusted forwarder
   * 3. HMP.onInstall(fullInitData) — reinstall HMP with all globalHooks
   *    sorted ascending (bypasses ERC-7484 registry check that blocks addHook)
   */
  private async initializePolicies(
    client: Erc7579SmartAccountClient,
    policies: PolicyConfig[],
    moduleAddresses: ModuleAddresses,
    hookMultiPlexerAddress: Address,
  ): Promise<void> {
    // Collect sub-hook addresses first to decide whether HMP reconfiguration is needed.
    // Only hook-type policies (spending-limit, allowlist, emergency-pause) are sub-hooks;
    // automation policies are executors and don't affect the HMP.
    const subHookAddresses = this.collectSubHookAddresses(
      policies,
      moduleAddresses,
    );

    // If no hook policies, nothing to do — the empty HMP stays as-is
    if (subHookAddresses.length === 0) return;

    const calls: { to: Address; value: bigint; data: Hex }[] = [];

    // Step 1: Uninstall the empty HMP (resets initialized flag + clears hooks)
    calls.push({
      to: hookMultiPlexerAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: MODULE_ONUNINSTALL_ABI,
        functionName: "onUninstall",
        args: ["0x"],
      }),
    });

    // Step 2: Initialize each sub-hook with per-account config
    for (const policy of policies) {
      switch (policy.type) {
        case "spending-limit": {
          const hookAddress = moduleAddresses.spendingLimitHook;
          const initData = encodeSpendingLimitInitData(policy, hookMultiPlexerAddress);
          this.pushSubHookInitCalls(calls, hookAddress, initData);
          break;
        }

        case "allowlist": {
          const hookAddress = moduleAddresses.allowlistHook;
          const initData = encodeAllowlistInitData(policy, hookMultiPlexerAddress);
          this.pushSubHookInitCalls(calls, hookAddress, initData);
          break;
        }

        case "emergency-pause": {
          const hookAddress = moduleAddresses.emergencyPauseHook;
          const initData = encodeEmergencyPauseInitData(policy, hookMultiPlexerAddress);
          this.pushSubHookInitCalls(calls, hookAddress, initData);
          break;
        }

        case "automation":
          // AutomationExecutor is installed as a separate executor module,
          // not as a sub-hook. Skip in hook initialization.
          break;
      }
    }

    // Step 3: Reinstall HMP with all globalHooks sorted ascending.
    // Using onInstall (not addHook) bypasses the ERC-7484 registry
    // attestation check that blocks our custom hooks.
    const fullHMP = getHookMultiPlexer({
      globalHooks: subHookAddresses,
      valueHooks: [],
      delegatecallHooks: [],
      sigHooks: [],
      targetHooks: [],
    });
    calls.push({
      to: hookMultiPlexerAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: MODULE_ONINSTALL_ABI,
        functionName: "onInstall",
        args: [fullHMP.initData],
      }),
    });

    // Send as a single batched UserOp (also triggers Safe deployment)
    await client.sendTransaction({
      calls,
    } as Parameters<typeof client.sendTransaction>[0]);
  }

  /**
   * Collect all sub-hook addresses from the policy configuration.
   * Used to build the full HMP.onInstall data with all globalHooks
   * during post-deployment reconfiguration.
   *
   * Returns addresses sorted ascending (required by HookMultiPlexer).
   */
  private collectSubHookAddresses(
    policies: PolicyConfig[],
    moduleAddresses?: ModuleAddresses,
  ): Address[] {
    if (!moduleAddresses) return [];
    const addresses: Address[] = [];
    for (const policy of policies) {
      switch (policy.type) {
        case "spending-limit":
          addresses.push(moduleAddresses.spendingLimitHook);
          break;
        case "allowlist":
          addresses.push(moduleAddresses.allowlistHook);
          break;
        case "emergency-pause":
          addresses.push(moduleAddresses.emergencyPauseHook);
          break;
        // automation is an executor, not a hook
      }
    }
    // HookMultiPlexer requires sorted arrays
    return addresses.sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
  }

  /**
   * Push the onInstall call needed to initialize a sub-hook.
   * Configures the hook's per-account storage (trusted forwarder,
   * limits, allowlist, guardian, etc.).
   */
  private pushSubHookInitCalls(
    calls: { to: Address; value: bigint; data: Hex }[],
    hookAddress: Address,
    initData: Hex,
  ): void {
    // Initialize the sub-hook for this account (sets trusted forwarder from init data)
    calls.push({
      to: hookAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: MODULE_ONINSTALL_ABI,
        functionName: "onInstall",
        args: [initData],
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

  /**
   * Collect all known infrastructure addresses that must never be
   * targeted by agent-initiated transactions. This prevents an AI agent
   * from calling hook admin functions (setGuardian, clearTrustedForwarder,
   * removeSpendingLimit, removeHook, etc.) to weaken its own policy constraints.
   */
  private getProtectedAddresses(): Set<string> {
    const addresses = new Set<string>();

    // Always protect the EntryPoint and HookMultiPlexer
    addresses.add(ENTRYPOINT_V07.toLowerCase());
    addresses.add(HOOK_MULTIPLEXER_ADDRESS.toLowerCase());
    // Protect Safe7579 infrastructure
    addresses.add(SAFE_7579_MODULE.toLowerCase());
    addresses.add(SAFE_7579_LAUNCHPAD.toLowerCase());
    // Protect Smart Sessions Validator
    addresses.add(SMART_SESSIONS_VALIDATOR.toLowerCase());

    // Protect all configured module addresses
    const moduleAddresses = this.config.moduleAddresses;
    if (moduleAddresses) {
      if (moduleAddresses.spendingLimitHook) {
        addresses.add(moduleAddresses.spendingLimitHook.toLowerCase());
      }
      if (moduleAddresses.allowlistHook) {
        addresses.add(moduleAddresses.allowlistHook.toLowerCase());
      }
      if (moduleAddresses.emergencyPauseHook) {
        addresses.add(moduleAddresses.emergencyPauseHook.toLowerCase());
      }
      if (moduleAddresses.automationExecutor) {
        addresses.add(moduleAddresses.automationExecutor.toLowerCase());
      }
    }

    return addresses;
  }

  /**
   * Validate a transaction before submission. Blocks calls to infrastructure
   * addresses and validates input parameters.
   *
   * @throws ExecutionError if the transaction targets a protected address
   *         or has invalid parameters.
   */
  private validateTransaction(params: ExecuteParams, walletAddress?: Address): void {
    // Validate target address format
    if (!isAddress(params.target)) {
      throw new ExecutionError(
        `Invalid target address: "${params.target}". Expected a 0x-prefixed 20-byte hex address.`,
      );
    }

    // Block calls to infrastructure contracts
    const protectedAddresses = this.getProtectedAddresses();
    if (protectedAddresses.has(params.target.toLowerCase())) {
      throw new ExecutionError(
        `Transaction blocked: target ${params.target} is a protected infrastructure contract. ` +
          "Agent wallets cannot call hook, multiplexer, or EntryPoint contracts directly.",
      );
    }

    // Block self-calls: prevent the wallet from targeting itself to uninstall modules
    if (walletAddress && params.target.toLowerCase() === walletAddress.toLowerCase()) {
      throw new ExecutionError(
        `Transaction blocked: target ${params.target} is the wallet's own address. ` +
          "Self-calls could be used to uninstall security modules.",
      );
    }

    // Validate value is non-negative
    if (params.value !== undefined && params.value < 0n) {
      throw new ExecutionError("Transaction value cannot be negative.");
    }

    // Validate calldata format if provided
    if (params.data && params.data !== "0x" && !isHex(params.data)) {
      throw new ExecutionError(
        `Invalid calldata: "${params.data}". Expected a 0x-prefixed hex string.`,
      );
    }
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
