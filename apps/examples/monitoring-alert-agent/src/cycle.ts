import type { Address, Hex } from "viem";
import type { ISmartAgentKitClient } from "@smartagentkit/sdk";
import { DEFAULT_RULES, type AlertThresholds } from "./rules.js";
import { printAlert } from "./alerts.js";

const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000" as Address;

export async function monitorCycle(
  client: ISmartAgentKitClient,
  wallets: Address[],
  guardianKey: Hex,
  spendingLimit: bigint,
  thresholds: AlertThresholds,
): Promise<number> {
  let alertCount = 0;

  for (const walletAddr of wallets) {
    // Take snapshot
    const balances = await client.getBalances(walletAddr);
    const remaining = await client.getRemainingAllowance(walletAddr, NATIVE_TOKEN);
    const paused = await client.isPaused(walletAddr);
    const sessions = client.getActiveSessions(walletAddr);

    const snapshot = {
      address: walletAddr,
      ethBalance: balances.eth,
      remainingAllowance: remaining,
      spendingLimit,
      paused,
      activeSessions: sessions,
    };

    // Evaluate rules
    for (const rule of DEFAULT_RULES) {
      const alert = rule.evaluate(snapshot, thresholds);
      if (alert) {
        printAlert(alert);
        alertCount++;

        if (alert.action === "pause" && !paused) {
          await client.pause(walletAddr, guardianKey);
          console.log(`  --> Wallet ${walletAddr.slice(0, 10)}... paused successfully`);
        }
      }
    }
  }

  return alertCount;
}
