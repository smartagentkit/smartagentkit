import { SmartAgentKitClient } from "@smartagentkit/sdk";
import type { Address } from "viem";
import type { Chain } from "viem";
import { loadConfig } from "./config.js";
import { resolveChain } from "./chains.js";

export interface ClientOptions {
  chain?: string;
  rpcUrl?: string;
  bundlerUrl?: string;
}

export function createSdkClient(options: ClientOptions): SmartAgentKitClient {
  const config = loadConfig();
  const chainName = options.chain ?? config.defaultChain ?? "base-sepolia";
  const chain = resolveChain(chainName);

  const rpcUrl = options.rpcUrl ?? config.rpcUrl;
  if (!rpcUrl) {
    throw new Error(
      "RPC URL required. Set via --rpc-url flag or `sak config set rpcUrl <url>`",
    );
  }

  const bundlerUrl = options.bundlerUrl ?? config.bundlerUrl;
  if (!bundlerUrl) {
    throw new Error(
      "Bundler URL required. Set via --bundler-url flag or `sak config set bundlerUrl <url>`",
    );
  }

  const moduleAddresses = config.moduleAddresses
    ? {
        spendingLimitHook: (config.moduleAddresses.spendingLimitHook ??
          "0x0000000000000000000000000000000000000000") as Address,
        allowlistHook: (config.moduleAddresses.allowlistHook ??
          "0x0000000000000000000000000000000000000000") as Address,
        emergencyPauseHook: (config.moduleAddresses.emergencyPauseHook ??
          "0x0000000000000000000000000000000000000000") as Address,
      }
    : undefined;

  return new SmartAgentKitClient({
    chain,
    rpcUrl,
    bundlerUrl,
    paymasterUrl: config.paymasterUrl,
    moduleAddresses,
  });
}
