export { SmartAgentKitClient } from "./client.js";
export type {
  SmartAgentKitConfig,
  AgentWallet,
  CreateWalletParams,
  PolicyConfig,
  SpendingLimitPolicy,
  AllowlistPolicy,
  EmergencyPausePolicy,
  AutomationPolicy,
  TokenLimit,
  TargetPermission,
  PresetName,
  CreateSessionParams,
  SessionAction,
  SessionRule,
  ActiveSession,
  ExecuteParams,
  ExecuteBatchParams,
  InstalledPolicy,
  InstallPolicyParams,
  InstallRawParams,
  ModuleAddresses,
  SignerKey,
  MnemonicCredential,
  ISmartAgentKitClient,
} from "./types.js";
export { PRESETS } from "./presets.js";
export {
  encodePolicyInitData,
  encodeSpendingLimitInitData,
  encodeAllowlistInitData,
  encodeEmergencyPauseInitData,
} from "./policies.js";
export type { EncodedPolicy } from "./policies.js";
// ─── Plugin Architecture ─────────────────────────────────────
export type { PolicyPlugin, ModuleType } from "./plugins/types.js";
export {
  PolicyPluginRegistry,
  pluginRegistry,
} from "./plugins/registry.js";
export {
  spendingLimitPlugin,
  allowlistPlugin,
  emergencyPausePlugin,
  automationPlugin,
} from "./plugins/index.js";
export {
  NATIVE_TOKEN,
  ENTRYPOINT_V07,
  SAFE_7579_MODULE,
  SAFE_7579_LAUNCHPAD,
  RHINESTONE_ATTESTER,
  MODULE_TYPE_HOOK,
  MODULE_TYPE_VALIDATOR,
  MODULE_TYPE_EXECUTOR,
  MODULE_TYPE_FALLBACK,
  MODULE_ADDRESSES,
  HOOK_MULTIPLEXER_ADDRESS,
  HOOK_TYPE_GLOBAL,
  WINDOW_1_HOUR,
  WINDOW_1_DAY,
  WINDOW_1_WEEK,
  SPENDING_LIMIT_HOOK_ABI,
  ALLOWLIST_HOOK_ABI,
  EMERGENCY_PAUSE_HOOK_ABI,
  HOOK_MULTIPLEXER_ABI,
} from "./constants.js";
export { DEPLOYMENTS } from "./deployments.js";
export {
  SmartAgentKitError,
  WalletCreationError,
  PolicyConfigError,
  ExecutionError,
  SpendingLimitExceededError,
  WalletPausedError,
  SessionError,
} from "./errors.js";
export {
  buildSession,
  getSmartSessionsModule,
  computePermissionId,
  encodeUseSessionSignature,
  encodeEnableSessionSignature,
  getRemoveAction as getRemoveSessionAction,
  SMART_SESSIONS_ADDRESS,
  OWNABLE_VALIDATOR_ADDRESS,
  SmartSessionMode,
} from "./sessions.js";
export type {
  Session,
  ActionData,
  PolicyData,
  EnableSessionData,
} from "./sessions.js";
