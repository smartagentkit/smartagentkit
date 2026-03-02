import type { Address } from "viem";

// ─── ERC-7579 Module Types ──────────────────────────────────────

/** ERC-7579 module type: Validator */
export const MODULE_TYPE_VALIDATOR = 1;
/** ERC-7579 module type: Executor */
export const MODULE_TYPE_EXECUTOR = 2;
/** ERC-7579 module type: Fallback */
export const MODULE_TYPE_FALLBACK = 3;
/** ERC-7579 module type: Hook */
export const MODULE_TYPE_HOOK = 4;

// ─── Infrastructure Addresses ────────────────────────────────────

/** Native ETH represented as the zero address */
export const NATIVE_TOKEN: Address =
  "0x0000000000000000000000000000000000000000";

/** ERC-4337 EntryPoint v0.7 (canonical address on all chains) */
export const ENTRYPOINT_V07: Address =
  "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

/** Safe7579 module address (canonical) */
export const SAFE_7579_MODULE: Address =
  "0x7579EE8307284F293B1927136486880611F20002";

/** Safe7579 launchpad address (canonical) */
export const SAFE_7579_LAUNCHPAD: Address =
  "0x7579011aB74c46090561ea277Ba79D510c6C00ff";

/** Rhinestone module registry attester */
export const RHINESTONE_ATTESTER: Address =
  "0x000000333034E9f539ce08819E12c1b8Cb29084d";

/** Smart Sessions Validator (Rhinestone + Biconomy) */
export const SMART_SESSIONS_VALIDATOR: Address =
  "0x00000000002B0eCfbD0496EE71e01257dA0E37DE";

/** Attesters threshold for module installation */
export const ATTESTERS_THRESHOLD = 1;

// ─── Time Constants ──────────────────────────────────────────────

/** Time window constants (in seconds) */
export const WINDOW_1_HOUR = 3_600;
export const WINDOW_1_DAY = 86_400;
export const WINDOW_1_WEEK = 604_800;

// ─── Module ABIs (for SDK interaction) ───────────────────────────

export const SPENDING_LIMIT_HOOK_ABI = [
  {
    name: "setSpendingLimit",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "limit", type: "uint256" },
      { name: "windowDuration", type: "uint48" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "removeSpendingLimit",
    type: "function",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "getRemainingAllowance",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "remaining", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "configs",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [
      { name: "limit", type: "uint256" },
      { name: "spent", type: "uint256" },
      { name: "windowDuration", type: "uint48" },
      { name: "windowStart", type: "uint48" },
    ],
    stateMutability: "view",
  },
] as const;

export const ALLOWLIST_HOOK_ABI = [
  {
    name: "addPermission",
    type: "function",
    inputs: [
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "removePermission",
    type: "function",
    inputs: [
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setMode",
    type: "function",
    inputs: [{ name: "mode", type: "uint8" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "isTargetAllowed",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

export const EMERGENCY_PAUSE_HOOK_ABI = [
  {
    name: "pause",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "unpause",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "isPaused",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "setGuardian",
    type: "function",
    inputs: [{ name: "newGuardian", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setAutoUnpauseTimeout",
    type: "function",
    inputs: [{ name: "timeout", type: "uint48" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ─── HookMultiPlexer (Rhinestone canonical address) ─────────────

/** HookMultiPlexer canonical address (same on all chains) */
export const HOOK_MULTIPLEXER_ADDRESS: Address =
  "0xF6782ed057F95f334D04F0Af1Af4D14fb84DE549";

/** HookType enum matching HookMultiPlexer.sol */
export const HOOK_TYPE_GLOBAL = 0;
export const HOOK_TYPE_DELEGATECALL = 1;
export const HOOK_TYPE_VALUE = 2;
export const HOOK_TYPE_SIG = 3;
export const HOOK_TYPE_TARGET = 4;

// ─── Module Lifecycle ABIs ──────────────────────────────────────

/** ERC-7579 onInstall ABI (common to all modules) */
export const MODULE_ONINSTALL_ABI = [
  {
    name: "onInstall",
    type: "function",
    inputs: [{ name: "data", type: "bytes" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/** ERC-7579 onUninstall ABI (common to all modules) */
export const MODULE_ONUNINSTALL_ABI = [
  {
    name: "onUninstall",
    type: "function",
    inputs: [{ name: "data", type: "bytes" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/** ModuleKit TrustedForwarder.setTrustedForwarder ABI */
export const SET_TRUSTED_FORWARDER_ABI = [
  {
    name: "setTrustedForwarder",
    type: "function",
    inputs: [{ name: "forwarder", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/** HookMultiPlexer.addHook ABI (for GLOBAL/VALUE/DELEGATECALL hooks) */
export const HOOK_MULTIPLEXER_ABI = [
  {
    name: "addHook",
    type: "function",
    inputs: [
      { name: "hook", type: "address" },
      { name: "hookType", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "removeHook",
    type: "function",
    inputs: [
      { name: "hook", type: "address" },
      { name: "hookType", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ─── Deployed Module Addresses ───────────────────────────────────

/**
 * Deployed module addresses per chain.
 *
 * @remarks This record is intentionally empty. After deploying contracts
 * to a specific chain, populate this map or (preferably) supply addresses
 * via `SmartAgentKitConfig.moduleAddresses` at runtime.
 *
 * @internal Exported for advanced usage; most users should configure
 * addresses through SmartAgentKitConfig instead of relying on this map.
 */
export const MODULE_ADDRESSES: Record<
  string,
  {
    hookMultiPlexer: Address;
    spendingLimitHook: Address;
    allowlistHook: Address;
    emergencyPauseHook: Address;
    automationExecutor: Address;
  }
> = {
  // Will be populated after deployment
};
