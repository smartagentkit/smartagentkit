import { type Address, type Hex, encodeAbiParameters, parseAbiParameters } from "viem";
import type {
  PolicyConfig,
  SpendingLimitPolicy,
  AllowlistPolicy,
  EmergencyPausePolicy,
  AutomationPolicy,
} from "./types.js";
import { PolicyConfigError } from "./errors.js";
import { MODULE_TYPE_HOOK } from "./constants.js";

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
 * The encoded data matches the Solidity `onInstall` decoder for each module:
 *
 * - **SpendingLimitHook:** `abi.encode(address trustedForwarder, TokenLimitInit[])` where each entry is
 *   `(address token, uint256 limit, uint48 windowDuration)`
 *
 * - **AllowlistHook:** `abi.encode(address trustedForwarder, uint8 mode, TargetPermission[], address[] protectedAddresses)`
 *   where each permission is `(address target, bytes4 selector)` and protectedAddresses are infrastructure contracts
 *
 * - **EmergencyPauseHook:** `abi.encode(address trustedForwarder, address guardian, uint48 autoUnpauseAfter)`
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
  },
  trustedForwarder: Address = "0x0000000000000000000000000000000000000000",
): EncodedPolicy {
  const zeroAddress: Address = "0x0000000000000000000000000000000000000000";

  switch (policy.type) {
    case "spending-limit":
      return {
        moduleAddress: moduleAddresses?.spendingLimitHook ?? zeroAddress,
        moduleType: MODULE_TYPE_HOOK,
        initData: encodeSpendingLimitInitData(policy, trustedForwarder),
      };

    case "allowlist":
      return {
        moduleAddress: moduleAddresses?.allowlistHook ?? zeroAddress,
        moduleType: MODULE_TYPE_HOOK,
        initData: encodeAllowlistInitData(policy, trustedForwarder),
      };

    case "emergency-pause":
      return {
        moduleAddress: moduleAddresses?.emergencyPauseHook ?? zeroAddress,
        moduleType: MODULE_TYPE_HOOK,
        initData: encodeEmergencyPauseInitData(policy, trustedForwarder),
      };

    case "automation":
      throw new PolicyConfigError(
        "AutomationExecutor encoding is not yet implemented (Sprint 2)",
      );

    default: {
      const _exhaustive: never = policy;
      throw new PolicyConfigError(
        `Unknown policy type: ${(_exhaustive as PolicyConfig).type}`,
      );
    }
  }
}

// ─── Per-Module Encoders ───────────────────────────────────────

/**
 * Encode SpendingLimitHook init data.
 *
 * Solidity: `abi.decode(data, (address, TokenLimitInit[]))`
 * where `TokenLimitInit` is `(address token, uint256 limit, uint48 windowDuration)`
 */
export function encodeSpendingLimitInitData(
  policy: SpendingLimitPolicy,
  trustedForwarder: Address = "0x0000000000000000000000000000000000000000",
): Hex {
  if (policy.limits.length === 0) {
    throw new PolicyConfigError("SpendingLimitPolicy must have at least one token limit");
  }

  // Check for duplicate tokens
  const seenTokens = new Set<string>();
  for (const limit of policy.limits) {
    const tokenKey = limit.token.toLowerCase();
    if (seenTokens.has(tokenKey)) {
      throw new PolicyConfigError(
        `Duplicate token address in limits: ${limit.token}. Only one limit per token is supported.`,
      );
    }
    seenTokens.add(tokenKey);
    if (limit.limit <= 0n) {
      throw new PolicyConfigError("Token limit must be greater than zero");
    }
    if (limit.window < 60) {
      throw new PolicyConfigError("Window duration must be at least 60 seconds");
    }
  }

  // Encode as: abi.encode(address, (address, uint256, uint48)[])
  // This matches the Solidity onInstall decoder
  return encodeAbiParameters(
    parseAbiParameters(
      "address trustedForwarder, (address token, uint256 limit, uint48 windowDuration)[]",
    ),
    [
      trustedForwarder,
      policy.limits.map((l) => ({
        token: l.token,
        limit: l.limit,
        windowDuration: l.window,
      })),
    ],
  );
}

