import type { Address, Hex } from "viem";

/**
 * ERC-7579 module type identifiers used by plugins.
 */
export type ModuleType = "hook" | "executor" | "validator" | "fallback";

/**
 * A self-contained policy plugin that defines encoding, validation,
 * and metadata for an ERC-7579 module. Built-in policies (spending-limit,
 * allowlist, emergency-pause) are plugins; custom plugins can be registered
 * by SDK consumers.
 *
 * @typeParam TConfig - The configuration type for this plugin (e.g., SpendingLimitPolicy).
 */
export interface PolicyPlugin<TConfig = unknown> {
  /** Unique identifier matching the PolicyConfig.type discriminant (e.g., "spending-limit") */
  readonly id: string;
  /** Human-readable name (e.g., "SpendingLimitHook") */
  readonly name: string;
  /** ERC-7579 module type */
  readonly moduleType: ModuleType;
  /** If true, the deployed address is added to the protected addresses set */
  readonly isInfrastructure: boolean;
  /** Default deployed addresses per chain ID (e.g., { 84532: "0x..." }) */
  readonly defaultAddresses?: Record<number, Address>;
  /** ABI for the on-chain module contract */
  readonly abi: readonly Record<string, unknown>[];

  /**
   * Encode the onInstall init data for this module.
   *
   * @param config - Plugin-specific configuration
   * @param trustedForwarder - HookMultiPlexer address to set as trusted forwarder
   * @returns Hex-encoded init data matching the Solidity onInstall decoder
   */
  encodeInitData(config: TConfig, trustedForwarder: Address): Hex;

  /**
   * Validate a configuration object, throwing PolicyConfigError on failure.
   */
  validateConfig(config: TConfig): void;

  /**
   * Map a configuration to an InstalledPolicy record for the wallet's policies array.
   */
  toInstalledPolicy(
    config: TConfig,
    moduleAddress: Address,
  ): {
    moduleAddress: Address;
    moduleType: number;
    name: string;
  };
}
