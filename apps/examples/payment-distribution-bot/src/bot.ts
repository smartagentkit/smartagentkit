/**
 * Payment Distribution Bot
 *
 * A scheduled payroll bot that distributes ETH to whitelisted recipients
 * within policy-governed guardrails. No LLM — pure TypeScript automation.
 *
 * Run with --mock flag for in-memory demo.
 */

import "dotenv/config";
import { parseEther, formatEther, type Address, type Hex } from "viem";
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { baseSepolia } from "viem/chains";
import { buildPayroll } from "./payroll.js";
import { PayoutScheduler } from "./scheduler.js";
import { loadConfig } from "./config.js";

const isMockMode = process.argv.includes("--mock");

// ─── Display Helpers ────────────────────────────────────────────

function printTable(headers: string[], rows: string[][]) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const sep = widths.map((w) => "-".repeat(w + 2)).join("+");
  const fmt = (row: string[]) =>
    row.map((cell, i) => ` ${(cell ?? "").padEnd(widths[i])} `).join("|");

  console.log(fmt(headers));
  console.log(sep);
  for (const row of rows) {
    console.log(fmt(row));
  }
}

function printResult(result: {
  cycle: number;
  paid: { label: string; amount: bigint }[];
  skipped: { label: string; amount: bigint }[];
  txHash: string | null;
  error: string | null;
}) {
  console.log(`\n--- Payout Cycle #${result.cycle} ---`);

  if (result.error) {
    console.log(`  [!] ${result.error}`);
  }

  if (result.paid.length > 0) {
    console.log("  Paid:");
    printTable(
      ["Recipient", "Amount (ETH)"],
      result.paid.map((p) => [p.label, formatEther(p.amount)]),
    );
  }

  if (result.skipped.length > 0) {
    console.log("  Skipped:");
    printTable(
      ["Recipient", "Amount (ETH)"],
      result.skipped.map((p) => [p.label, formatEther(p.amount)]),
    );
  }

  if (result.txHash) {
    console.log(`  Tx: ${result.txHash}`);
  }
}

// ─── Mock Mode ──────────────────────────────────────────────────

async function runMockDemo() {
  const { MockSmartAgentKitClient } = await import("@smartagentkit/testing");

  console.log("Payment Distribution Bot (MOCK MODE)");
  console.log("=====================================\n");

  const recipientA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
  const recipientB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
  const recipientC = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
  const ownerAddr = "0x1234567890abcdef1234567890abcdef12345678" as Address;
  const ownerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

  // Create mock client
  const mockClient = new MockSmartAgentKitClient({
    initialBalance: parseEther("10"),
  });

  // Create wallet with payment-agent preset (0.1 ETH/day limit, allowlisted recipients)
  console.log("Creating wallet with payment-agent preset...");
  const wallet = await mockClient.createWallet({
    owner: ownerAddr,
    ownerPrivateKey: ownerKey,
    preset: "payment-agent",
    presetParams: {
      guardian: ownerAddr,
      dailyLimit: parseEther("0.1"),
      approvedRecipients: [recipientA, recipientB, recipientC],
    },
  });
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Policies: ${wallet.policies.map((p) => p.config.type).join(", ")}`);

  // Build payroll
  const payroll = buildPayroll(
    [recipientA, recipientB, recipientC],
    [parseEther("0.03"), parseEther("0.04"), parseEther("0.02")],
  );

  console.log("\nPayroll:");
  printTable(
    ["Recipient", "Amount (ETH)"],
    payroll.map((p) => [p.label, formatEther(p.amount)]),
  );

  // Create scheduler
  const scheduler = new PayoutScheduler(mockClient, wallet, payroll);

  // Run 3 payout cycles
  console.log("\n--- Running 3 payout cycles ---");

  // Cycle 1: Should succeed (total 0.09 ETH, under 0.1 limit)
  const r1 = await scheduler.runOnce();
  printResult(r1);

  // Cycle 2: Should partially succeed or fail (only 0.01 ETH remaining)
  const r2 = await scheduler.runOnce();
  printResult(r2);

  // Cycle 3: Should fail — limit fully consumed
  const r3 = await scheduler.runOnce();
  printResult(r3);

  // Show remaining allowance
  const remaining = await mockClient.getRemainingAllowance(
    wallet.address,
    "0x0000000000000000000000000000000000000000" as Address,
  );
  console.log(`\nRemaining daily allowance: ${formatEther(remaining)} ETH`);
  console.log("\nMock demo complete! Run without --mock for real testnet execution.");
}

// ─── Real Mode ──────────────────────────────────────────────────

async function runRealBot() {
  const cfg = loadConfig();

  console.log("Payment Distribution Bot");
  console.log("========================\n");

  const sakClient = new SmartAgentKitClient({
    chain: baseSepolia,
    rpcUrl: cfg.rpcUrl,
    bundlerUrl: cfg.bundlerUrl,
    moduleAddresses: cfg.moduleAddresses,
  });

  console.log("Creating wallet with payment-agent preset...");
  const wallet = await sakClient.createWallet({
    owner: cfg.ownerAddress,
    ownerPrivateKey: cfg.ownerPrivateKey,
    preset: "payment-agent",
    presetParams: {
      guardian: cfg.ownerAddress,
      approvedRecipients: cfg.recipients,
    },
  });
  console.log(`Wallet: ${wallet.address}`);

  const payroll = buildPayroll(cfg.recipients, cfg.amounts);
  const scheduler = new PayoutScheduler(sakClient, wallet, payroll);

  console.log(`\nStarting payout loop (interval: ${cfg.payoutInterval}s)...`);
  console.log("Press Ctrl+C to stop.\n");

  // Run first cycle immediately
  const result = await scheduler.runOnce();
  printResult(result);

  // Then schedule recurring
  const interval = setInterval(async () => {
    const r = await scheduler.runOnce();
    printResult(r);
  }, cfg.payoutInterval * 1000);

  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("\nBot stopped.");
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