/**
 * Encode AllowlistHook init data.
 *
 * Solidity: `abi.decode(data, (address, uint8, TargetPermission[], address[]))`
 * where `TargetPermission` is `(address target, bytes4 selector)`
 * and mode 0 = ALLOWLIST, 1 = BLOCKLIST
 *
 * The protectedAddresses array should include all infrastructure contract addresses
 * (other hooks, HookMultiPlexer, AutomationExecutor) that must never be callable
 * as execution targets, regardless of mode.
 *
 * NOTE: The wildcard selector is 0x431e2cf5 (keccak256("WILDCARD") truncated to 4 bytes).
 * Do NOT use 0x00000000 as wildcard — that represents empty calldata (ETH transfers).
 */
export function encodeAllowlistInitData(
  policy: AllowlistPolicy,
  trustedForwarder: Address = "0x0000000000000000000000000000000000000000",
): Hex {
  if (policy.mode === "allow" && policy.targets.length === 0) {
    throw new PolicyConfigError(
      "AllowlistPolicy in 'allow' mode must have at least one target. " +
        "An empty allowlist would block all transactions.",
    );
  }

  const mode = policy.mode === "allow" ? 0 : 1;
  const wildcardSelector: Hex = "0x431e2cf5"; // bytes4(keccak256("WILDCARD"))
  const protectedAddresses: Address[] = policy.protectedAddresses ?? [];

  if (protectedAddresses.length > 20) {
    throw new PolicyConfigError(
      "AllowlistPolicy protectedAddresses cannot exceed 20 entries (on-chain MAX_PROTECTED_ADDRESSES limit)",
    );
  }

  // For targets with no selector (wildcard), register BOTH the wildcard
  // selector and 0x00000000 (plain ETH transfer). The on-chain AllowlistHook
  // checks the exact selector extracted from calldata — for empty calldata
  // (plain ETH sends), the extracted selector is 0x00000000, not the wildcard.
  const ethTransferSelector: Hex = "0x00000000";
  const encodedTargets: { target: Address; selector: `0x${string}` }[] = [];
  for (const t of policy.targets) {
    if (t.selector) {
      // Explicit selector — single entry
      encodedTargets.push({ target: t.address, selector: t.selector as `0x${string}` });
    } else {
      // Wildcard — register both wildcard and plain ETH transfer selectors
      encodedTargets.push({ target: t.address, selector: wildcardSelector as `0x${string}` });
      encodedTargets.push({ target: t.address, selector: ethTransferSelector as `0x${string}` });
    }
  }

  // Encode as: abi.encode(address, uint8, (address, bytes4)[], address[])
  return encodeAbiParameters(
    parseAbiParameters(
      "address trustedForwarder, uint8 mode, (address target, bytes4 selector)[], address[] protectedAddresses",
    ),
    [
      trustedForwarder,
      mode,
      encodedTargets,
      protectedAddresses,
    ],
  );
}

/**
 * Encode EmergencyPauseHook init data.
 *
 * Solidity: `abi.decode(data, (address, address, uint48))`
 * trustedForwarder + guardian address + autoUnpauseAfter in seconds
 */
export function encodeEmergencyPauseInitData(
  policy: EmergencyPausePolicy,
  trustedForwarder: Address = "0x0000000000000000000000000000000000000000",
): Hex {
  if (policy.guardian === "0x0000000000000000000000000000000000000000") {
    throw new PolicyConfigError("Guardian address cannot be the zero address");
  }

  return encodeAbiParameters(
    parseAbiParameters("address trustedForwarder, address guardian, uint48 autoUnpauseAfter"),
    [trustedForwarder, policy.guardian, policy.autoUnpauseAfter ?? 0],
  );
}
