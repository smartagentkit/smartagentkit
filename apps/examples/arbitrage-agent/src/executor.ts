import { encodeFunctionData, type Address, type Hex } from "viem";
import type { AgentWallet, ExecuteParams, ISmartAgentKitClient } from "@smartagentkit/sdk";
import type { ArbitrageOpportunity } from "./strategy.js";
import type { DexPair } from "./dex-config.js";

export function buildSwapCalls(
  opp: ArbitrageOpportunity,
  dexA: DexPair,
  dexB: DexPair,
): ExecuteParams[] {
  const buyDex = opp.direction === "buy-A-sell-B" ? dexA : dexB;
  const sellDex = opp.direction === "buy-A-sell-B" ? dexB : dexA;

  // Simplified: send ETH to buy-side DEX, then call swap on sell-side
  return [
    {
      target: buyDex.router,
      value: opp.tradeSize,
      data: buyDex.selectors[0] as Hex, // swapExactETHForTokens selector (simplified)
    },
    {
      target: sellDex.router,
      value: 0n,
      data: sellDex.selectors[1] as Hex, // swapExactTokensForETH selector (simplified)
    },
  ];
}

export async function executeArbitrage(
  client: ISmartAgentKitClient,
  wallet: AgentWallet,
  calls: ExecuteParams[],
): Promise<Hex> {
  return client.executeBatch(wallet, { calls });
}
