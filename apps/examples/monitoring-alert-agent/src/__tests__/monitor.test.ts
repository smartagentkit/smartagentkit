import { describe, it, expect } from "vitest";
import { parseEther } from "viem";
import type { Address, Hex } from "viem";
import { MockSmartAgentKitClient } from "@smartagentkit/testing";
import { DEFAULT_RULES, type WalletSnapshot, type AlertThresholds } from "../rules.js";
import { monitorCycle } from "../cycle.js";

// WARNING: Well-known Foundry test key — never use with real funds
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
// Address derived from the Foundry test key above
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000" as Address;

const DEFAULT_THRESHOLDS: AlertThresholds = {
  lowBalanceWei: parseEther("0.1"),
  spendingRatePercent: 0.8,
  maxExpectedSessions: 2,
};

// ─── Alert Rule Unit Tests ────────────────────────────────────────

describe("alert rules", () => {
  const [lowBalanceRule, highSpendingRule, unexpectedSessionsRule] = DEFAULT_RULES;

  function makeSnapshot(overrides: Partial<WalletSnapshot> = {}): WalletSnapshot {
    return {
      address: "0x0000000000000000000000000000000000000001" as Address,
      ethBalance: parseEther("10"),
      remainingAllowance: parseEther("1"),
      spendingLimit: parseEther("1"),
      paused: false,
      activeSessions: [],
      ...overrides,
    };
  }

  describe("low-balance rule", () => {
    it("fires when balance is below threshold", () => {
      const snapshot = makeSnapshot({ ethBalance: parseEther("0.05") });
      const alert = lowBalanceRule.evaluate(snapshot, DEFAULT_THRESHOLDS);

      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe("warning");
      expect(alert!.rule).toBe("low-balance");
      expect(alert!.message).toContain("Low ETH balance");
    });

    it("does not fire when balance is above threshold", () => {
      const snapshot = makeSnapshot({ ethBalance: parseEther("1") });
      const alert = lowBalanceRule.evaluate(snapshot, DEFAULT_THRESHOLDS);
      expect(alert).toBeNull();
    });

    it("does not fire when wallet is paused", () => {
      const snapshot = makeSnapshot({
        ethBalance: parseEther("0.01"),
        paused: true,
      });
      const alert = lowBalanceRule.evaluate(snapshot, DEFAULT_THRESHOLDS);
      expect(alert).toBeNull();
    });
  });

  describe("high-spending-rate rule", () => {
    it("fires critical + pause when spending ≥80%", () => {
      const snapshot = makeSnapshot({
        spendingLimit: parseEther("1"),
        remainingAllowance: parseEther("0.1"), // 90% spent
      });
      const alert = highSpendingRule.evaluate(snapshot, DEFAULT_THRESHOLDS);

      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe("critical");
      expect(alert!.action).toBe("pause");
      expect(alert!.message).toContain("90.0%");
    });

    it("does not fire when spending is below threshold", () => {
      const snapshot = makeSnapshot({
        spendingLimit: parseEther("1"),
        remainingAllowance: parseEther("0.5"), // 50% spent
      });
      const alert = highSpendingRule.evaluate(snapshot, DEFAULT_THRESHOLDS);
      expect(alert).toBeNull();
    });

    it("fires at exactly 80%", () => {
      const snapshot = makeSnapshot({
        spendingLimit: parseEther("1"),
        remainingAllowance: parseEther("0.2"), // exactly 80% spent
      });
      const alert = highSpendingRule.evaluate(snapshot, DEFAULT_THRESHOLDS);
      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe("critical");
    });

    it("does not fire when wallet is paused", () => {
      const snapshot = makeSnapshot({
        spendingLimit: parseEther("1"),
        remainingAllowance: parseEther("0.05"),
        paused: true,
      });
      const alert = highSpendingRule.evaluate(snapshot, DEFAULT_THRESHOLDS);
      expect(alert).toBeNull();
    });

    it("does not fire when spending limit is zero", () => {
      const snapshot = makeSnapshot({
        spendingLimit: 0n,
        remainingAllowance: 0n,
      });
      const alert = highSpendingRule.evaluate(snapshot, DEFAULT_THRESHOLDS);
      expect(alert).toBeNull();
    });
  });

  describe("unexpected-sessions rule", () => {
    it("fires when sessions exceed max", () => {
      const snapshot = makeSnapshot({
        activeSessions: [
          { sessionKey: "0x01" as Address, actions: [], expiresAt: 99999999999, isActive: true },
          { sessionKey: "0x02" as Address, actions: [], expiresAt: 99999999999, isActive: true },
          { sessionKey: "0x03" as Address, actions: [], expiresAt: 99999999999, isActive: true },
        ],
      });
      const alert = unexpectedSessionsRule.evaluate(snapshot, DEFAULT_THRESHOLDS);

      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe("warning");
      expect(alert!.rule).toBe("unexpected-sessions");
      expect(alert!.message).toContain("3 active sessions");
    });

    it("does not fire when sessions are within limit", () => {
      const snapshot = makeSnapshot({
        activeSessions: [
          { sessionKey: "0x01" as Address, actions: [], expiresAt: 99999999999, isActive: true },
        ],
      });
      const alert = unexpectedSessionsRule.evaluate(snapshot, DEFAULT_THRESHOLDS);
      expect(alert).toBeNull();
    });
  });
});

