/**
 * Monitoring Alert Agent
 *
 * A guardian watchdog that monitors smart wallets and auto-pauses
 * them when anomalous spending is detected. No LLM — deterministic rules.
 *
 * Run with --mock flag for in-memory demo.
 */

import "dotenv/config";
import { parseEther, type Address, type Hex } from "viem";
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { baseSepolia } from "viem/chains";
import type { AlertThresholds } from "./rules.js";
import { loadConfig } from "./config.js";
import { monitorCycle } from "./cycle.js";

const isMockMode = process.argv.includes("--mock");

// ─── Mock Mode ──────────────────────────────────────────────────

async function runMockDemo() {
  const { MockSmartAgentKitClient } = await import("@smartagentkit/testing");

  console.log("Monitoring Alert Agent (MOCK MODE)");
  console.log("===================================\n");

  const ownerAddr = "0x1234567890abcdef1234567890abcdef12345678" as Address;
  const ownerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
  const spendingLimit = parseEther("1");

  // Create mock client with two wallets
  const mockClient = new MockSmartAgentKitClient({
    initialBalance: parseEther("10"),
  });

  console.log("Setting up monitored wallets...\n");

  // Wallet 1: A healthy wallet
  const wallet1 = await mockClient.createWallet({
    owner: ownerAddr,
    ownerPrivateKey: ownerKey,
    preset: "defi-trader",
    presetParams: { guardian: ownerAddr },
  });
  console.log(`Wallet 1: ${wallet1.address} (healthy)`);

  // Wallet 2: A wallet that will spend too fast
  const wallet2 = await mockClient.createWallet({
    owner: ownerAddr,
    ownerPrivateKey: ownerKey,
    preset: "defi-trader",
    presetParams: { guardian: ownerAddr },
  });
  console.log(`Wallet 2: ${wallet2.address} (will spend fast)\n`);

  const thresholds: AlertThresholds = {
    lowBalanceWei: parseEther("0.1"),
    spendingRatePercent: 0.8,
    maxExpectedSessions: 2,
  };

  const wallets = [wallet1.address, wallet2.address];

  // Simulation: 5 monitoring cycles
  console.log("Starting monitoring simulation (5 cycles)...\n");

  for (let cycle = 1; cycle <= 5; cycle++) {
    console.log(`\n=== Monitor Cycle ${cycle} ===`);

    // Simulate spending on wallet2 (increases each cycle)
    if (cycle <= 3) {
      try {
        await mockClient.execute(wallet2, {
          target: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
          value: parseEther("0.3"),
        });
        console.log(`[sim] Wallet 2 spent 0.3 ETH (total: ${0.3 * cycle} ETH)`);
      } catch {
        console.log("[sim] Wallet 2 spending blocked (paused or limit reached)");
      }
    }

    // Run monitor
    const alerts = await monitorCycle(
      mockClient,
      wallets,
      ownerKey,
      spendingLimit,
      thresholds,
    );

    if (alerts === 0) {
      console.log("  No alerts — all wallets healthy");
    }

    // Small delay for readability
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n\nMock demo complete!");
  console.log("The monitor detected high spending on Wallet 2 and auto-paused it.");
  console.log("Run without --mock for real testnet monitoring.");
}

// ─── Real Mode ──────────────────────────────────────────────────

async function runRealMonitor() {
  const cfg = loadConfig();

  console.log("Monitoring Alert Agent");
  console.log("======================\n");

  const sakClient = new SmartAgentKitClient({
    chain: baseSepolia,
    rpcUrl: cfg.rpcUrl,
    bundlerUrl: cfg.bundlerUrl,
    moduleAddresses: cfg.moduleAddresses,
  });

  // Connect to monitored wallets
  for (const addr of cfg.monitoredWallets) {
    await sakClient.connectWallet(addr, cfg.guardianPrivateKey);
    console.log(`Connected to wallet: ${addr}`);
  }

  const thresholds: AlertThresholds = {
    lowBalanceWei: cfg.lowBalanceThreshold,
    spendingRatePercent: cfg.spendingRateThreshold,
    maxExpectedSessions: cfg.maxExpectedSessions,
  };

  // Use the first wallet's spending limit as reference
  const spendingLimit = parseEther("1"); // Default; configure per-wallet in production

  console.log(`\nMonitoring ${cfg.monitoredWallets.length} wallets every ${cfg.pollInterval}s...`);
  console.log("Press Ctrl+C to stop.\n");

  // Run first cycle immediately
  await monitorCycle(
    sakClient,
    cfg.monitoredWallets,
    cfg.guardianPrivateKey,
    spendingLimit,
    thresholds,
  );

  const interval = setInterval(async () => {
    await monitorCycle(
      sakClient,
      cfg.monitoredWallets,
      cfg.guardianPrivateKey,
      spendingLimit,
      thresholds,
    );
  }, cfg.pollInterval * 1000);

  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("\nMonitor stopped.");
    process.exit(0);
  });
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  if (isMockMode) {
    await runMockDemo();
  } else {
    await runRealMonitor();
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
