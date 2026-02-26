import type { Address, Hex } from "viem";

export interface BotConfig {
  rpcUrl: string;
  bundlerUrl: string;
  ownerAddress: Address;
  ownerPrivateKey: Hex;
  moduleAddresses: {
    spendingLimitHook: Address;
    allowlistHook: Address;
    emergencyPauseHook: Address;
  };
  recipients: Address[];
  amounts: bigint[];
  payoutInterval: number;
}

export function loadConfig(): BotConfig {
  const recipients = (process.env.RECIPIENTS ?? "")
    .split(",")
    .filter(Boolean)
    .map((a) => a.trim() as Address);

  const amounts = (process.env.AMOUNTS ?? "")
    .split(",")
    .filter(Boolean)
    .map((a) => BigInt(Math.floor(parseFloat(a.trim()) * 1e18)));

  if (recipients.length !== amounts.length) {
    throw new Error(
      `RECIPIENTS count (${recipients.length}) must match AMOUNTS count (${amounts.length})`,
    );
  }

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
    recipients,
    amounts,
    payoutInterval: parseInt(process.env.PAYOUT_INTERVAL ?? "86400", 10),
  };
}