// ─── monitorCycle Integration Tests ────────────────────────────────

describe("monitorCycle", () => {
  it("returns zero alerts for a healthy wallet", async () => {
    const client = new MockSmartAgentKitClient({
      initialBalance: parseEther("10"),
    });
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader",
      presetParams: { guardian: OWNER },
    });

    const alerts = await monitorCycle(
      client,
      [wallet.address],
      OWNER_KEY,
      parseEther("1"),
      DEFAULT_THRESHOLDS,
    );

    expect(alerts).toBe(0);
  });

  it("detects high spending and auto-pauses", async () => {
    const client = new MockSmartAgentKitClient({
      initialBalance: parseEther("10"),
    });
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader",
      presetParams: { guardian: OWNER },
    });

    // Spend 0.9 ETH of 1 ETH limit (90%)
    await client.execute(wallet, {
      target: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
      value: parseEther("0.9"),
    });

    const alerts = await monitorCycle(
      client,
      [wallet.address],
      OWNER_KEY,
      parseEther("1"),
      DEFAULT_THRESHOLDS,
    );

    // Should fire high-spending-rate alert
    expect(alerts).toBeGreaterThanOrEqual(1);

    // Wallet should now be paused
    const paused = await client.isPaused(wallet.address);
    expect(paused).toBe(true);
  });

  it("monitors multiple wallets", async () => {
    const client = new MockSmartAgentKitClient({
      initialBalance: parseEther("10"),
    });
    const wallet1 = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader",
      presetParams: { guardian: OWNER },
    });
    const wallet2 = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader",
      presetParams: { guardian: OWNER },
    });

    const alerts = await monitorCycle(
      client,
      [wallet1.address, wallet2.address],
      OWNER_KEY,
      parseEther("1"),
      DEFAULT_THRESHOLDS,
    );

    expect(alerts).toBe(0);
  });

  it("does not re-pause an already-paused wallet", async () => {
    const client = new MockSmartAgentKitClient({
      initialBalance: parseEther("10"),
    });
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader",
      presetParams: { guardian: OWNER },
    });

    // Spend 90%, then pause manually
    await client.execute(wallet, {
      target: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
      value: parseEther("0.9"),
    });
    await client.pause(wallet.address, OWNER_KEY);

    // monitorCycle should still see the high-spending alert, but not try to pause again
    // (the rule checks `!paused` before calling pause)
    // Since wallet is paused, the spending rule won't fire (it checks paused state)
    const alerts = await monitorCycle(
      client,
      [wallet.address],
      OWNER_KEY,
      parseEther("1"),
      DEFAULT_THRESHOLDS,
    );

    // Paused wallet suppresses low-balance and high-spending rules
    expect(alerts).toBe(0);
  });
});
