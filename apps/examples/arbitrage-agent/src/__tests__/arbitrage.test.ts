import { describe, it, expect } from "vitest";
import { parseEther } from "viem";
import type { Address, Hex } from "viem";
import { MockSmartAgentKitClient } from "@smartagentkit/testing";
import { detectOpportunity, type ArbitrageOpportunity } from "../strategy.js";
import { buildSwapCalls, executeArbitrage } from "../executor.js";
import { buildDexPairs, type DexPair } from "../dex-config.js";
import { MockPriceFeed, type PriceTick } from "../price-feed.js";

const OWNER = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const DEX_A_ROUTER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const DEX_B_ROUTER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000" as Address;

// ─── detectOpportunity ────────────────────────────────────────────

describe("detectOpportunity", () => {
  it("returns null when spread is below minimum", () => {
    const tick: PriceTick = {
      tick: 1,
      dexAPrice: 2500,
      dexBPrice: 2505,
      spreadBps: 20,
      profitable: false,
    };
    const result = detectOpportunity(tick, 50, 0.5);
    expect(result).toBeNull();
  });

  it("detects buy-A-sell-B when A is cheaper", () => {
    const tick: PriceTick = {
      tick: 1,
      dexAPrice: 2400,
      dexBPrice: 2500,
      spreadBps: 100,
      profitable: true,
    };
    const result = detectOpportunity(tick, 50, 0.5);

    expect(result).not.toBeNull();
    expect(result!.direction).toBe("buy-A-sell-B");
    expect(result!.profitBps).toBe(100);
    expect(result!.tradeSize).toBeGreaterThan(0n);
  });

  it("detects buy-B-sell-A when B is cheaper", () => {
    const tick: PriceTick = {
      tick: 1,
      dexAPrice: 2600,
      dexBPrice: 2500,
      spreadBps: 80,
      profitable: true,
    };
    const result = detectOpportunity(tick, 50, 0.5);

    expect(result).not.toBeNull();
    expect(result!.direction).toBe("buy-B-sell-A");
  });

  it("scales trade size with spread (capped at 1x maxTradeSizeEth)", () => {
    const smallSpread: PriceTick = {
      tick: 1,
      dexAPrice: 2500,
      dexBPrice: 2515,
      spreadBps: 60,
      profitable: true,
    };
    const largeSpread: PriceTick = {
      tick: 2,
      dexAPrice: 2500,
      dexBPrice: 2575,
      spreadBps: 300,
      profitable: true,
    };

    const small = detectOpportunity(smallSpread, 50, 1.0)!;
    const large = detectOpportunity(largeSpread, 50, 1.0)!;

    // Larger spread should produce larger (or equal) trade size
    expect(large.tradeSize).toBeGreaterThanOrEqual(small.tradeSize);
    // But capped at maxTradeSizeEth
    expect(large.tradeSize).toBeLessThanOrEqual(parseEther("1"));
  });

  it("returns null at exactly the threshold", () => {
    const tick: PriceTick = {
      tick: 1,
      dexAPrice: 2500,
      dexBPrice: 2505,
      spreadBps: 49.9,
      profitable: false,
    };
    const result = detectOpportunity(tick, 50, 0.5);
    expect(result).toBeNull();
  });
});

// ─── buildSwapCalls ───────────────────────────────────────────────

describe("buildSwapCalls", () => {
  const [dexA, dexB] = buildDexPairs(DEX_A_ROUTER, DEX_B_ROUTER);

  it("creates buy call on A and sell call on B for buy-A-sell-B", () => {
    const opp: ArbitrageOpportunity = {
      tick: { tick: 1, dexAPrice: 2400, dexBPrice: 2500, spreadBps: 100, profitable: true },
      direction: "buy-A-sell-B",
      profitBps: 100,
      tradeSize: parseEther("0.5"),
    };

    const calls = buildSwapCalls(opp, dexA, dexB);

    expect(calls).toHaveLength(2);
    // Buy call goes to DEX-A (buy side), sends ETH
    expect(calls[0].target).toBe(DEX_A_ROUTER);
    expect(calls[0].value).toBe(parseEther("0.5"));
    // Sell call goes to DEX-B (sell side), no ETH
    expect(calls[1].target).toBe(DEX_B_ROUTER);
    expect(calls[1].value).toBe(0n);
  });

  it("creates buy call on B and sell call on A for buy-B-sell-A", () => {
    const opp: ArbitrageOpportunity = {
      tick: { tick: 1, dexAPrice: 2600, dexBPrice: 2500, spreadBps: 80, profitable: true },
      direction: "buy-B-sell-A",
      profitBps: 80,
      tradeSize: parseEther("0.3"),
    };

    const calls = buildSwapCalls(opp, dexA, dexB);

    expect(calls).toHaveLength(2);
    // Buy call goes to DEX-B, sell goes to DEX-A
    expect(calls[0].target).toBe(DEX_B_ROUTER);
    expect(calls[0].value).toBe(parseEther("0.3"));
    expect(calls[1].target).toBe(DEX_A_ROUTER);
    expect(calls[1].value).toBe(0n);
  });
});

// ─── buildDexPairs ────────────────────────────────────────────────

describe("buildDexPairs", () => {
  it("creates two DEX pairs with correct routers and selectors", () => {
    const [dexA, dexB] = buildDexPairs(DEX_A_ROUTER, DEX_B_ROUTER);

    expect(dexA.name).toBe("DEX-A");
    expect(dexA.router).toBe(DEX_A_ROUTER);
    expect(dexA.selectors).toHaveLength(3);

    expect(dexB.name).toBe("DEX-B");
    expect(dexB.router).toBe(DEX_B_ROUTER);
    expect(dexB.selectors).toHaveLength(3);
  });
});

