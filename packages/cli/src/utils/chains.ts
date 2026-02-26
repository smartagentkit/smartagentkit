import type { Chain } from "viem";
import {
  mainnet,
  sepolia,
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
  arbitrum,
  arbitrumSepolia,
  polygon,
  polygonAmoy,
} from "viem/chains";

const CHAIN_MAP: Record<string, Chain> = {
  "mainnet": mainnet,
  "ethereum": mainnet,
  "sepolia": sepolia,
  "base": base,
  "base-sepolia": baseSepolia,
  "optimism": optimism,
  "optimism-sepolia": optimismSepolia,
  "arbitrum": arbitrum,
  "arbitrum-sepolia": arbitrumSepolia,
  "polygon": polygon,
  "polygon-amoy": polygonAmoy,
};

export function resolveChain(name: string): Chain {
  const chain = CHAIN_MAP[name.toLowerCase()];
  if (!chain) {
    const supported = Object.keys(CHAIN_MAP).join(", ");
    throw new Error(
      `Unknown chain "${name}". Supported: ${supported}`,
    );
  }
  return chain;
}

export function listChains(): string[] {
  return Object.keys(CHAIN_MAP);
}
