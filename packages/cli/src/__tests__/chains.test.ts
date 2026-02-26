import { describe, it, expect } from "vitest";
import { resolveChain, listChains } from "../utils/chains.js";

describe("chain resolver", () => {
  it("resolves base-sepolia", () => {
    const chain = resolveChain("base-sepolia");
    expect(chain.id).toBe(84532);
    expect(chain.name).toBe("Base Sepolia");
  });

  it("resolves mainnet", () => {
    const chain = resolveChain("mainnet");
    expect(chain.id).toBe(1);
  });

  it("resolves ethereum (alias for mainnet)", () => {
    const chain = resolveChain("ethereum");
    expect(chain.id).toBe(1);
  });

  it("resolves sepolia", () => {
    const chain = resolveChain("sepolia");
    expect(chain.id).toBe(11155111);
  });

  it("resolves base", () => {
    const chain = resolveChain("base");
    expect(chain.id).toBe(8453);
  });

  it("resolves optimism", () => {
    const chain = resolveChain("optimism");
    expect(chain.id).toBe(10);
  });

  it("resolves arbitrum", () => {
    const chain = resolveChain("arbitrum");
    expect(chain.id).toBe(42161);
  });

  it("resolves polygon", () => {
    const chain = resolveChain("polygon");
    expect(chain.id).toBe(137);
  });

  it("is case-insensitive", () => {
    const chain = resolveChain("Base-Sepolia");
    expect(chain.id).toBe(84532);
  });

  it("throws for unknown chain", () => {
    expect(() => resolveChain("foobar")).toThrow('Unknown chain "foobar"');
  });

  it("includes supported chain names in error message", () => {
    try {
      resolveChain("foobar");
    } catch (e) {
      expect((e as Error).message).toContain("base-sepolia");
      expect((e as Error).message).toContain("mainnet");
    }
  });

  it("listChains returns all supported names", () => {
    const chains = listChains();
    expect(chains).toContain("base-sepolia");
    expect(chains).toContain("mainnet");
    expect(chains).toContain("sepolia");
    expect(chains).toContain("arbitrum");
    expect(chains.length).toBeGreaterThanOrEqual(10);
  });
});
