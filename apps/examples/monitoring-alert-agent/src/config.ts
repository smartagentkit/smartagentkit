import { parseEther, type Address, type Hex } from "viem";

export interface MonitorConfig {
  rpcUrl: string;
  bundlerUrl: string;
  moduleAddresses: {
    spendingLimitHook: Address;
    allowlistHook: Address;
    emergencyPauseHook: Address;
  };
  guardianPrivateKey: Hex;
  monitoredWallets: Address[];
  lowBalanceThreshold: bigint;
  spendingRateThreshold: number;
  maxExpectedSessions: number;
  pollInterval: number;
}

export function loadConfig(): MonitorConfig {
  const wallets = (process.env.MONITORED_WALLETS ?? "")
    .split(",")
    .filter(Boolean)
    .map((a) => a.trim() as Address);

  return {
    rpcUrl: process.env.RPC_URL!,
    bundlerUrl: process.env.BUNDLER_URL!,
    moduleAddresses: {
      spendingLimitHook: process.env.SPENDING_LIMIT_HOOK! as Address,
      allowlistHook: process.env.ALLOWLIST_HOOK! as Address,
      emergencyPauseHook: process.env.EMERGENCY_PAUSE_HOOK! as Address,
    },
    guardianPrivateKey: process.env.GUARDIAN_PRIVATE_KEY! as Hex,
    monitoredWallets: wallets,
    lowBalanceThreshold: parseEther(process.env.LOW_BALANCE_THRESHOLD ?? "0.1"),
    spendingRateThreshold: parseFloat(process.env.SPENDING_RATE_THRESHOLD ?? "0.8"),
    maxExpectedSessions: parseInt(process.env.MAX_EXPECTED_SESSIONS ?? "2", 10),
    pollInterval: parseInt(process.env.POLL_INTERVAL ?? "30", 10),
  };
}