// ─── MockPriceFeed ────────────────────────────────────────────────

describe("MockPriceFeed", () => {
  it("generates the requested number of ticks", () => {
    const feed = new MockPriceFeed(10, 2);
    const ticks = feed.getTicks();
    expect(ticks).toHaveLength(10);
  });

  it("returns null after all ticks are consumed", () => {
    const feed = new MockPriceFeed(3, 1);
    feed.nextTick();
    feed.nextTick();
    feed.nextTick();
    expect(feed.nextTick()).toBeNull();
  });

  it("marks the right number of ticks as profitable", () => {
    const feed = new MockPriceFeed(20, 5);
    const ticks = feed.getTicks();
    const profitable = ticks.filter((t) => t.profitable);
    expect(profitable).toHaveLength(5);
  });

  it("ticks have sequential numbering starting at 1", () => {
    const feed = new MockPriceFeed(5, 0);
    const ticks = feed.getTicks();
    expect(ticks.map((t) => t.tick)).toEqual([1, 2, 3, 4, 5]);
  });

  it("profitable ticks have higher spread", () => {
    // Run multiple times to account for randomness
    for (let i = 0; i < 5; i++) {
      const feed = new MockPriceFeed(20, 3);
      const ticks = feed.getTicks();
      const profitable = ticks.filter((t) => t.profitable);
      // Profitable ticks should have ≥60 bps spread (by design)
      for (const tick of profitable) {
        expect(tick.spreadBps).toBeGreaterThanOrEqual(50);
      }
    }
  });
});

// ─── executeArbitrage Integration ─────────────────────────────────

describe("executeArbitrage", () => {
  it("executes a batch trade via the client", async () => {
    const client = new MockSmartAgentKitClient({
      initialBalance: parseEther("10"),
    });
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      policies: [
        {
          type: "spending-limit",
          limits: [{ token: NATIVE_TOKEN, limit: parseEther("5"), window: 86400 }],
        },
        {
          type: "allowlist",
          mode: "allow",
          targets: [{ address: DEX_A_ROUTER }, { address: DEX_B_ROUTER }],
        },
        {
          type: "emergency-pause",
          guardian: OWNER,
          autoUnpauseAfter: 86400,
        },
      ],
    });

    const [dexA, dexB] = buildDexPairs(DEX_A_ROUTER, DEX_B_ROUTER);
    const opp: ArbitrageOpportunity = {
      tick: { tick: 1, dexAPrice: 2400, dexBPrice: 2500, spreadBps: 100, profitable: true },
      direction: "buy-A-sell-B",
      profitBps: 100,
      tradeSize: parseEther("0.5"),
    };

    const calls = buildSwapCalls(opp, dexA, dexB);
    const txHash = await executeArbitrage(client, wallet, calls);

    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("fails when spending limit is exceeded", async () => {
    const client = new MockSmartAgentKitClient({
      initialBalance: parseEther("10"),
    });
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      policies: [
        {
          type: "spending-limit",
          limits: [{ token: NATIVE_TOKEN, limit: parseEther("0.1"), window: 86400 }],
        },
        {
          type: "allowlist",
          mode: "allow",
          targets: [{ address: DEX_A_ROUTER }, { address: DEX_B_ROUTER }],
        },
        {
          type: "emergency-pause",
          guardian: OWNER,
          autoUnpauseAfter: 86400,
        },
      ],
    });

    const [dexA, dexB] = buildDexPairs(DEX_A_ROUTER, DEX_B_ROUTER);
    const opp: ArbitrageOpportunity = {
      tick: { tick: 1, dexAPrice: 2400, dexBPrice: 2500, spreadBps: 100, profitable: true },
      direction: "buy-A-sell-B",
      profitBps: 100,
      tradeSize: parseEther("0.5"), // Exceeds 0.1 ETH limit
    };

    const calls = buildSwapCalls(opp, dexA, dexB);
    await expect(executeArbitrage(client, wallet, calls)).rejects.toThrow();
  });

  it("fails when target is not on allowlist", async () => {
    const client = new MockSmartAgentKitClient({
      initialBalance: parseEther("10"),
    });
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      policies: [
        {
          type: "spending-limit",
          limits: [{ token: NATIVE_TOKEN, limit: parseEther("5"), window: 86400 }],
        },
        {
          type: "allowlist",
          mode: "allow",
          targets: [{ address: DEX_A_ROUTER }], // Only DEX-A allowed
        },
        {
          type: "emergency-pause",
          guardian: OWNER,
          autoUnpauseAfter: 86400,
        },
      ],
    });

    const [dexA, dexB] = buildDexPairs(DEX_A_ROUTER, DEX_B_ROUTER);
    const opp: ArbitrageOpportunity = {
      tick: { tick: 1, dexAPrice: 2400, dexBPrice: 2500, spreadBps: 100, profitable: true },
      direction: "buy-A-sell-B",
      profitBps: 100,
      tradeSize: parseEther("0.5"),
    };

    // Sell call targets DEX-B, which is not on the allowlist
    const calls = buildSwapCalls(opp, dexA, dexB);
    await expect(executeArbitrage(client, wallet, calls)).rejects.toThrow("allowlist");
  });
});
