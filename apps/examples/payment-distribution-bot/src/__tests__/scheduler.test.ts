import { describe, it, expect } from "vitest";
import { parseEther } from "viem";
import type { Address, Hex } from "viem";
import { MockSmartAgentKitClient } from "@smartagentkit/testing";
import { PayoutScheduler } from "../scheduler.js";
import { buildPayroll } from "../payroll.js";

// WARNING: Well-known Foundry test key — never use with real funds
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
// Address derived from the Foundry test key above
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const RECIPIENT_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const RECIPIENT_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const RECIPIENT_C = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;

async function setup(opts?: {
  dailyLimit?: bigint;
  amounts?: bigint[];
  paused?: boolean;
}) {
  const dailyLimit = opts?.dailyLimit ?? parseEther("0.1");
  const amounts = opts?.amounts ?? [
    parseEther("0.03"),
    parseEther("0.04"),
    parseEther("0.02"),
  ];

  const client = new MockSmartAgentKitClient({
    initialBalance: parseEther("10"),
  });

  const wallet = await client.createWallet({
    owner: OWNER,
    ownerPrivateKey: OWNER_KEY,
    preset: "payment-agent",
    presetParams: {
      guardian: OWNER,
      dailyLimit,
      approvedRecipients: [RECIPIENT_A, RECIPIENT_B, RECIPIENT_C],
    },
  });

  if (opts?.paused) {
    await client.pause(wallet.address, OWNER_KEY);
  }

  const payroll = buildPayroll(
    [RECIPIENT_A, RECIPIENT_B, RECIPIENT_C],
    amounts,
  );

  const scheduler = new PayoutScheduler(client, wallet, payroll);
  return { client, wallet, scheduler, payroll };
}

describe("PayoutScheduler", () => {
  it("pays all recipients when within budget", async () => {
    const { scheduler } = await setup();
    const result = await scheduler.runOnce();

    expect(result.cycle).toBe(1);
    expect(result.paid).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(result.txHash).toBeTruthy();
    expect(result.error).toBeNull();
  });

  it("skips all when wallet is paused", async () => {
    const { scheduler } = await setup({ paused: true });
    const result = await scheduler.runOnce();

    expect(result.paid).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
    expect(result.txHash).toBeNull();
    expect(result.error).toContain("paused");
  });

  it("pays partial when budget is tight", async () => {
    // Only 0.05 ETH budget — enough for recipient A (0.03) + C (0.02) but not B (0.04)
    const { scheduler } = await setup({ dailyLimit: parseEther("0.05") });
    const result = await scheduler.runOnce();

    // Recipients processed in order: A (0.03) fits, B (0.04) doesn't, C (0.02) fits
    expect(result.paid).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.paid[0].recipient).toBe(RECIPIENT_A);
    expect(result.paid[1].recipient).toBe(RECIPIENT_C);
    expect(result.skipped[0].recipient).toBe(RECIPIENT_B);
    expect(result.txHash).toBeTruthy();
    expect(result.error).toBeNull();
  });

  it("skips all when budget is zero", async () => {
    // Budget smaller than any single payment
    const { scheduler } = await setup({ dailyLimit: parseEther("0.01") });
    const result = await scheduler.runOnce();

    expect(result.paid).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
    expect(result.txHash).toBeNull();
    expect(result.error).toContain("spending limit");
  });

  it("increments cycle count on each run", async () => {
    const { scheduler } = await setup();
    const r1 = await scheduler.runOnce();
    const r2 = await scheduler.runOnce();
    const r3 = await scheduler.runOnce();

    expect(r1.cycle).toBe(1);
    expect(r2.cycle).toBe(2);
    expect(r3.cycle).toBe(3);
  });

  it("second cycle fails after first cycle consumes budget", async () => {
    // Budget 0.1 ETH, total payroll 0.09 ETH per cycle
    const { scheduler } = await setup({ dailyLimit: parseEther("0.1") });

    const r1 = await scheduler.runOnce();
    expect(r1.paid).toHaveLength(3);
    expect(r1.error).toBeNull();

    // Only 0.01 ETH remaining — no individual payment fits
    const r2 = await scheduler.runOnce();
    expect(r2.paid).toHaveLength(0);
    expect(r2.skipped).toHaveLength(3);
    expect(r2.error).toContain("spending limit");
  });

  it("deducts from balance correctly", async () => {
    const { client, wallet, scheduler } = await setup({
      dailyLimit: parseEther("1"),
    });

    await scheduler.runOnce();

    const balances = await client.getBalances(wallet.address);
    // Started with 10 ETH, paid 0.03 + 0.04 + 0.02 = 0.09 ETH
    expect(balances.eth).toBe(parseEther("10") - parseEther("0.09"));
  });
});

describe("buildPayroll", () => {
  it("builds entries with correct labels", () => {
    const payroll = buildPayroll(
      [RECIPIENT_A, RECIPIENT_B],
      [parseEther("1"), parseEther("2")],
    );

    expect(payroll).toHaveLength(2);
    expect(payroll[0].recipient).toBe(RECIPIENT_A);
    expect(payroll[0].amount).toBe(parseEther("1"));
    expect(payroll[0].label).toContain("Recipient 1");
    expect(payroll[1].label).toContain("Recipient 2");
  });
});
