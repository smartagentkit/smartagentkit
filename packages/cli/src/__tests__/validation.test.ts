import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateAddress,
  validatePrivateKey,
  resolvePrivateKey,
} from "../utils/validation.js";

describe("validateAddress", () => {
  it("accepts a valid lowercase address", () => {
    const addr = validateAddress(
      "0x1234567890abcdef1234567890abcdef12345678",
      "test",
    );
    expect(addr).toBe("0x1234567890abcdef1234567890abcdef12345678");
  });

  it("accepts a valid checksummed address", () => {
    const addr = validateAddress(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "test",
    );
    expect(addr).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  });

  it("accepts the zero address", () => {
    const addr = validateAddress(
      "0x0000000000000000000000000000000000000000",
      "test",
    );
    expect(addr).toBe("0x0000000000000000000000000000000000000000");
  });

  it("rejects an address without 0x prefix", () => {
    expect(() =>
      validateAddress("1234567890abcdef1234567890abcdef12345678", "wallet"),
    ).toThrow("Invalid wallet address");
  });

  it("rejects an address that is too short", () => {
    expect(() => validateAddress("0x1234", "wallet")).toThrow(
      "Invalid wallet address",
    );
  });

  it("rejects an address that is too long", () => {
    expect(() =>
      validateAddress(
        "0x1234567890abcdef1234567890abcdef1234567800",
        "wallet",
      ),
    ).toThrow("Invalid wallet address");
  });

  it("rejects a non-hex string", () => {
    expect(() =>
      validateAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG", "wallet"),
    ).toThrow("Invalid wallet address");
  });

  it("rejects an empty string", () => {
    expect(() => validateAddress("", "wallet")).toThrow(
      "Invalid wallet address",
    );
  });
});

describe("validatePrivateKey", () => {
  it("accepts a valid 32-byte private key", () => {
    const key = validatePrivateKey(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      "owner",
    );
    expect(key).toBe(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
  });

  it("rejects a key without 0x prefix", () => {
    expect(() =>
      validatePrivateKey(
        "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "owner",
      ),
    ).toThrow("Invalid owner private key");
  });

  it("rejects a key that is too short", () => {
    expect(() => validatePrivateKey("0xdead", "owner")).toThrow(
      "Invalid owner private key",
    );
  });

  it("rejects a key that is too long", () => {
    expect(() =>
      validatePrivateKey(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff8000",
        "owner",
      ),
    ).toThrow("Invalid owner private key");
  });

  it("rejects non-hex characters", () => {
    expect(() =>
      validatePrivateKey(
        "0xZZ0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "owner",
      ),
    ).toThrow("Invalid owner private key");
  });
});

describe("resolvePrivateKey", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns CLI value when provided", () => {
    const key = resolvePrivateKey(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      "SAK_OWNER_KEY",
      "owner",
    );
    expect(key).toBe(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
  });

  it("falls back to env var when CLI value is undefined", () => {
    process.env.SAK_OWNER_KEY =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const key = resolvePrivateKey(undefined, "SAK_OWNER_KEY", "owner");
    expect(key).toBe(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
  });

  it("prefers CLI value over env var", () => {
    process.env.SAK_OWNER_KEY =
      "0x1111111111111111111111111111111111111111111111111111111111111111";
    const key = resolvePrivateKey(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      "SAK_OWNER_KEY",
      "owner",
    );
    expect(key).toBe(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
  });

  it("throws when neither CLI nor env var is provided", () => {
    delete process.env.SAK_OWNER_KEY;
    expect(() =>
      resolvePrivateKey(undefined, "SAK_OWNER_KEY", "owner"),
    ).toThrow("No owner private key provided");
    expect(() =>
      resolvePrivateKey(undefined, "SAK_OWNER_KEY", "owner"),
    ).toThrow("SAK_OWNER_KEY");
  });

  it("validates the env var value", () => {
    process.env.SAK_OWNER_KEY = "not-a-valid-key";
    expect(() =>
      resolvePrivateKey(undefined, "SAK_OWNER_KEY", "owner"),
    ).toThrow("Invalid owner private key");
  });
});
