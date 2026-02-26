import { describe, it, expect, beforeEach } from "vitest";
import { MockSmartAgentKitClient } from "../mock-client.js";
import { parseEther, type Address, type Hex } from "viem";
import {
  SpendingLimitExceededError,
  WalletPausedError,
  ExecutionError,
} from "@smartagentkit/sdk";

const OWNER = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000" as Address;
const RECIPIENT_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const RECIPIENT_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const RANDOM_TARGET = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;

describe("MockSmartAgentKitClient", () => {
  let client: MockSmartAgentKitClient;

  beforeEach(() => {
    client = new MockSmartAgentKitClient();
  });

  // ─── createWallet ──────────────────────────────────────────────

  it("createWallet returns valid AgentWallet with address", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
    });

    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(wallet.owner).toBe(OWNER);
    expect(wallet.isDeployed).toBe(true);
  });

  it("createWallet with preset resolves policies", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader",
      presetParams: { guardian: OWNER },
    });

    expect(wallet.policies.length).toBeGreaterThan(0);
    const types = wallet.policies.map((p) => p.config.type);
    expect(types).toContain("spending-limit");
    expect(types).toContain("emergency-pause");
  });

  it("createWallet with custom initial balance", async () => {
    const custom = new MockSmartAgentKitClient({
      initialBalance: parseEther("50"),
    });
    const wallet = await custom.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
    });

    const balances = await custom.getBalances(wallet.address);
    expect(balances.eth).toBe(parseEther("50"));
  });

  // ─── execute ───────────────────────────────────────────────────

  it("execute deducts from spending limit", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader",
    });

    const before = await client.getRemainingAllowance(wallet.address, NATIVE_TOKEN);
    await client.execute(wallet, {
      target: RECIPIENT_A,
      value: parseEther("0.1"),
    });
    const after = await client.getRemainingAllowance(wallet.address, NATIVE_TOKEN);

    expect(after).toBe(before - parseEther("0.1"));
  });

  it("execute rejects when spending limit exceeded", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader", // 1 ETH daily limit
    });

    await expect(
      client.execute(wallet, {
        target: RECIPIENT_A,
        value: parseEther("2"), // Over the 1 ETH limit
      }),
    ).rejects.toThrow(SpendingLimitExceededError);
  });

  it("execute rejects when wallet is paused", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
    });

    await client.pause(wallet.address, OWNER_KEY);

    await expect(
      client.execute(wallet, {
        target: RECIPIENT_A,
        value: parseEther("0.01"),
      }),
    ).rejects.toThrow(WalletPausedError);
  });

  it("execute rejects non-allowlisted target", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "payment-agent",
      presetParams: {
        approvedRecipients: [RECIPIENT_A, RECIPIENT_B],
      },
    });

    await expect(
      client.execute(wallet, {
        target: RANDOM_TARGET, // Not on allowlist
        value: parseEther("0.01"),
      }),
    ).rejects.toThrow(ExecutionError);
  });

  it("execute allows allowlisted target", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "payment-agent",
      presetParams: {
        approvedRecipients: [RECIPIENT_A],
      },
    });

    const txHash = await client.execute(wallet, {
      target: RECIPIENT_A,
      value: parseEther("0.01"),
    });

    expect(txHash).toMatch(/^0x[0-9a-fA-F]+$/);
  });

  // ─── executeBatch ──────────────────────────────────────────────

  it("executeBatch is atomic — all-or-nothing", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader", // 1 ETH daily limit
    });

    // This batch totals 1.5 ETH, over the 1 ETH limit
    await expect(
      client.executeBatch(wallet, {
        calls: [
          { target: RECIPIENT_A, value: parseEther("0.8") },
          { target: RECIPIENT_B, value: parseEther("0.7") },
        ],
      }),
    ).rejects.toThrow(SpendingLimitExceededError);

    // Verify nothing was deducted (atomic rollback)
    const remaining = await client.getRemainingAllowance(wallet.address, NATIVE_TOKEN);
    expect(remaining).toBe(parseEther("1"));
  });

  it("executeBatch succeeds within limits", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader",
    });

    const txHash = await client.executeBatch(wallet, {
      calls: [
        { target: RECIPIENT_A, value: parseEther("0.3") },
        { target: RECIPIENT_B, value: parseEther("0.4") },
      ],
    });

    expect(txHash).toMatch(/^0x[0-9a-fA-F]+$/);
    const remaining = await client.getRemainingAllowance(wallet.address, NATIVE_TOKEN);
    expect(remaining).toBe(parseEther("0.3"));
  });

  // ─── pause / unpause ──────────────────────────────────────────

  it("pause/unpause toggles state", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
    });

    expect(await client.isPaused(wallet.address)).toBe(false);
    await client.pause(wallet.address, OWNER_KEY);
    expect(await client.isPaused(wallet.address)).toBe(true);
    await client.unpause(wallet.address, OWNER_KEY);
    expect(await client.isPaused(wallet.address)).toBe(false);
  });

  // ─── Session Management ────────────────────────────────────────

  it("createSession/revokeSession lifecycle", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
    });

    const { sessionKey, permissionId } = await client.createSession(
      wallet,
      {
        sessionKey: RECIPIENT_A,
        actions: [{ target: RECIPIENT_A, selector: "0xa9059cbb" as Hex }],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
      OWNER_KEY,
    );

    expect(sessionKey).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(client.getActiveSessions(wallet.address)).toHaveLength(1);

    await client.revokeSession(wallet, permissionId, OWNER_KEY);
    expect(client.getActiveSessions(wallet.address)).toHaveLength(0);
  });

  // ─── getBalances ───────────────────────────────────────────────

  it("getBalances returns seeded values", async () => {
    const mockUSDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const custom = new MockSmartAgentKitClient({
      initialBalance: parseEther("5"),
      tokenBalances: {
        [mockUSDC]: 1000_000000n, // 1000 USDC (6 decimals)
      },
    });

    const wallet = await custom.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
    });

    const balances = await custom.getBalances(wallet.address);
    expect(balances.eth).toBe(parseEther("5"));
    expect(balances.tokens).toHaveLength(1);
    expect(balances.tokens[0].symbol).toBe("USDC");
    expect(balances.tokens[0].balance).toBe(1000_000000n);
  });

  // ─── getRemainingAllowance ─────────────────────────────────────

  it("getRemainingAllowance tracks spending across operations", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
      preset: "defi-trader", // 1 ETH daily limit
    });

    await client.execute(wallet, { target: RECIPIENT_A, value: parseEther("0.3") });
    await client.execute(wallet, { target: RECIPIENT_A, value: parseEther("0.2") });

    const remaining = await client.getRemainingAllowance(wallet.address, NATIVE_TOKEN);
    expect(remaining).toBe(parseEther("0.5"));
  });

  // ─── setState / getWalletState ─────────────────────────────────

  it("setState/getWalletState manipulation", async () => {
    const wallet = await client.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
    });

    client.setState(wallet.address, {
      ethBalance: parseEther("100"),
      paused: true,
    });

    const state = client.getWalletState(wallet.address);
    expect(state.ethBalance).toBe(parseEther("100"));
    expect(state.paused).toBe(true);
  });

  // ─── Logging ───────────────────────────────────────────────────

  it("verbose mode logs operations", async () => {
    const verboseClient = new MockSmartAgentKitClient({ verbose: false });
    const wallet = await verboseClient.createWallet({
      owner: OWNER,
      ownerPrivateKey: OWNER_KEY,
    });

    await verboseClient.execute(wallet, { target: RECIPIENT_A, value: 0n });

    const log = verboseClient.getLog();
    expect(log.length).toBeGreaterThanOrEqual(2); // createWallet + execute
    expect(log[0].operation).toBe("createWallet");
    expect(log[1].operation).toBe("execute");
  });

  // ─── connectWallet ─────────────────────────────────────────────

  it("connectWallet creates state for unknown address", async () => {
    await client.connectWallet(RECIPIENT_A, OWNER_KEY);

    const paused = await client.isPaused(RECIPIENT_A);
    expect(paused).toBe(false);

    const balances = await client.getBalances(RECIPIENT_A);
    expect(balances.eth).toBe(parseEther("10"));
  });
});
