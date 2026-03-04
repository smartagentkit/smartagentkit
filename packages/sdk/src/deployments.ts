import type { Address } from "viem";
import type { ModuleAddresses } from "./types.js";
import { pluginRegistry } from "./plugins/index.js";
import baseSepoliaDeployment from "./deployments/base-sepolia.json";
import sepoliaDeployment from "./deployments/sepolia.json";

/**
 * Built-in deployment addresses per chain.
 *
 * Populated automatically by `deploy.sh` after contract deployment.
 * When addresses are available, the SDK can auto-resolve them by chain ID,
 * removing the need to manually specify `moduleAddresses` in config.
 */
export const DEPLOYMENTS: Record<number, ModuleAddresses> = {};

interface DeploymentJson {
  chainId: number;
  spendingLimitHook: string;
  allowlistHook: string;
  emergencyPauseHook: string;
  automationExecutor: string;
  [key: string]: unknown;
}

/** Map from JSON field name to plugin ID */
const DEPLOYMENT_FIELD_TO_PLUGIN: Record<string, string> = {
  spendingLimitHook: "spending-limit",
  allowlistHook: "allowlist",
  emergencyPauseHook: "emergency-pause",
  automationExecutor: "automation",
};

function loadDeployment(json: DeploymentJson): void {
  // Only register if addresses are actually populated (non-empty)
  if (json.spendingLimitHook && json.spendingLimitHook !== "") {
    DEPLOYMENTS[json.chainId] = {
      spendingLimitHook: json.spendingLimitHook as Address,
      allowlistHook: json.allowlistHook as Address,
      emergencyPauseHook: json.emergencyPauseHook as Address,
      automationExecutor: (json.automationExecutor || undefined) as
        | Address
        | undefined,
    };

    // Also populate plugin defaultAddresses via registry
    for (const [field, pluginId] of Object.entries(DEPLOYMENT_FIELD_TO_PLUGIN)) {
      const addr = json[field] as string;
      if (addr && addr !== "") {
        pluginRegistry.setDefaultAddress(pluginId, json.chainId, addr as Address);
      }
    }
  }
}

loadDeployment(baseSepoliaDeployment as DeploymentJson);
loadDeployment(sepoliaDeployment as DeploymentJson);
