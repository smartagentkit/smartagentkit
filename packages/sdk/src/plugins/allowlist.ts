import { type Address, type Hex, encodeAbiParameters, parseAbiParameters } from "viem";
import type { PolicyPlugin } from "./types.js";
import type { AllowlistPolicy } from "../types.js";
import { PolicyConfigError } from "../errors.js";
import { MODULE_TYPE_HOOK, ALLOWLIST_HOOK_ABI } from "../constants.js";

/**
 * Encode AllowlistHook init data.
 *
 * Solidity: `abi.decode(data, (address, uint8, TargetPermission[], address[]))`
 * where `TargetPermission` is `(address target, bytes4 selector)`
 * and mode 0 = ALLOWLIST, 1 = BLOCKLIST
 *
 * NOTE: The wildcard selector is 0x431e2cf5 (keccak256("WILDCARD") truncated to 4 bytes).
 * Do NOT use 0x00000000 as wildcard — that represents empty calldata (ETH transfers).
 */
export function encodeAllowlistInitData(
  policy: AllowlistPolicy,
  trustedForwarder: Address = "0x0000000000000000000000000000000000000000",
): Hex {
  validateAllowlistConfig(policy);

  const mode = policy.mode === "allow" ? 0 : 1;
  const wildcardSelector: Hex = "0x431e2cf5";
  const protectedAddresses: Address[] = policy.protectedAddresses ?? [];

  // For targets with no selector (wildcard), register BOTH the wildcard
  // selector and 0x00000000 (plain ETH transfer). The on-chain AllowlistHook
  // checks the exact selector extracted from calldata — for empty calldata
  // (plain ETH sends), the extracted selector is 0x00000000, not the wildcard.
  const ethTransferSelector: Hex = "0x00000000";
  const encodedTargets: { target: Address; selector: `0x${string}` }[] = [];
  for (const t of policy.targets) {
    if (t.selector) {
      encodedTargets.push({ target: t.address, selector: t.selector as `0x${string}` });
    } else {
      encodedTargets.push({ target: t.address, selector: wildcardSelector as `0x${string}` });
      encodedTargets.push({ target: t.address, selector: ethTransferSelector as `0x${string}` });
    }
  }

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

function validateAllowlistConfig(policy: AllowlistPolicy): void {
  if (policy.mode === "allow" && policy.targets.length === 0) {
    throw new PolicyConfigError(
      "AllowlistPolicy in 'allow' mode must have at least one target. " +
        "An empty allowlist would block all transactions.",
    );
  }

  if ((policy.protectedAddresses ?? []).length > 20) {
    throw new PolicyConfigError(
      "AllowlistPolicy protectedAddresses cannot exceed 20 entries (on-chain MAX_PROTECTED_ADDRESSES limit)",
    );
  }
}

export const allowlistPlugin: PolicyPlugin<AllowlistPolicy> = {
  id: "allowlist",
  name: "AllowlistHook",
  moduleType: "hook",
  isInfrastructure: true,
  abi: ALLOWLIST_HOOK_ABI as unknown as readonly Record<string, unknown>[],

  encodeInitData(config: AllowlistPolicy, trustedForwarder: Address): Hex {
    return encodeAllowlistInitData(config, trustedForwarder);
  },

  validateConfig(config: AllowlistPolicy): void {
    validateAllowlistConfig(config);
  },

  toInstalledPolicy(config: AllowlistPolicy, moduleAddress: Address) {
    return {
      moduleAddress,
      moduleType: MODULE_TYPE_HOOK,
      name: "AllowlistHook",
    };
  },
};
