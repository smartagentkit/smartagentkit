import type { Address, Hex } from "viem";

// Common DEX swap function selectors
export const SWAP_SELECTORS = {
  // swapExactETHForTokens(uint256,address[],address,uint256)
  swapExactETHForTokens: "0x7ff36ab5" as Hex,
  // swapExactTokensForETH(uint256,uint256,address[],address,uint256)
  swapExactTokensForETH: "0x18cbafe5" as Hex,
  // swap(address,address,uint256,uint256,address)
  swap: "0xd5bcb9b5" as Hex,
};

export interface DexPair {
  name: string;
  router: Address;
  selectors: Hex[];
}

export function buildDexPairs(dexA: Address, dexB: Address): [DexPair, DexPair] {
  return [
    {
      name: "DEX-A",
      router: dexA,
      selectors: Object.values(SWAP_SELECTORS),
    },
    {
      name: "DEX-B",
      router: dexB,
      selectors: Object.values(SWAP_SELECTORS),
    },
  ];
}
