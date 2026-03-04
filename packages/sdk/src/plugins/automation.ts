import type { Address, Hex } from "viem";
import type { PolicyPlugin } from "./types.js";
import type { AutomationPolicy } from "../types.js";
import { PolicyConfigError } from "../errors.js";
import { MODULE_TYPE_EXECUTOR } from "../constants.js";

export const automationPlugin: PolicyPlugin<AutomationPolicy> = {
  id: "automation",
  name: "AutomationExecutor",
  moduleType: "executor",
  isInfrastructure: true,
  abi: [],

  encodeInitData(_config: AutomationPolicy, _trustedForwarder: Address): Hex {
    throw new PolicyConfigError(
      "AutomationExecutor encoding is not yet implemented",
    );
  },

  validateConfig(_config: AutomationPolicy): void {
    // No validation yet — encoding not implemented
  },

  toInstalledPolicy(_config: AutomationPolicy, moduleAddress: Address) {
    return {
      moduleAddress,
      moduleType: MODULE_TYPE_EXECUTOR,
      name: "AutomationExecutor",
    };
  },
};
