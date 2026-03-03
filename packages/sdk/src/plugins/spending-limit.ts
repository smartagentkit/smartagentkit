import { type Address, type Hex, encodeAbiParameters, parseAbiParameters } from "viem";
import type { PolicyPlugin } from "./types.js";
import type { SpendingLimitPolicy } from "../types.js";
import { PolicyConfigError } from "../errors.js";
import { MODULE_TYPE_HOOK, SPENDING_LIMIT_HOOK_ABI } from "../constants.js";

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
  validateSpendingLimitConfig(policy);

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

function validateSpendingLimitConfig(policy: SpendingLimitPolicy): void {
  if (policy.limits.length === 0) {
    throw new PolicyConfigError("SpendingLimitPolicy must have at least one token limit");
  }

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
}

export const spendingLimitPlugin: PolicyPlugin<SpendingLimitPolicy> = {
  id: "spending-limit",
  name: "SpendingLimitHook",
  moduleType: "hook",
  isInfrastructure: true,
  abi: SPENDING_LIMIT_HOOK_ABI as unknown as readonly Record<string, unknown>[],

  encodeInitData(config: SpendingLimitPolicy, trustedForwarder: Address): Hex {
    return encodeSpendingLimitInitData(config, trustedForwarder);
  },

  validateConfig(config: SpendingLimitPolicy): void {
    validateSpendingLimitConfig(config);
  },

  toInstalledPolicy(config: SpendingLimitPolicy, moduleAddress: Address) {
    return {
      moduleAddress,
      moduleType: MODULE_TYPE_HOOK,
      name: "SpendingLimitHook",
    };
  },
};
