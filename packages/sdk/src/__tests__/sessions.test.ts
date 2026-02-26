import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSession,
  getSmartSessionsModule,
  computePermissionId,
  encodeUseSessionSignature,
  encodeEnableSessionSignature,
  getRemoveAction,
  SMART_SESSIONS_ADDRESS,
  OWNABLE_VALIDATOR_ADDRESS,
  SmartSessionMode,
} from "../sessions.js";
import { SessionError } from "../errors.js";
import type { CreateSessionParams } from "../types.js";

const SESSION_KEY: `0x${string}` =
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const CHAIN_ID = 84532n; // Base Sepolia

const TARGET: `0x${string}` =
  "0x4444444444444444444444444444444444444444";
const SELECTOR: `0x${string}` = "0xa9059cbb"; // transfer(address,uint256)

function makeParams(overrides?: Partial<CreateSessionParams>): CreateSessionParams {
  return {
    sessionKey: SESSION_KEY,
    actions: [{ target: TARGET, selector: SELECTOR }],
    expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    ...overrides,
  };
}

describe("sessions", () => {
  describe("buildSession", () => {
    it("builds a valid session struct", () => {
      const params = makeParams();
      const session = buildSession(SESSION_KEY, params, CHAIN_ID);

      expect(session.sessionValidator).toBe(OWNABLE_VALIDATOR_ADDRESS);
      expect(session.chainId).toBe(CHAIN_ID);
      expect(session.permitERC4337Paymaster).toBe(true);
      expect(session.actions.length).toBe(1);
      expect(session.actions[0].actionTarget).toBe(TARGET);
      expect(session.actions[0].actionTargetSelector).toBe(SELECTOR);
      expect(session.userOpPolicies.length).toBeGreaterThanOrEqual(1);
      expect(session.salt).toBeDefined();
      expect(session.sessionValidatorInitData).toBeDefined();
    });

    it("uses custom session validator when provided", () => {
      const customValidator: `0x${string}` =
        "0x9999999999999999999999999999999999999999";
      const session = buildSession(
        SESSION_KEY,
        makeParams(),
        CHAIN_ID,
        customValidator,
      );
      expect(session.sessionValidator).toBe(customValidator);
    });

    it("adds spending limits policy when specified", () => {
      const params = makeParams({
        spendingLimits: [
          {
            token: "0x0000000000000000000000000000000000000000",
            limit: 1000000000000000000n,
          },
        ],
      });
      const session = buildSession(SESSION_KEY, params, CHAIN_ID);

      // TimeFrame + SpendingLimits = 2 userOp policies
      expect(session.userOpPolicies.length).toBe(2);
    });

    it("supports multiple actions", () => {
      const params = makeParams({
        actions: [
          { target: TARGET, selector: SELECTOR },
          {
            target: "0x5555555555555555555555555555555555555555",
            selector: "0x23b872dd", // transferFrom
          },
        ],
      });
      const session = buildSession(SESSION_KEY, params, CHAIN_ID);
      expect(session.actions.length).toBe(2);
    });

    it("throws SessionError when expiresAt is in the past", () => {
      const params = makeParams({ expiresAt: 1000 });
      expect(() => buildSession(SESSION_KEY, params, CHAIN_ID)).toThrow(
        SessionError,
      );
      expect(() => buildSession(SESSION_KEY, params, CHAIN_ID)).toThrow(
        "expiresAt must be in the future",
      );
    });

    it("throws SessionError when expiresAt is zero", () => {
      const params = makeParams({ expiresAt: 0 });
      expect(() => buildSession(SESSION_KEY, params, CHAIN_ID)).toThrow(
        SessionError,
      );
    });

    it("throws SessionError when actions array is empty", () => {
      const params = makeParams({ actions: [] });
      expect(() => buildSession(SESSION_KEY, params, CHAIN_ID)).toThrow(
        "Session must have at least one allowed action",
      );
    });

    it("includes erc7739Policies with empty arrays", () => {
      const session = buildSession(SESSION_KEY, makeParams(), CHAIN_ID);
      expect(session.erc7739Policies).toEqual({
        allowedERC7739Content: [],
        erc1271Policies: [],
      });
    });
  });

  describe("getSmartSessionsModule", () => {
    it("returns a module with correct address", () => {
      const module = getSmartSessionsModule();
      expect(module.address).toBeDefined();
      expect(module.initData).toBeDefined();
    });

    it("accepts optional sessions", () => {
      const session = buildSession(SESSION_KEY, makeParams(), CHAIN_ID);
      const module = getSmartSessionsModule([session]);
      expect(module.address).toBeDefined();
    });
  });

  describe("computePermissionId", () => {
    it("returns a deterministic hex value", () => {
      const session = buildSession(SESSION_KEY, makeParams(), CHAIN_ID);
      const id1 = computePermissionId(session);
      const id2 = computePermissionId(session);

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^0x[0-9a-fA-F]+$/);
    });

    it("produces different IDs for different sessions", () => {
      const session1 = buildSession(
        SESSION_KEY,
        makeParams({ expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
        CHAIN_ID,
      );
      const session2 = buildSession(
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        makeParams({ expiresAt: Math.floor(Date.now() / 1000) + 7200 }),
        CHAIN_ID,
      );

      const id1 = computePermissionId(session1);
      const id2 = computePermissionId(session2);
      expect(id1).not.toBe(id2);
    });
  });

  describe("encodeUseSessionSignature", () => {
    it("returns encoded hex", () => {
      const permissionId =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
      const signature =
        "0xdeadbeef" as `0x${string}`;

      const result = encodeUseSessionSignature(permissionId, signature);
      expect(result).toMatch(/^0x/);
      expect(result.length).toBeGreaterThan(4);
    });
  });

  describe("encodeEnableSessionSignature", () => {
    it("returns encoded hex with enable data", () => {
      const permissionId =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
      const signature = "0xdeadbeef" as `0x${string}`;
      const enableSessionData = {
        enableSession: {
          chainDigestIndex: 0,
          hashesAndChainIds: [{ chainId: CHAIN_ID, sessionDigest: permissionId }],
          sessionToEnable: buildSession(SESSION_KEY, makeParams(), CHAIN_ID),
          permissionEnableSig: signature,
        },
        validator: OWNABLE_VALIDATOR_ADDRESS,
        accountType: "safe" as const,
      };

      const result = encodeEnableSessionSignature(
        permissionId,
        signature,
        enableSessionData,
      );
      expect(result).toMatch(/^0x/);
      expect(result.length).toBeGreaterThan(4);
    });
  });

  describe("getRemoveAction", () => {
    it("returns an action with to, value, data", () => {
      const permissionId =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
      const action = getRemoveAction(permissionId);

      expect(action.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(typeof action.value).toBe("bigint");
      expect(action.data).toMatch(/^0x/);
    });
  });

  describe("constants", () => {
    it("exports SMART_SESSIONS_ADDRESS", () => {
      expect(SMART_SESSIONS_ADDRESS).toBe(
        "0x00000000002B0eCfbD0496EE71e01257dA0E37DE",
      );
    });

    it("exports OWNABLE_VALIDATOR_ADDRESS", () => {
      expect(OWNABLE_VALIDATOR_ADDRESS).toBe(
        "0x2483DA3A338895199E5e538530213157e931Bf06",
      );
    });

    it("exports SmartSessionMode enum", () => {
      expect(SmartSessionMode.USE).toBeDefined();
      expect(SmartSessionMode.ENABLE).toBeDefined();
    });
  });

  describe("client session management", () => {
    // These test the SmartAgentKitClient session methods (unit-level)
    // We import SmartAgentKitClient directly
    let SmartAgentKitClientClass: typeof import("../client.js").SmartAgentKitClient;

    beforeEach(async () => {
      const { SmartAgentKitClient } = await import("../client.js");
      SmartAgentKitClientClass = SmartAgentKitClient;
    });

    it("getActiveSessions returns empty for unknown wallet", () => {
      const { baseSepolia } = require("viem/chains");
      const client = new SmartAgentKitClientClass({
        chain: baseSepolia,
        rpcUrl: "http://localhost:8545",
        bundlerUrl: "http://localhost:4337",
      });

      const sessions = client.getActiveSessions(
        "0x0000000000000000000000000000000000000001",
      );
      expect(sessions).toEqual([]);
    });

    it("createSession throws when wallet not connected", async () => {
      const { baseSepolia } = require("viem/chains");
      const client = new SmartAgentKitClientClass({
        chain: baseSepolia,
        rpcUrl: "http://localhost:8545",
        bundlerUrl: "http://localhost:4337",
      });

      await expect(
        client.createSession(
          {
            address: "0x0000000000000000000000000000000000000001",
            owner: SESSION_KEY,
            chain: baseSepolia,
            isDeployed: true,
            policies: [],
            sessions: [],
          },
          makeParams(),
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        ),
      ).rejects.toThrow("No client found for wallet");
    });

    it("revokeSession throws when wallet not connected", async () => {
      const { baseSepolia } = require("viem/chains");
      const client = new SmartAgentKitClientClass({
        chain: baseSepolia,
        rpcUrl: "http://localhost:8545",
        bundlerUrl: "http://localhost:4337",
      });

      const permissionId =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;

      await expect(
        client.revokeSession(
          {
            address: "0x0000000000000000000000000000000000000001",
            owner: SESSION_KEY,
            chain: baseSepolia,
            isDeployed: true,
            policies: [],
            sessions: [],
          },
          permissionId,
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        ),
      ).rejects.toThrow();
    });
  });
});
