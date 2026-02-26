/**
 * Arbitrage Agent
 *
 * A DEX arbitrage bot that uses session keys for time-scoped access,
 * atomic batch execution for buy+sell pairs, and policy-governed
 * spending limits. No LLM — algorithmic trading loop.
 *
 * Run with --mock flag for in-memory demo.
 */

import "dotenv/config";
import { parseEther, formatEther, type Address, type Hex } from "viem";
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { SpendingLimitExceededError, WalletPausedError } from "@smartagentkit/sdk";
import { baseSepolia } from "viem/chains";
import { MockPriceFeed, type PriceTick } from "./price-feed.js";
import { detectOpportunity } from "./strategy.js";
import { buildSwapCalls, executeArbitrage } from "./executor.js";
import { buildDexPairs } from "./dex-config.js";
import { loadConfig } from "./config.js";

const isMockMode = process.argv.includes("--mock");
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000" as Address;

// ─── Display Helpers ────────────────────────────────────────────

function logTick(tick: PriceTick, action: string) {
  const arrow = tick.profitable ? ">>>" : "   ";
  console.log(
    `  ${arrow} Tick ${String(tick.tick).padStart(2)}: ` +
      `DEX-A $${tick.dexAPrice.toFixed(2)} | DEX-B $${tick.dexBPrice.toFixed(2)} | ` +
      `Spread ${tick.spreadBps.toFixed(1)} bps | ${action}`,
  );
}

// ─── Mock Mode ──────────────────────────────────────────────────

