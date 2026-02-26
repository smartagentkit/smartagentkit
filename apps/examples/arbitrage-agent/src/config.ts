import type { Address, Hex } from "viem";

export interface ArbConfig {
  rpcUrl: string;
  bundlerUrl: string;
  ownerAddress: Address;
  ownerPrivateKey: Hex;
  moduleAddresses: {
    spendingLimitHook: Address;
    allowlistHook: Address;
    emergencyPauseHook: Address;
  };
  dexARouter: Address;
  dexBRouter: Address;
  minSpreadBps: number;
  maxTradeSizeEth: number;
  pollIntervalMs: number;
}

export function loadConfig(): ArbConfig {
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
    dexARouter: process.env.DEX_A_ROUTER! as Address,
    dexBRouter: process.env.DEX_B_ROUTER! as Address,
    minSpreadBps: parseInt(process.env.MIN_SPREAD_BPS ?? "50", 10),
    maxTradeSizeEth: parseFloat(process.env.MAX_TRADE_SIZE_ETH ?? "0.5"),
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10),
  };
}
