import type { Address } from "viem";
import type { ModuleAddresses } from "./types.js";
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
  }
}

loadDeployment(baseSepoliaDeployment as DeploymentJson);
loadDeployment(sepoliaDeployment as DeploymentJson);
