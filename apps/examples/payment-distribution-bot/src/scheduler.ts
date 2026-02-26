import type { Address, Hex } from "viem";
import type { AgentWallet, ISmartAgentKitClient } from "@smartagentkit/sdk";
import {
  SpendingLimitExceededError,
  WalletPausedError,
} from "@smartagentkit/sdk";
import type { PayrollEntry } from "./payroll.js";

const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000" as Address;

export interface PayoutResult {
  cycle: number;
  paid: PayrollEntry[];
  skipped: PayrollEntry[];
  txHash: string | null;
  error: string | null;
}

export class PayoutScheduler {
  private wallet: AgentWallet;
  private client: ISmartAgentKitClient;
  private payroll: PayrollEntry[];
  private cycleCount = 0;

  constructor(
    client: ISmartAgentKitClient,
    wallet: AgentWallet,
    payroll: PayrollEntry[],
  ) {
    this.client = client;
    this.wallet = wallet;
    this.payroll = payroll;
  }

  async runOnce(): Promise<PayoutResult> {
    this.cycleCount++;
    const result: PayoutResult = {
      cycle: this.cycleCount,
      paid: [],
      skipped: [],
      txHash: null,
      error: null,
    };

    // Check if paused
    const paused = await this.client.isPaused(this.wallet.address);
    if (paused) {
      result.error = "Wallet is paused — skipping payout cycle";
      result.skipped = [...this.payroll];
      return result;
    }

    // Check remaining allowance
    const remaining = await this.client.getRemainingAllowance(
      this.wallet.address,
      NATIVE_TOKEN,
    );

    // Determine which payouts fit within the remaining allowance
    let budget = remaining;
    const eligible: PayrollEntry[] = [];
    for (const entry of this.payroll) {
      if (entry.amount <= budget) {
        eligible.push(entry);
        budget -= entry.amount;
      } else {
        result.skipped.push(entry);
      }
    }

    if (eligible.length === 0) {
      result.error = "Daily spending limit reached — waiting for next window";
      result.skipped = [...this.payroll];
      return result;
    }

    // Execute batch payout
    try {
      const txHash = await this.client.executeBatch(this.wallet, {
        calls: eligible.map((e) => ({
          target: e.recipient,
          value: e.amount,
        })),
      });
      result.paid = eligible;
      result.txHash = txHash;
    } catch (error) {
      if (error instanceof SpendingLimitExceededError) {
        result.error = `Spending limit exceeded: ${error.message}`;
        result.skipped = [...this.payroll];
      } else if (error instanceof WalletPausedError) {
        result.error = "Wallet was paused during execution";
        result.skipped = [...this.payroll];
      } else {
        result.error = error instanceof Error ? error.message : String(error);
        result.skipped = [...this.payroll];
      }
    }

    return result;
  }
}
