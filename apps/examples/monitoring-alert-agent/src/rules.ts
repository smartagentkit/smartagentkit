import type { Address } from "viem";
import type { ActiveSession } from "@smartagentkit/sdk";

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  wallet: Address;
  rule: string;
  severity: AlertSeverity;
  message: string;
  action?: "pause";
}

export interface WalletSnapshot {
  address: Address;
  ethBalance: bigint;
  remainingAllowance: bigint;
  spendingLimit: bigint;
  paused: boolean;
  activeSessions: ActiveSession[];
}

export interface AlertRule {
  name: string;
  evaluate(snapshot: WalletSnapshot, thresholds: AlertThresholds): Alert | null;
}

export interface AlertThresholds {
  lowBalanceWei: bigint;
  spendingRatePercent: number;
  maxExpectedSessions: number;
}

export const DEFAULT_RULES: AlertRule[] = [
  {
    name: "low-balance",
    evaluate(snapshot, thresholds) {
      if (snapshot.paused) return null;
      if (snapshot.ethBalance < thresholds.lowBalanceWei) {
        const balanceEth = Number(snapshot.ethBalance) / 1e18;
        return {
          wallet: snapshot.address,
          rule: "low-balance",
          severity: "warning",
          message: `Low ETH balance: ${balanceEth.toFixed(4)} ETH`,
        };
      }
      return null;
    },
  },
  {
    name: "high-spending-rate",
    evaluate(snapshot, thresholds) {
      if (snapshot.paused) return null;
      if (snapshot.spendingLimit === 0n) return null;

      const used = snapshot.spendingLimit - snapshot.remainingAllowance;
      const rate = Number(used) / Number(snapshot.spendingLimit);

      if (rate >= thresholds.spendingRatePercent) {
        const pct = (rate * 100).toFixed(1);
        return {
          wallet: snapshot.address,
          rule: "high-spending-rate",
          severity: "critical",
          message: `Spending rate at ${pct}% of limit — auto-pausing wallet`,
          action: "pause",
        };
      }
      return null;
    },
  },
  {
    name: "unexpected-sessions",
    evaluate(snapshot, thresholds) {
      if (snapshot.activeSessions.length > thresholds.maxExpectedSessions) {
        return {
          wallet: snapshot.address,
          rule: "unexpected-sessions",
          severity: "warning",
          message: `${snapshot.activeSessions.length} active sessions (expected max ${thresholds.maxExpectedSessions})`,
        };
      }
      return null;
    },
  },
];