async function runMockDemo() {
  const { MockSmartAgentKitClient } = await import("@smartagentkit/testing");

  console.log("Arbitrage Agent (MOCK MODE)");
  console.log("===========================\n");

  const ownerAddr = "0x1234567890abcdef1234567890abcdef12345678" as Address;
  const ownerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
  const dexARouter = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
  const dexBRouter = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

  const [dexA, dexB] = buildDexPairs(dexARouter, dexBRouter);
  const minSpreadBps = 50;
  const maxTradeSizeEth = 0.5;

  // Create mock client
  const mockClient = new MockSmartAgentKitClient({
    initialBalance: parseEther("10"),
  });

  // Create wallet with DEX-specific allowlist
  console.log("1. Creating wallet with DEX allowlist...");
  const wallet = await mockClient.createWallet({
    owner: ownerAddr,
    ownerPrivateKey: ownerKey,
    policies: [
      {
        type: "spending-limit",
        limits: [
          {
            token: NATIVE_TOKEN,
            limit: parseEther("1"),
            window: 86400,
          },
        ],
      },
      {
        type: "allowlist",
        mode: "allow",
        targets: [
          { address: dexARouter },
          { address: dexBRouter },
        ],
      },
      {
        type: "emergency-pause",
        guardian: ownerAddr,
        autoUnpauseAfter: 86400,
      },
    ],
  });
  console.log(`   Wallet: ${wallet.address}`);
  console.log(`   Daily limit: 1 ETH`);
  console.log(`   Allowlist: ${dexA.name} (${dexARouter.slice(0, 10)}...), ${dexB.name} (${dexBRouter.slice(0, 10)}...)`);

  // Create time-scoped session key (1 hour)
  console.log("\n2. Creating session key (1 hour)...");
  const { sessionKey, permissionId } = await mockClient.createSession(
    wallet,
    {
      sessionKey: ownerAddr,
      actions: [
        { target: dexARouter, selector: "0x7ff36ab5" as Hex },
        { target: dexBRouter, selector: "0x18cbafe5" as Hex },
      ],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
    ownerKey,
  );
  console.log(`   Session key: ${sessionKey.slice(0, 10)}...`);
  console.log(`   Expires: 1 hour`);

  // Start trading loop with mock price feed
  console.log("\n3. Starting trading loop (20 price ticks)...\n");
  console.log("\u2500".repeat(80));

  const feed = new MockPriceFeed(20, 3);
  let tradeCount = 0;
  let totalSpent = 0n;
  let stopped = false;

  let tick = feed.nextTick();
  while (tick && !stopped) {
    // Check if paused
    const paused = await mockClient.isPaused(wallet.address);
    if (paused) {
      logTick(tick, "PAUSED - skipping");
      tick = feed.nextTick();
      continue;
    }

    // Check remaining allowance
    const remaining = await mockClient.getRemainingAllowance(wallet.address, NATIVE_TOKEN);
    if (remaining <= 0n) {
      logTick(tick, "LIMIT REACHED - stopping");
      stopped = true;
      break;
    }

    // Detect opportunity
    const opp = detectOpportunity(tick, minSpreadBps, maxTradeSizeEth);
    if (!opp) {
      logTick(tick, "no opportunity");
      tick = feed.nextTick();
      continue;
    }

    // Build and execute swap
    const calls = buildSwapCalls(opp, dexA, dexB);
    try {
      const txHash = await executeArbitrage(mockClient, wallet, calls);
      tradeCount++;
      totalSpent += opp.tradeSize;
      const profit = (opp.profitBps / 10000) * Number(formatEther(opp.tradeSize));
      logTick(
        tick,
        `TRADE #${tradeCount}: ${opp.direction} | Size: ${formatEther(opp.tradeSize)} ETH | Est. profit: ${profit.toFixed(4)} ETH`,
      );
    } catch (error) {
      if (error instanceof SpendingLimitExceededError) {
        logTick(tick, "LIMIT REACHED - stopping");
        stopped = true;
      } else if (error instanceof WalletPausedError) {
        logTick(tick, "PAUSED - skipping");
      } else {
        logTick(tick, `ERROR: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    tick = feed.nextTick();
  }

  console.log("\u2500".repeat(80));

  // Revoke session key
  console.log("\n4. Revoking session key...");
  await mockClient.revokeSession(wallet, permissionId, ownerKey);
  console.log("   Session revoked.");

  // Summary
  const finalRemaining = await mockClient.getRemainingAllowance(wallet.address, NATIVE_TOKEN);
  console.log("\n--- Summary ---");
  console.log(`   Trades executed: ${tradeCount}`);
  console.log(`   Total spent: ${formatEther(totalSpent)} ETH`);
  console.log(`   Remaining allowance: ${formatEther(finalRemaining)} ETH`);
  console.log(`   Active sessions: ${mockClient.getActiveSessions(wallet.address).length}`);
  console.log("\nMock demo complete! Run without --mock for real testnet execution.");
}

// ─── Real Mode ──────────────────────────────────────────────────

async function runRealBot() {
  const cfg = loadConfig();

  console.log("Arbitrage Agent");
  console.log("================\n");

  const sakClient = new SmartAgentKitClient({
    chain: baseSepolia,
    rpcUrl: cfg.rpcUrl,
    bundlerUrl: cfg.bundlerUrl,
    moduleAddresses: cfg.moduleAddresses,
  });

  const [dexA, dexB] = buildDexPairs(cfg.dexARouter, cfg.dexBRouter);

  console.log("Creating wallet with DEX-specific allowlist...");
  const wallet = await sakClient.createWallet({
    owner: cfg.ownerAddress,
    ownerPrivateKey: cfg.ownerPrivateKey,
    preset: "defi-trader",
    presetParams: {
      guardian: cfg.ownerAddress,
      allowedDexes: [cfg.dexARouter, cfg.dexBRouter],
    },
  });
  console.log(`Wallet: ${wallet.address}`);

  // Create session key
  console.log("Creating session key (1 hour)...");
  const { sessionKey, permissionId } = await sakClient.createSession(
    wallet,
    {
      sessionKey: cfg.ownerAddress,
      actions: [
        ...dexA.selectors.map((sel) => ({ target: dexA.router, selector: sel })),
        ...dexB.selectors.map((sel) => ({ target: dexB.router, selector: sel })),
      ],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
    cfg.ownerPrivateKey,
  );
  console.log(`Session key: ${sessionKey}`);

  console.log(`\nStarting trading loop (interval: ${cfg.pollIntervalMs}ms)...`);
  console.log("Press Ctrl+C to stop.\n");

  // Note: In real mode you'd use an actual price oracle.
  // This is a placeholder that shows the trading loop structure.
  const feed = new MockPriceFeed(100, 10);

  const interval = setInterval(async () => {
    const tick = feed.nextTick();
    if (!tick) {
      clearInterval(interval);
      return;
    }

    const paused = await sakClient.isPaused(wallet.address);
    if (paused) return;

    const remaining = await sakClient.getRemainingAllowance(wallet.address, NATIVE_TOKEN);
    if (remaining <= 0n) {
      clearInterval(interval);
      return;
    }

    const opp = detectOpportunity(tick, cfg.minSpreadBps, cfg.maxTradeSizeEth);
    if (!opp) return;

    const calls = buildSwapCalls(opp, dexA, dexB);
    try {
      await sakClient.executeBatch(wallet, { calls });
      console.log(`Trade: ${opp.direction} | ${formatEther(opp.tradeSize)} ETH | ${opp.profitBps} bps`);
    } catch (error) {
      console.error(`Trade failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, cfg.pollIntervalMs);

  process.on("SIGINT", async () => {
    clearInterval(interval);
    console.log("\nRevoking session key...");
    await sakClient.revokeSession(wallet, permissionId, cfg.ownerPrivateKey);
    console.log("Session revoked. Bot stopped.");
    process.exit(0);
  });
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  if (isMockMode) {
    await runMockDemo();
  } else {
    await runRealBot();
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
