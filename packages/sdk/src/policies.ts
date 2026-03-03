import type { Address, Hex } from "viem";
import type { PolicyConfig } from "./types.js";
import { PolicyConfigError } from "./errors.js";
import { pluginRegistry } from "./plugins/index.js";

// ─── Exported Types ────────────────────────────────────────────

export interface EncodedPolicy {
  moduleAddress: Address;
  moduleType: number;
  initData: Hex;
}

// ─── Main Encoder ──────────────────────────────────────────────

/**
 * Encode a policy configuration into the format needed for module installation.
 *
 * Delegates to the plugin registry to find the appropriate encoder for
 * each policy type. Custom plugins registered via `pluginRegistry.register()`
 * are automatically supported.
 *
 * @param policy - The policy configuration to encode.
 * @param moduleAddresses - Optional map of module addresses per chain. If not
 *        provided, module addresses will be set to zero (for SDK-level
 *        configuration before deployment addresses are known).
 * @param trustedForwarder - The HookMultiPlexer address to set as trusted forwarder.
 *        Defaults to zero address (for direct usage without multiplexer).
 * @returns The encoded policy with module address, type, and init data.
 */
export function encodePolicyInitData(
  policy: PolicyConfig,
  moduleAddresses?: {
    spendingLimitHook?: Address;
    allowlistHook?: Address;
    emergencyPauseHook?: Address;
    automationExecutor?: Address;
    customModules?: Record<string, Address>;
  },
  trustedForwarder: Address = "0x0000000000000000000000000000000000000000",
): EncodedPolicy {
  const zeroAddress: Address = "0x0000000000000000000000000000000000000000";
  const plugin = pluginRegistry.get(policy.type);

  // Resolve module address: legacy named field > customModules > default
  const legacyAddress = moduleAddresses?.[policyTypeToAddressKey(policy.type) as keyof typeof moduleAddresses] as Address | undefined;
  const customAddress = moduleAddresses?.customModules?.[policy.type];
  const moduleAddress = legacyAddress ?? customAddress ?? zeroAddress;

  return {
    moduleAddress,
    moduleType: moduleTypeToNumber(plugin.moduleType),
    initData: plugin.encodeInitData(policy, trustedForwarder),
  };
}

// ─── Per-Module Encoders (backward-compatible re-exports) ─────

export { encodeSpendingLimitInitData } from "./plugins/spending-limit.js";
export { encodeAllowlistInitData } from "./plugins/allowlist.js";
export { encodeEmergencyPauseInitData } from "./plugins/emergency-pause.js";

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Map plugin IDs to legacy ModuleAddresses field names.
 * Used for backward compatibility when resolving addresses.
 */
export function policyTypeToAddressKey(policyType: string): string {
  switch (policyType) {
    case "spending-limit":
      return "spendingLimitHook";
    case "allowlist":
      return "allowlistHook";
    case "emergency-pause":
      return "emergencyPauseHook";
    case "automation":
      return "automationExecutor";
    default:
      return policyType;
  }
}

function moduleTypeToNumber(moduleType: string): number {
  switch (moduleType) {
    case "validator":
      return 1;
    case "executor":
      return 2;
    case "fallback":
      return 3;
    case "hook":
      return 4;
    default:
      return 0;
  }
}
