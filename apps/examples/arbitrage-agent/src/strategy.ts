import type { PriceTick } from "./price-feed.js";

export interface ArbitrageOpportunity {
  tick: PriceTick;
  direction: "buy-A-sell-B" | "buy-B-sell-A";
  profitBps: number;
  tradeSize: bigint; // in wei
}

export function detectOpportunity(
  tick: PriceTick,
  minSpreadBps: number,
  maxTradeSizeEth: number,
): ArbitrageOpportunity | null {
  if (tick.spreadBps < minSpreadBps) return null;

  const direction: ArbitrageOpportunity["direction"] =
    tick.dexAPrice < tick.dexBPrice ? "buy-A-sell-B" : "buy-B-sell-A";

  // Scale trade size based on spread (higher spread = larger position)
  const sizeFactor = Math.min(tick.spreadBps / 100, 1); // Cap at 1x
  const tradeEth = maxTradeSizeEth * sizeFactor;
  const tradeSize = BigInt(Math.floor(tradeEth * 1e18));

  return {
    tick,
    direction,
    profitBps: tick.spreadBps,
    tradeSize,
  };
}
