import { parseEther, isAddress, type Address } from "viem";
import type { PolicyConfig, PresetName } from "./types.js";
import { NATIVE_TOKEN, WINDOW_1_DAY, WINDOW_1_WEEK } from "./constants.js";
import { PolicyConfigError } from "./errors.js";

/**
 * Validate preset parameters at runtime.
 * Throws PolicyConfigError if a parameter has the wrong type.
 */
function validatePresetParams(
  presetName: string,
  params: Record<string, unknown>,
  spec: Record<string, string>,
): void {
  for (const [key, expectedType] of Object.entries(spec)) {
    if (params[key] === undefined) continue;
    const value = params[key];
    switch (expectedType) {
      case "bigint":
        if (typeof value !== "bigint") {
          throw new PolicyConfigError(
            `Preset "${presetName}": parameter "${key}" must be a bigint, got ${typeof value}`,
          );
        }
        break;
      case "Address":
        if (typeof value !== "string" || !isAddress(value)) {
          throw new PolicyConfigError(
            `Preset "${presetName}": parameter "${key}" must be a valid Ethereum address`,
          );
        }
        break;
      case "Address[]":
        if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && isAddress(v))) {
          throw new PolicyConfigError(
            `Preset "${presetName}": parameter "${key}" must be an array of valid Ethereum addresses`,
          );
        }
        break;
    }
  }
}

/**
 * Pre-built policy combinations for common agent types.
 *
 * Each preset returns an array of PolicyConfig objects that are
 * installed on the wallet at deployment time.
 */
export const PRESETS: Record<
  PresetName,
  (owner: Address, params?: Record<string, unknown>) => PolicyConfig[]
> = {
  /**
   * DeFi Trader preset:
   *   - Daily spending limit on ETH and stablecoins
   *   - Allowlist of approved DEX contracts
   *   - Emergency pause with owner as guardian
   */
  "defi-trader": (owner, params = {}) => {
    validatePresetParams("defi-trader", params, {
      dailyEthLimit: "bigint",
      guardian: "Address",
      allowedDexes: "Address[]",
    });
    return [
    {
      type: "spending-limit",
      limits: [
        {
          token: NATIVE_TOKEN,
          limit: (params.dailyEthLimit as bigint) ?? parseEther("1"),
          window: WINDOW_1_DAY,
        },
        ...((params.stablecoinLimits as Array<{
          token: Address;
          limit: bigint;
          window: number;
        }>) ?? []),
      ],
    },
    // Only include allowlist if specific DEXes are provided;
    // an empty allowlist in "allow" mode would block all transactions.
    ...((params.allowedDexes as Address[] | undefined)?.length
      ? [
          {
            type: "allowlist" as const,
            mode: "allow" as const,
            targets: (params.allowedDexes as Address[]).map((addr) => ({
              address: addr,
              // Omit selector to use the wildcard (0x431e2cf5) — allows all
              // function calls, not just ETH transfers. 0x00000000 is NOT a
              // wildcard; it only matches empty calldata.
            })),
          },
        ]
      : []),
    {
      type: "emergency-pause",
      guardian: (params.guardian as Address) ?? owner,
      autoUnpauseAfter: WINDOW_1_DAY,
    },
  ];
  },

  /**
   * Treasury Agent preset:
   *   - Lower spending limits with longer windows
   *   - Emergency pause (manual only)
   */
  "treasury-agent": (owner, params = {}) => {
    validatePresetParams("treasury-agent", params, {
      weeklyEthLimit: "bigint",
      guardian: "Address",
    });
    return [
    {
      type: "spending-limit",
      limits: [
        {
          token: NATIVE_TOKEN,
          limit: (params.weeklyEthLimit as bigint) ?? parseEther("5"),
          window: WINDOW_1_WEEK,
        },
      ],
    },
    {
      type: "emergency-pause",
      guardian: (params.guardian as Address) ?? owner,
      autoUnpauseAfter: 0,
    },
  ];
  },

  /**
   * Payment Agent preset:
   *   - Strict spending limits
   *   - Allowlist of approved recipients only
   *   - Emergency pause
   */
  "payment-agent": (owner, params = {}) => {
    validatePresetParams("payment-agent", params, {
      dailyLimit: "bigint",
      guardian: "Address",
      approvedRecipients: "Address[]",
    });
    return [
    {
      type: "spending-limit",
      limits: [
        {
          token: NATIVE_TOKEN,
          limit: (params.dailyLimit as bigint) ?? parseEther("0.1"),
          window: WINDOW_1_DAY,
        },
      ],
    },
    // Only include allowlist if specific recipients are provided;
    // an empty allowlist in "allow" mode would block all transactions.
    ...((params.approvedRecipients as Address[] | undefined)?.length
      ? [
          {
            type: "allowlist" as const,
            mode: "allow" as const,
            targets: (params.approvedRecipients as Address[]).map(
              (addr) => ({
                address: addr,
              }),
            ),
          },
        ]
      : []),
    {
      type: "emergency-pause",
      guardian: (params.guardian as Address) ?? owner,
      autoUnpauseAfter: 3_600,
    },
  ];
  },

  /**
   * Minimal preset:
   *   - Just emergency pause
   *   - For agents that need maximum flexibility with a kill switch
   */
  minimal: (owner, params = {}) => {
    validatePresetParams("minimal", params, {
      guardian: "Address",
    });
    return [
    {
      type: "emergency-pause",
      guardian: (params.guardian as Address) ?? owner,
      autoUnpauseAfter: 0,
    },
  ];
  },
};
