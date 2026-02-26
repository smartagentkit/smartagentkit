import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSmartAgentKitTools } from "../tools.js";

// Mock SmartAgentKitClient
function createMockClient() {
  return {
    getBalances: vi.fn().mockResolvedValue({
      eth: 1500000000000000000n, // 1.5 ETH
      tokens: [],
    }),
    getRemainingAllowance: vi.fn().mockResolvedValue(
      1000000000000000000n, // 1 ETH
    ),
    execute: vi.fn().mockResolvedValue("0xabcdef1234567890"),
    executeBatch: vi.fn().mockResolvedValue("0xbatchhash1234567890"),
    isPaused: vi.fn().mockResolvedValue(false),
    getActiveSessions: vi.fn().mockReturnValue([]),
  } as any;
}

const WALLET_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const SESSION_KEY = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

describe("createSmartAgentKitTools", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof createSmartAgentKitTools>;

  beforeEach(() => {
    mockClient = createMockClient();
    tools = createSmartAgentKitTools(mockClient, WALLET_ADDRESS, SESSION_KEY);
  });

  it("returns 5 tools", () => {
    expect(tools).toHaveLength(5);
  });

  it("returns tools with correct names", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("check_wallet_balance");
    expect(names).toContain("check_spending_allowance");
    expect(names).toContain("send_transaction");
    expect(names).toContain("send_batch_transaction");
    expect(names).toContain("check_wallet_status");
  });

  it("all tools have descriptions", () => {
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  describe("check_wallet_balance", () => {
    it("returns balance as JSON", async () => {
      const tool = tools.find((t) => t.name === "check_wallet_balance")!;
      const result = await tool.invoke({});
      const parsed = JSON.parse(result);

      expect(parsed.wallet).toBe(WALLET_ADDRESS);
      expect(parsed.eth).toBe("1.5");
      expect(parsed.ethWei).toBe("1500000000000000000");
      expect(mockClient.getBalances).toHaveBeenCalledWith(WALLET_ADDRESS);
    });

    it("handles errors gracefully", async () => {
      mockClient.getBalances.mockRejectedValue(new Error("RPC error"));
      const tool = tools.find((t) => t.name === "check_wallet_balance")!;
      const result = await tool.invoke({});
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe("RPC error");
    });
  });

  describe("check_spending_allowance", () => {
    it("returns allowance as JSON", async () => {
      const tool = tools.find(
        (t) => t.name === "check_spending_allowance",
      )!;
      const result = await tool.invoke({
        token: "0x0000000000000000000000000000000000000000",
      });
      const parsed = JSON.parse(result);

      expect(parsed.wallet).toBe(WALLET_ADDRESS);
      expect(parsed.token).toBe(
        "0x0000000000000000000000000000000000000000",
      );
      expect(parsed.remainingWei).toBe("1000000000000000000");
      expect(parsed.remaining).toBe("1");
      expect(mockClient.getRemainingAllowance).toHaveBeenCalledWith(
        WALLET_ADDRESS,
        "0x0000000000000000000000000000000000000000",
      );
    });

    it("handles errors gracefully", async () => {
      mockClient.getRemainingAllowance.mockRejectedValue(
        new Error("moduleAddresses not configured"),
      );
      const tool = tools.find(
        (t) => t.name === "check_spending_allowance",
      )!;
      const result = await tool.invoke({
        token: "0x0000000000000000000000000000000000000000",
      });
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe("moduleAddresses not configured");
    });
  });

  describe("send_transaction", () => {
    it("sends transaction and returns hash", async () => {
      const tool = tools.find((t) => t.name === "send_transaction")!;
      const result = await tool.invoke({
        target: "0x4444444444444444444444444444444444444444",
        value: "1000000000000000",
        data: "0xa9059cbb",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.transactionHash).toBe("0xabcdef1234567890");
      expect(mockClient.execute).toHaveBeenCalled();
    });

    it("defaults value to 0 and data to 0x", async () => {
      const tool = tools.find((t) => t.name === "send_transaction")!;
      await tool.invoke({
        target: "0x4444444444444444444444444444444444444444",
      });

      const callArgs = mockClient.execute.mock.calls[0][1];
      expect(callArgs.value).toBe(0n);
      expect(callArgs.data).toBe("0x");
    });

    it("passes session key when provided", async () => {
      const tool = tools.find((t) => t.name === "send_transaction")!;
      await tool.invoke({
        target: "0x4444444444444444444444444444444444444444",
      });

      const callArgs = mockClient.execute.mock.calls[0][1];
      expect(callArgs.sessionKey).toBe(SESSION_KEY);
    });

    it("handles execution errors", async () => {
      mockClient.execute.mockRejectedValue(
        new Error("Spending limit exceeded"),
      );
      const tool = tools.find((t) => t.name === "send_transaction")!;
      const result = await tool.invoke({
        target: "0x4444444444444444444444444444444444444444",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Spending limit exceeded");
    });
  });

  describe("send_batch_transaction", () => {
    it("sends batch and returns hash with call count", async () => {
      const tool = tools.find((t) => t.name === "send_batch_transaction")!;
      const result = await tool.invoke({
        calls: [
          {
            target: "0x4444444444444444444444444444444444444444",
            value: "0",
            data: "0xa9059cbb",
          },
          {
            target: "0x5555555555555555555555555555555555555555",
            value: "1000000000000000000",
          },
        ],
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.transactionHash).toBe("0xbatchhash1234567890");
      expect(parsed.callCount).toBe(2);
      expect(mockClient.executeBatch).toHaveBeenCalled();
    });

    it("passes correct call parameters", async () => {
      const tool = tools.find((t) => t.name === "send_batch_transaction")!;
      await tool.invoke({
        calls: [
          {
            target: "0x4444444444444444444444444444444444444444",
            value: "500",
            data: "0xdeadbeef",
          },
        ],
      });

      const callArgs = mockClient.executeBatch.mock.calls[0][1];
      expect(callArgs.calls).toHaveLength(1);
      expect(callArgs.calls[0].target).toBe(
        "0x4444444444444444444444444444444444444444",
      );
      expect(callArgs.calls[0].value).toBe(500n);
      expect(callArgs.calls[0].data).toBe("0xdeadbeef");
      expect(callArgs.sessionKey).toBe(SESSION_KEY);
    });

    it("defaults value to 0 and data to 0x for each call", async () => {
      const tool = tools.find((t) => t.name === "send_batch_transaction")!;
      await tool.invoke({
        calls: [
          {
            target: "0x4444444444444444444444444444444444444444",
          },
        ],
      });

      const callArgs = mockClient.executeBatch.mock.calls[0][1];
      expect(callArgs.calls[0].value).toBe(0n);
      expect(callArgs.calls[0].data).toBe("0x");
    });

    it("handles batch execution errors", async () => {
      mockClient.executeBatch.mockRejectedValue(
        new Error("Batch execution reverted"),
      );
      const tool = tools.find((t) => t.name === "send_batch_transaction")!;
      const result = await tool.invoke({
        calls: [
          {
            target: "0x4444444444444444444444444444444444444444",
          },
        ],
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Batch execution reverted");
    });
  });

  describe("check_wallet_status", () => {
    it("returns active status", async () => {
      const tool = tools.find((t) => t.name === "check_wallet_status")!;
      const result = await tool.invoke({});
      const parsed = JSON.parse(result);

      expect(parsed.wallet).toBe(WALLET_ADDRESS);
      expect(parsed.paused).toBe(false);
      expect(parsed.status).toBe("active");
      expect(mockClient.isPaused).toHaveBeenCalledWith(WALLET_ADDRESS);
    });

    it("returns paused status", async () => {
      mockClient.isPaused.mockResolvedValue(true);
      const tool = tools.find((t) => t.name === "check_wallet_status")!;
      const result = await tool.invoke({});
      const parsed = JSON.parse(result);

      expect(parsed.paused).toBe(true);
      expect(parsed.status).toBe("paused");
    });

    it("handles errors gracefully", async () => {
      mockClient.isPaused.mockRejectedValue(
        new Error("moduleAddresses not configured"),
      );
      const tool = tools.find((t) => t.name === "check_wallet_status")!;
      const result = await tool.invoke({});
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe("moduleAddresses not configured");
    });
  });

  describe("without session key", () => {
    it("creates tools without session key", () => {
      const toolsNoSession = createSmartAgentKitTools(
        mockClient,
        WALLET_ADDRESS,
      );
      expect(toolsNoSession).toHaveLength(5);
    });

    it("passes undefined session key", async () => {
      const toolsNoSession = createSmartAgentKitTools(
        mockClient,
        WALLET_ADDRESS,
      );
      const tool = toolsNoSession.find(
        (t) => t.name === "send_transaction",
      )!;
      await tool.invoke({
        target: "0x4444444444444444444444444444444444444444",
      });

      const callArgs = mockClient.execute.mock.calls[0][1];
      expect(callArgs.sessionKey).toBeUndefined();
    });

    it("passes undefined session key for batch transactions", async () => {
      const toolsNoSession = createSmartAgentKitTools(
        mockClient,
        WALLET_ADDRESS,
      );
      const tool = toolsNoSession.find(
        (t) => t.name === "send_batch_transaction",
      )!;
      await tool.invoke({
        calls: [
          {
            target: "0x4444444444444444444444444444444444444444",
          },
        ],
      });

      const callArgs = mockClient.executeBatch.mock.calls[0][1];
      expect(callArgs.sessionKey).toBeUndefined();
    });
  });
});
