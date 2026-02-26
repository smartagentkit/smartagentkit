import type { Address, Hex } from "viem";

export interface TreasuryConfig {
  rpcUrl: string;
  bundlerUrl: string;
  ownerAddress: Address;
  ownerPrivateKey: Hex;
  moduleAddresses: {
    spendingLimitHook: Address;
    allowlistHook: Address;
    emergencyPauseHook: Address;
  };
  anthropicApiKey: string;
}

export function loadConfig(): TreasuryConfig {
  return {
    rpcUrl: process.env.RPC_URL!,
    bundlerUrl: process.env.BUNDLER_URL!,
    ownerAddress: process.env.OWNER_ADDRESS! as Address,
    ownerPrivateKey: process.env.OWNER_PRIVATE_KEY! as Hex,
    moduleAddresses: {
      spendingLimitHook: process.env.SPENDING_LIMIT_HOOK! as Address,
      allowlistHook: process.env.ALLOWLIST_HOOK! as Address,
      emergencyPauseHook: process.env.EMERGENCY_PAUSE_HOOK! as Address,
    },
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  };
}
