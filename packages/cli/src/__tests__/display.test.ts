import { describe, it, expect } from "vitest";
import { formatAddress, formatBalance } from "../utils/display.js";

describe("display utils", () => {
  describe("formatAddress", () => {
    it("truncates address to 6...4 format", () => {
      const addr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      expect(formatAddress(addr)).toBe("0xf39F...2266");
    });
  });

  describe("formatBalance", () => {
    it("formats wei to ETH", () => {
      expect(formatBalance(1000000000000000000n)).toBe("1 ETH");
    });

    it("formats zero", () => {
      expect(formatBalance(0n)).toBe("0 ETH");
    });

    it("formats fractional amounts", () => {
      expect(formatBalance(500000000000000000n)).toBe("0.5 ETH");
    });

    it("formats small amounts", () => {
      const result = formatBalance(1000000000000000n);
      expect(result).toBe("0.001 ETH");
    });
  });
});
