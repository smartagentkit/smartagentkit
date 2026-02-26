/**
 * Mock price feed that generates synthetic price data with
 * occasional arbitrage opportunities.
 */
export interface PriceTick {
  tick: number;
  dexAPrice: number; // ETH/USDC price on DEX A
  dexBPrice: number; // ETH/USDC price on DEX B
  spreadBps: number; // Spread in basis points
  profitable: boolean;
}

export class MockPriceFeed {
  private ticks: PriceTick[] = [];
  private currentIndex = 0;

  constructor(tickCount = 20, profitableCount = 3) {
    this.ticks = this.generateTicks(tickCount, profitableCount);
  }

  nextTick(): PriceTick | null {
    if (this.currentIndex >= this.ticks.length) return null;
    return this.ticks[this.currentIndex++];
  }

  getTicks(): PriceTick[] {
    return [...this.ticks];
  }

  private generateTicks(count: number, profitable: number): PriceTick[] {
    const basePrice = 2500; // Base ETH/USDC price
    const ticks: PriceTick[] = [];

    // Determine which ticks will be profitable
    const profitableTicks = new Set<number>();
    const spacing = Math.floor(count / (profitable + 1));
    for (let i = 0; i < profitable; i++) {
      profitableTicks.add(spacing * (i + 1));
    }

    for (let i = 0; i < count; i++) {
      const noise = (Math.random() - 0.5) * 10; // +/- $5 noise
      const dexAPrice = basePrice + noise;

      let dexBPrice: number;
      if (profitableTicks.has(i)) {
        // Create a profitable spread (60-120 bps)
        const spreadBps = 60 + Math.random() * 60;
        dexBPrice = dexAPrice * (1 + spreadBps / 10000);
      } else {
        // Normal spread (0-30 bps, not profitable after gas)
        const spreadBps = Math.random() * 30;
        dexBPrice = dexAPrice * (1 + (Math.random() > 0.5 ? 1 : -1) * spreadBps / 10000);
      }

      const spreadBps = Math.abs((dexBPrice - dexAPrice) / dexAPrice) * 10000;

      ticks.push({
        tick: i + 1,
        dexAPrice: Math.round(dexAPrice * 100) / 100,
        dexBPrice: Math.round(dexBPrice * 100) / 100,
        spreadBps: Math.round(spreadBps * 10) / 10,
        profitable: profitableTicks.has(i),
      });
    }

    return ticks;
  }
}
