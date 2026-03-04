/**
 * Example custom policy plugin: TargetBlockerPlugin
 *
 * A minimal ERC-7579 hook plugin that blocks calls to a single target address.
 * Demonstrates the full PolicyPlugin interface.
 *
 * In production, you'd deploy a Solidity contract that implements
 * ERC7579HookDestruct and checks `target != blocked[msg.sender]` in preCheck.
 * This plugin defines the SDK-side encoding and validation.
 */

import { encodeAbiParameters, parseAbiParameters, type Address, type Hex } from "viem";
import { PolicyConfigError } from "@smartagentkit/sdk";
import type { PolicyPlugin } from "@smartagentkit/sdk";

/** Config type for the TargetBlockerPlugin */
export interface TargetBlockerConfig {
  type: "target-blocker";
  /** Address to block all calls to */
  blockedTarget: Address;
}

/**
 * Plugin definition for a custom TargetBlocker hook.
 *
 * On-chain, the hook's preCheck would compare the call target against
 * the stored blocked address and revert if they match.
 */
export const targetBlockerPlugin: PolicyPlugin<TargetBlockerConfig> = {
  id: "target-blocker",
  name: "TargetBlockerHook",
  moduleType: "hook",
  isInfrastructure: false, // Not an SDK infrastructure contract
  abi: [
    {
      name: "blocked",
      type: "function",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "target", type: "address" }],
      stateMutability: "view",
    },
  ],

  encodeInitData(config: TargetBlockerConfig, trustedForwarder: Address): Hex {
    // Matches: abi.decode(data, (address, address))
    return encodeAbiParameters(
      parseAbiParameters("address trustedForwarder, address blockedTarget"),
      [trustedForwarder, config.blockedTarget],
    );
  },

  validateConfig(config: TargetBlockerConfig): void {
    if (!config.blockedTarget) {
      throw new PolicyConfigError("blockedTarget is required for target-blocker plugin");
    }
    if (config.blockedTarget === "0x0000000000000000000000000000000000000000") {
      throw new PolicyConfigError("blockedTarget cannot be the zero address");
    }
  },

  toInstalledPolicy(_config: TargetBlockerConfig, moduleAddress: Address) {
    return {
      moduleAddress,
      moduleType: 4, // hook
      name: "TargetBlockerHook",
    };
  },
};
