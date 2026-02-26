import { parseEther, type Address } from "viem";
import type { MockWalletState } from "./types.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export function createDefaultState(
  address: Address,
  owner: Address,
  initialBalance: bigint = parseEther("10"),
): MockWalletState {
  return {
    address,
    owner,
    isDeployed: true,
    paused: false,
    ethBalance: initialBalance,
    tokenBalances: new Map(),
    spendingUsed: new Map(),
    spendingLimits: new Map(),
    allowlistMode: null,
    allowlistTargets: new Set(),
    policies: [],
    sessions: [],
    guardian: null,
  };
}

/** Generate a deterministic mock address from a seed */
export function deterministicAddress(seed: number): Address {
  const hex = seed.toString(16).padStart(40, "0");
  return `0x${hex}` as Address;
}
