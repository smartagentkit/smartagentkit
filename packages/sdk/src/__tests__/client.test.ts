import { describe, it, expect } from "vitest";
import { baseSepolia, sepolia } from "viem/chains";
import { SmartAgentKitClient } from "../client.js";
import { WalletCreationError, PolicyConfigError, ExecutionError } from "../errors.js";
import type { ModuleAddresses } from "../types.js";

const MOCK_MODULE_ADDRESSES: ModuleAddresses = {
  spendingLimitHook: "0x1111111111111111111111111111111111111111",
  allowlistHook: "0x2222222222222222222222222222222222222222",
  emergencyPauseHook: "0x3333333333333333333333333333333333333333",
};

function makeClient(overrides?: { moduleAddresses?: ModuleAddresses }) {
  return new SmartAgentKitClient({
    chain: baseSepolia,
    rpcUrl: "http://localhost:8545",
    bundlerUrl: "http://localhost:4337",
    moduleAddresses: overrides?.moduleAddresses,
  });
}

/** Client on a chain with no built-in deployments, so moduleAddresses stays undefined */
function makeClientNoDeployments() {
  return new SmartAgentKitClient({
    chain: sepolia,
    rpcUrl: "http://localhost:8545",
    bundlerUrl: "http://localhost:4337",
  });
}

describe("SmartAgentKitClient", () => {
  describe("constructor", () => {
    it("creates a client with valid config", () => {
      const client = makeClient();
      expect(client).toBeDefined();
    });

    it("creates a client with module addresses", () => {
      const client = makeClient({ moduleAddresses: MOCK_MODULE_ADDRESSES });
      expect(client).toBeDefined();
    });
  });

  describe("createWallet", () => {
    it("throws WalletCreationError when moduleAddresses missing with policies", async () => {
      const client = makeClient(); // no moduleAddresses

      await expect(
        client.createWallet({
          owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          ownerPrivateKey:
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
          policies: [
            {
              type: "spending-limit",
              limits: [
                {
                  token: "0x0000000000000000000000000000000000000000",
                  limit: 1000000000000000000n,
                  window: 86400,
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow(WalletCreationError);
    });

    it("throws WalletCreationError when preset used without moduleAddresses", async () => {
      const client = makeClientNoDeployments();

      await expect(
        client.createWallet({
          owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          ownerPrivateKey:
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
          preset: "minimal",
          presetParams: {
            guardian: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          },
        }),
      ).rejects.toThrow("moduleAddresses must be configured");
    });

    it("throws WalletCreationError when specific module address missing", async () => {
      const client = makeClient({
        moduleAddresses: {
          spendingLimitHook: "0x1111111111111111111111111111111111111111",
          allowlistHook: "0x0000000000000000000000000000000000000000",
          emergencyPauseHook: "0x3333333333333333333333333333333333333333",
        },
      });

      await expect(
        client.createWallet({
          owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          ownerPrivateKey:
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
          policies: [
            {
              type: "allowlist",
              mode: "allow",
              targets: [
                {
                  address: "0x4444444444444444444444444444444444444444",
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow(WalletCreationError);
    });
  });

  describe("execute", () => {
    it("throws ExecutionError when wallet not connected", async () => {
      const client = makeClient();

      await expect(
        client.execute(
          {
            address: "0x0000000000000000000000000000000000000001",
            owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            chain: baseSepolia,
            isDeployed: true,
            policies: [],
            sessions: [],
          },
          {
            target: "0x4444444444444444444444444444444444444444",
            value: 0n,
            data: "0x",
          },
        ),
      ).rejects.toThrow("No client found for wallet");
    });

    it("throws ExecutionError with proper type", async () => {
      const client = makeClient();

      await expect(
        client.execute(
          {
            address: "0x0000000000000000000000000000000000000001",
            owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            chain: baseSepolia,
            isDeployed: true,
            policies: [],
            sessions: [],
          },
          {
            target: "0x4444444444444444444444444444444444444444",
          },
        ),
      ).rejects.toBeInstanceOf(ExecutionError);
    });
  });

  describe("executeBatch", () => {
    it("throws ExecutionError when wallet not connected", async () => {
      const client = makeClient();

      await expect(
        client.executeBatch(
          {
            address: "0x0000000000000000000000000000000000000001",
            owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            chain: baseSepolia,
            isDeployed: true,
            policies: [],
            sessions: [],
          },
          {
            calls: [
              { target: "0x4444444444444444444444444444444444444444" },
              { target: "0x5555555555555555555555555555555555555555" },
            ],
          },
        ),
      ).rejects.toThrow(ExecutionError);
    });
  });

  describe("getRemainingAllowance", () => {
    it("throws PolicyConfigError when moduleAddresses not configured", async () => {
      const client = makeClientNoDeployments();

      await expect(
        client.getRemainingAllowance(
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000000",
        ),
      ).rejects.toThrow(PolicyConfigError);
    });
  });

  describe("isPaused", () => {
    it("throws PolicyConfigError when moduleAddresses not configured", async () => {
      const client = makeClientNoDeployments();

      await expect(
        client.isPaused("0x0000000000000000000000000000000000000001"),
      ).rejects.toThrow(PolicyConfigError);
    });
  });

  describe("getBalances", () => {
    // Note: getBalances only needs a publicClient, which always exists.
    // Testing against a real RPC would require a running node.
    it("method exists and is callable", () => {
      const client = makeClient();
      expect(typeof client.getBalances).toBe("function");
    });
  });

  describe("pause / unpause", () => {
    it("throws PolicyConfigError for pause when moduleAddresses missing", async () => {
      const client = makeClientNoDeployments();

      await expect(
        client.pause(
          "0x0000000000000000000000000000000000000001",
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        ),
      ).rejects.toThrow(PolicyConfigError);
    });

    it("throws PolicyConfigError for unpause when moduleAddresses missing", async () => {
      const client = makeClientNoDeployments();

      await expect(
        client.unpause(
          "0x0000000000000000000000000000000000000001",
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        ),
      ).rejects.toThrow(PolicyConfigError);
    });
  });

  describe("connectWallet / session stubs", () => {
    it("createSession throws when wallet not connected", async () => {
      const client = makeClient();
      await expect(
        client.createSession(
          {
            address: "0x0000000000000000000000000000000000000001",
            owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            chain: baseSepolia,
            isDeployed: true,
            policies: [],
            sessions: [],
          },
          {
            sessionKey: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            actions: [],
            expiresAt: 9999999999,
          },
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        ),
      ).rejects.toThrow("No client found for wallet");
    });

    it("predictAddress throws not implemented", async () => {
      const client = makeClient();
      await expect(
        client.predictAddress(
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        ),
      ).rejects.toThrow("Not yet implemented");
    });
  });
});
