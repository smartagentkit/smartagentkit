import { describe, it, expect } from "vitest";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import {
  encodePolicyInitData,
  encodeSpendingLimitInitData,
  encodeAllowlistInitData,
  encodeEmergencyPauseInitData,
} from "../policies.js";
import type {
  SpendingLimitPolicy,
  AllowlistPolicy,
  EmergencyPausePolicy,
} from "../types.js";

describe("encodePolicyInitData", () => {
  describe("SpendingLimitHook encoding", () => {
    it("encodes single token limit with default trustedForwarder", () => {
      const policy: SpendingLimitPolicy = {
        type: "spending-limit",
        limits: [
          {
            token: "0x0000000000000000000000000000000000000000",
            limit: 1000000000000000000n, // 1 ETH
            window: 86400, // 1 day
          },
        ],
      };

      const encoded = encodeSpendingLimitInitData(policy);

      // Decode and verify it matches the Solidity struct format
      const [forwarder, decoded] = decodeAbiParameters(
        parseAbiParameters(
          "address trustedForwarder, (address token, uint256 limit, uint48 windowDuration)[]",
        ),
        encoded,
      );

      expect(forwarder).toBe("0x0000000000000000000000000000000000000000");
      expect(decoded).toHaveLength(1);
      expect(decoded[0].token).toBe(
        "0x0000000000000000000000000000000000000000",
      );
      expect(decoded[0].limit).toBe(1000000000000000000n);
      expect(decoded[0].windowDuration).toBe(86400);
    });

    it("encodes with custom trustedForwarder", () => {
      const policy: SpendingLimitPolicy = {
        type: "spending-limit",
        limits: [
          {
            token: "0x0000000000000000000000000000000000000000",
            limit: 1000000000000000000n,
            window: 86400,
          },
        ],
      };

      const multiplexer = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const encoded = encodeSpendingLimitInitData(policy, multiplexer);

      const [forwarder] = decodeAbiParameters(
        parseAbiParameters(
          "address trustedForwarder, (address token, uint256 limit, uint48 windowDuration)[]",
        ),
        encoded,
      );

      expect(forwarder).toBe("0x1234567890123456789012345678901234567890");
    });

    it("encodes multiple token limits", () => {
      const policy: SpendingLimitPolicy = {
        type: "spending-limit",
        limits: [
          {
            token: "0x0000000000000000000000000000000000000000",
            limit: 1000000000000000000n,
            window: 86400,
          },
          {
            token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            limit: 1000000000n, // 1000 USDC
            window: 3600,
          },
        ],
      };

      const encoded = encodeSpendingLimitInitData(policy);
      const [, decoded] = decodeAbiParameters(
        parseAbiParameters(
          "address trustedForwarder, (address token, uint256 limit, uint48 windowDuration)[]",
        ),
        encoded,
      );

      expect(decoded).toHaveLength(2);
      expect(decoded[1].limit).toBe(1000000000n);
      expect(decoded[1].windowDuration).toBe(3600);
    });

    it("rejects empty limits", () => {
      const policy: SpendingLimitPolicy = {
        type: "spending-limit",
        limits: [],
      };

      expect(() => encodeSpendingLimitInitData(policy)).toThrow(
        "at least one token limit",
      );
    });

    it("rejects duplicate token addresses", () => {
      const policy: SpendingLimitPolicy = {
        type: "spending-limit",
        limits: [
          {
            token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            limit: 1000000000n,
            window: 86400,
          },
          {
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // same address, different case
            limit: 2000000000n,
            window: 3600,
          },
        ],
      };

      expect(() => encodeSpendingLimitInitData(policy)).toThrow(
        "Duplicate token address",
      );
    });

    it("rejects zero limit", () => {
      const policy: SpendingLimitPolicy = {
        type: "spending-limit",
        limits: [
          {
            token: "0x0000000000000000000000000000000000000000",
            limit: 0n,
            window: 86400,
          },
        ],
      };

      expect(() => encodeSpendingLimitInitData(policy)).toThrow(
        "greater than zero",
      );
    });

    it("rejects window too short", () => {
      const policy: SpendingLimitPolicy = {
        type: "spending-limit",
        limits: [
          {
            token: "0x0000000000000000000000000000000000000000",
            limit: 1000000000000000000n,
            window: 30, // Less than 60s
          },
        ],
      };

      expect(() => encodeSpendingLimitInitData(policy)).toThrow(
        "at least 60 seconds",
      );
    });
  });

  describe("AllowlistHook encoding", () => {
    const allowlistAbiParams = "address trustedForwarder, uint8 mode, (address target, bytes4 selector)[], address[] protectedAddresses";

    it("encodes allowlist mode with targets", () => {
      const policy: AllowlistPolicy = {
        type: "allowlist",
        mode: "allow",
        targets: [
          {
            address: "0x1111111111111111111111111111111111111111",
            selector: "0xa9059cbb",
          },
        ],
      };

      const encoded = encodeAllowlistInitData(policy);
      const [forwarder, mode, permissions, protectedAddresses] = decodeAbiParameters(
        parseAbiParameters(allowlistAbiParams),
        encoded,
      );

      expect(forwarder).toBe("0x0000000000000000000000000000000000000000");
      expect(mode).toBe(0); // ALLOWLIST
      expect(permissions).toHaveLength(1);
      expect(permissions[0].target).toBe(
        "0x1111111111111111111111111111111111111111",
      );
      expect(permissions[0].selector).toBe("0xa9059cbb");
      expect(protectedAddresses).toHaveLength(0);
    });

    it("encodes blocklist mode with wildcard selector", () => {
      const policy: AllowlistPolicy = {
        type: "allowlist",
        mode: "block",
        targets: [
          {
            address: "0x2222222222222222222222222222222222222222",
          },
        ],
      };

      const encoded = encodeAllowlistInitData(policy);
      const [, mode, permissions] = decodeAbiParameters(
        parseAbiParameters(allowlistAbiParams),
        encoded,
      );

      expect(mode).toBe(1); // BLOCKLIST
      // Wildcard is now 0x431e2cf5 (keccak256("WILDCARD") truncated)
      expect(permissions[0].selector).toBe("0x431e2cf5");
    });

    it("encodes with custom trustedForwarder", () => {
      const policy: AllowlistPolicy = {
        type: "allowlist",
        mode: "allow",
        targets: [
          {
            address: "0x1111111111111111111111111111111111111111",
            selector: "0xa9059cbb",
          },
        ],
      };

      const multiplexer = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as `0x${string}`;
      const encoded = encodeAllowlistInitData(policy, multiplexer);
      const [forwarder] = decodeAbiParameters(
        parseAbiParameters(allowlistAbiParams),
        encoded,
      );

      expect(forwarder).toBe("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
    });

    it("encodes with protected addresses", () => {
      const policy: AllowlistPolicy = {
        type: "allowlist",
        mode: "block",
        targets: [],
        protectedAddresses: [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
          "0x3333333333333333333333333333333333333333",
        ],
      };

      const encoded = encodeAllowlistInitData(policy);
      const [, , , protectedAddresses] = decodeAbiParameters(
        parseAbiParameters(allowlistAbiParams),
        encoded,
      );

      expect(protectedAddresses).toHaveLength(3);
      expect(protectedAddresses[0].toLowerCase()).toBe("0x1111111111111111111111111111111111111111");
      expect(protectedAddresses[1].toLowerCase()).toBe("0x2222222222222222222222222222222222222222");
      expect(protectedAddresses[2].toLowerCase()).toBe("0x3333333333333333333333333333333333333333");
    });

    it("rejects more than 20 protected addresses", () => {
      const addresses = Array.from(
        { length: 21 },
        (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
      );

      const policy: AllowlistPolicy = {
        type: "allowlist",
        mode: "block",
        targets: [],
        protectedAddresses: addresses,
      };

      expect(() => encodeAllowlistInitData(policy)).toThrow(
        "cannot exceed 20",
      );
    });

    it("defaults to empty protected addresses when not provided", () => {
      const policy: AllowlistPolicy = {
        type: "allowlist",
        mode: "block",
        targets: [
          {
            address: "0x2222222222222222222222222222222222222222",
          },
        ],
      };

      const encoded = encodeAllowlistInitData(policy);
      const [, , , protectedAddresses] = decodeAbiParameters(
        parseAbiParameters(allowlistAbiParams),
        encoded,
      );

      expect(protectedAddresses).toHaveLength(0);
    });
  });

  describe("EmergencyPauseHook encoding", () => {
    it("encodes guardian with auto-unpause", () => {
      const policy: EmergencyPausePolicy = {
        type: "emergency-pause",
        guardian: "0x3333333333333333333333333333333333333333",
        autoUnpauseAfter: 3600,
      };

      const encoded = encodeEmergencyPauseInitData(policy);
      const [forwarder, guardian, autoUnpause] = decodeAbiParameters(
        parseAbiParameters(
          "address trustedForwarder, address guardian, uint48 autoUnpauseAfter",
        ),
        encoded,
      );

      expect(forwarder).toBe("0x0000000000000000000000000000000000000000");
      expect(guardian).toBe("0x3333333333333333333333333333333333333333");
      expect(autoUnpause).toBe(3600);
    });

    it("encodes guardian without auto-unpause", () => {
      const policy: EmergencyPausePolicy = {
        type: "emergency-pause",
        guardian: "0x3333333333333333333333333333333333333333",
      };

      const encoded = encodeEmergencyPauseInitData(policy);
      const [, , autoUnpause] = decodeAbiParameters(
        parseAbiParameters(
          "address trustedForwarder, address guardian, uint48 autoUnpauseAfter",
        ),
        encoded,
      );

      expect(autoUnpause).toBe(0);
    });

    it("encodes with custom trustedForwarder", () => {
      const policy: EmergencyPausePolicy = {
        type: "emergency-pause",
        guardian: "0x3333333333333333333333333333333333333333",
      };

      const multiplexer = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as `0x${string}`;
      const encoded = encodeEmergencyPauseInitData(policy, multiplexer);
      const [forwarder] = decodeAbiParameters(
        parseAbiParameters(
          "address trustedForwarder, address guardian, uint48 autoUnpauseAfter",
        ),
        encoded,
      );

      expect(forwarder).toBe("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
    });

    it("rejects zero guardian", () => {
      const policy: EmergencyPausePolicy = {
        type: "emergency-pause",
        guardian: "0x0000000000000000000000000000000000000000",
      };

      expect(() => encodeEmergencyPauseInitData(policy)).toThrow(
        "zero address",
      );
    });
  });

  describe("encodePolicyInitData dispatcher", () => {
    it("dispatches spending-limit correctly", () => {
      const policy: SpendingLimitPolicy = {
        type: "spending-limit",
        limits: [
          {
            token: "0x0000000000000000000000000000000000000000",
            limit: 1000000000000000000n,
            window: 86400,
          },
        ],
      };

      const result = encodePolicyInitData(policy);
      expect(result.moduleType).toBe(4); // MODULE_TYPE_HOOK
      expect(result.initData).toBeTruthy();
    });

    it("dispatches with trustedForwarder", () => {
      const policy: SpendingLimitPolicy = {
        type: "spending-limit",
        limits: [
          {
            token: "0x0000000000000000000000000000000000000000",
            limit: 1000000000000000000n,
            window: 86400,
          },
        ],
      };

      const multiplexer = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const result = encodePolicyInitData(policy, undefined, multiplexer);
      expect(result.moduleType).toBe(4);

      // Verify the trustedForwarder is in the encoded data
      const [forwarder] = decodeAbiParameters(
        parseAbiParameters(
          "address trustedForwarder, (address token, uint256 limit, uint48 windowDuration)[]",
        ),
        result.initData,
      );
      expect(forwarder).toBe("0x1234567890123456789012345678901234567890");
    });

    it("dispatches allowlist correctly", () => {
      const policy: AllowlistPolicy = {
        type: "allowlist",
        mode: "allow",
        targets: [{ address: "0x1234567890123456789012345678901234567890" }],
      };

      const result = encodePolicyInitData(policy);
      expect(result.moduleType).toBe(4);
    });

    it("rejects empty allowlist in allow mode", () => {
      const policy: AllowlistPolicy = {
        type: "allowlist",
        mode: "allow",
        targets: [],
      };

      expect(() => encodePolicyInitData(policy)).toThrow(
        "AllowlistPolicy in 'allow' mode must have at least one target",
      );
    });

    it("dispatches emergency-pause correctly", () => {
      const policy: EmergencyPausePolicy = {
        type: "emergency-pause",
        guardian: "0x1111111111111111111111111111111111111111",
      };

      const result = encodePolicyInitData(policy);
      expect(result.moduleType).toBe(4);
    });

    it("throws on automation (not yet implemented)", () => {
      expect(() =>
        encodePolicyInitData({
          type: "automation",
          tasks: [],
        }),
      ).toThrow("not yet implemented");
    });
  });
});
