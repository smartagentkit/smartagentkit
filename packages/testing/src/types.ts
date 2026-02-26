import type { Address } from "viem";
import type { PolicyConfig, ActiveSession } from "@smartagentkit/sdk";

export interface MockClientOptions {
  /** Initial ETH balance in wei (default: 10 ETH) */
  initialBalance?: bigint;
  /** Initial token balances (address → wei) */
  tokenBalances?: Record<string, bigint>;
  /** Whether to log all operations (default: false) */
  verbose?: boolean;
}

export interface MockLogEntry {
  timestamp: number;
  operation: string;
  details: Record<string, unknown>;
}

export interface MockWalletState {
  address: Address;
  owner: Address;
  isDeployed: boolean;
  paused: boolean;
  ethBalance: bigint;
  tokenBalances: Map<string, bigint>;
  spendingUsed: Map<string, bigint>;
  spendingLimits: Map<string, { limit: bigint; window: number }>;
  allowlistMode: "allow" | "block" | null;
  allowlistTargets: Set<string>;
  policies: PolicyConfig[];
  sessions: ActiveSession[];
  guardian: Address | null;
}
