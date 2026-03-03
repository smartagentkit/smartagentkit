import { type Address, type Hex, encodeAbiParameters, parseAbiParameters } from "viem";
import type { PolicyPlugin } from "./types.js";
import type { EmergencyPausePolicy } from "../types.js";
import { PolicyConfigError } from "../errors.js";
import { MODULE_TYPE_HOOK, EMERGENCY_PAUSE_HOOK_ABI } from "../constants.js";

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
  validateEmergencyPauseConfig(policy);

  return encodeAbiParameters(
    parseAbiParameters("address trustedForwarder, address guardian, uint48 autoUnpauseAfter"),
    [trustedForwarder, policy.guardian, policy.autoUnpauseAfter ?? 0],
  );
}

function validateEmergencyPauseConfig(policy: EmergencyPausePolicy): void {
  if (policy.guardian === "0x0000000000000000000000000000000000000000") {
    throw new PolicyConfigError("Guardian address cannot be the zero address");
  }
}

export const emergencyPausePlugin: PolicyPlugin<EmergencyPausePolicy> = {
  id: "emergency-pause",
  name: "EmergencyPauseHook",
  moduleType: "hook",
  isInfrastructure: true,
  abi: EMERGENCY_PAUSE_HOOK_ABI as unknown as readonly Record<string, unknown>[],

  encodeInitData(config: EmergencyPausePolicy, trustedForwarder: Address): Hex {
    return encodeEmergencyPauseInitData(config, trustedForwarder);
  },

  validateConfig(config: EmergencyPausePolicy): void {
    validateEmergencyPauseConfig(config);
  },

  toInstalledPolicy(config: EmergencyPausePolicy, moduleAddress: Address) {
    return {
      moduleAddress,
      moduleType: MODULE_TYPE_HOOK,
      name: "EmergencyPauseHook",
    };
  },
};
