import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSdkClient } from "../utils/client.js";

// Mock the config module to avoid filesystem access
vi.mock("../utils/config.js", () => ({
  loadConfig: () => ({
    defaultChain: "base-sepolia",
    rpcUrl: "http://localhost:8545",
    bundlerUrl: "http://localhost:4337",
  }),
}));

describe("createSdkClient", () => {
  it("creates a client with default config", () => {
    const client = createSdkClient({});
    expect(client).toBeDefined();
  });

  it("creates a client with explicit options", () => {
    const client = createSdkClient({
      chain: "sepolia",
      rpcUrl: "http://custom:8545",
      bundlerUrl: "http://custom:4337",
    });
    expect(client).toBeDefined();
  });

  it("throws for unknown chain", () => {
    expect(() =>
      createSdkClient({ chain: "unknown-chain" }),
    ).toThrow('Unknown chain "unknown-chain"');
  });
});
