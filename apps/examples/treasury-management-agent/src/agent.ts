/**
 * Treasury Management Agent
 *
 * A Claude-powered AI agent that manages a treasury wallet, reasons about
 * portfolio allocation, and executes atomic batch rebalancing transactions.
 *
 * Uses Anthropic's Claude (via @langchain/anthropic) to demonstrate
 * vendor diversity — the DeFi trading agent uses OpenAI.
 *
 * Run with --mock flag for in-memory demo (no API keys needed).
 */

import "dotenv/config";
import { parseEther, formatEther, type Address, type Hex } from "viem";
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { createSmartAgentKitTools } from "@smartagentkit/langchain";
import { baseSepolia } from "viem/chains";
import { loadConfig } from "./config.js";

const isMockMode = process.argv.includes("--mock");

const TREASURY_SYSTEM_PROMPT = `You are a treasury management AI agent responsible for managing a smart wallet.

Your role:
- Monitor portfolio balances (ETH and stablecoins)
- Maintain target allocation: 60% ETH, 40% stablecoins
- Execute batch rebalancing transactions when allocation drifts >5%
- Track remaining weekly spending allowance
- Report on portfolio state after each action

Rules:
- Never exceed the weekly spending limit (5 ETH)
- Always check the wallet status before transacting
- Always check remaining allowance before batch operations
- Report the final portfolio state after rebalancing`;

// ─── Mock Mode ──────────────────────────────────────────────────

async function runMockDemo() {
  const { MockSmartAgentKitClient } = await import("@smartagentkit/testing");

  console.log("Treasury Management Agent (MOCK MODE)");
  console.log("======================================\n");

  const ownerAddr = "0x1234567890abcdef1234567890abcdef12345678" as Address;
  const ownerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

  // Mock USDC address (mainnet address for symbol resolution)
  const mockUSDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address;

  // Create mock client with initial balances
  console.log("1. Creating mock client with seeded balances...");
  const mockClient = new MockSmartAgentKitClient({
    initialBalance: parseEther("10"), // 10 ETH
    tokenBalances: {
      [mockUSDC]: 2000_000000n, // 2000 USDC (6 decimals)
    },
    verbose: true,
  });

  // Create wallet with treasury-agent preset (5 ETH/week limit)
  console.log("2. Creating treasury wallet...");
  const wallet = await mockClient.createWallet({
    owner: ownerAddr,
    ownerPrivateKey: ownerKey,
    preset: "treasury-agent",
    presetParams: { guardian: ownerAddr },
  });
  console.log(`   Wallet: ${wallet.address}`);
  console.log(`   Preset: treasury-agent (5 ETH/week spending limit)`);
  console.log();

  // Create LangChain tools backed by mock client
  console.log("3. Setting up LangChain tools...");
  const tools = createSmartAgentKitTools(
    mockClient,
    wallet.address,
  );
  console.log(`   ${tools.length} tools available\n`);

  // Run scripted treasury demo
  console.log("4. Running treasury management demo...\n");
  console.log("\u2500".repeat(60));

  // Step A: Check wallet status
  console.log("\n[Treasury Agent] Checking wallet status...");
  const status = await tools.find((t) => t.name === "check_wallet_status")!.invoke({});
  console.log(`   ${status}`);

  // Step B: Check current portfolio
  console.log("\n[Treasury Agent] Checking current balances...");
  const balances = await tools.find((t) => t.name === "check_wallet_balance")!.invoke({});
  console.log(`   ${balances}`);
  const parsed = JSON.parse(balances as string);
  console.log(`   ETH: ${parsed.eth} ETH`);

  // Step C: Check weekly allowance
  console.log("\n[Treasury Agent] Checking remaining weekly allowance...");
  const allowance = await tools.find((t) => t.name === "check_spending_allowance")!.invoke({
    token: "0x0000000000000000000000000000000000000000",
  });
  console.log(`   ${allowance}`);

  // Step D: Execute batch rebalancing (simulated)
  console.log("\n[Treasury Agent] Portfolio analysis:");
  console.log("   Current: ~100% ETH, ~0% stablecoins (on-chain)");
  console.log("   Target:  60% ETH, 40% stablecoins");
  console.log("   Action:  Rebalancing via atomic batch swap\n");

  console.log("[Treasury Agent] Executing batch rebalance...");
  const batchResult = await tools.find((t) => t.name === "send_batch_transaction")!.invoke({
    calls: [
      {
        // Simulated swap: ETH -> USDC (send ETH to DEX)
        target: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        value: "2000000000000000000", // 2 ETH
        data: "0x",
      },
      {
        // Simulated swap: ETH -> DAI (send ETH to DEX)
        target: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        value: "1000000000000000000", // 1 ETH
        data: "0x",
      },
    ],
  });
  console.log(`   ${batchResult}`);

  // Step E: Check remaining allowance after rebalance
  console.log("\n[Treasury Agent] Budget report after rebalancing:");
  const remaining = await tools.find((t) => t.name === "check_spending_allowance")!.invoke({
    token: "0x0000000000000000000000000000000000000000",
  });
  const remainingParsed = JSON.parse(remaining as string);
  console.log(`   Remaining weekly allowance: ${remainingParsed.remaining} ETH`);
  console.log(`   Spent: ${5 - parseFloat(remainingParsed.remaining)} ETH of 5 ETH limit`);

  console.log("\n" + "\u2500".repeat(60));
  console.log("\nMock demo complete!");
  console.log("The treasury agent checked balances, analyzed allocation,");
  console.log("and executed an atomic batch rebalance within spending limits.");
  console.log("\nRun without --mock for real testnet execution with Claude.");
}

// ─── Real Mode ──────────────────────────────────────────────────

async function runRealAgent() {
  const { ChatAnthropic } = await import("@langchain/anthropic");
  const { createReactAgent } = await import("@langchain/langgraph/prebuilt");
  const { HumanMessage } = await import("@langchain/core/messages");

  const cfg = loadConfig();

  console.log("Treasury Management Agent");
  console.log("=========================\n");

  // 1. Create SmartAgentKit client
  console.log("1. Creating SmartAgentKit client...");
  const sakClient = new SmartAgentKitClient({
    chain: baseSepolia,
    rpcUrl: cfg.rpcUrl,
    bundlerUrl: cfg.bundlerUrl,
    moduleAddresses: cfg.moduleAddresses,
  });

  // 2. Create wallet with treasury-agent preset
  console.log("2. Creating treasury wallet...");
  const wallet = await sakClient.createWallet({
    owner: cfg.ownerAddress,
    ownerPrivateKey: cfg.ownerPrivateKey,
    preset: "treasury-agent",
    presetParams: { guardian: cfg.ownerAddress },
  });
  console.log(`   Wallet: ${wallet.address}`);
  console.log(`   Policies: ${wallet.policies.length}`);
  console.log();

  // 3. Create LangChain tools
  console.log("3. Setting up LangChain tools...");
  const tools = createSmartAgentKitTools(sakClient, wallet.address);
  console.log(`   ${tools.length} tools available\n`);

  // 4. Create Claude agent
  console.log("4. Creating Claude treasury agent...");
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    temperature: 0,
    apiKey: cfg.anthropicApiKey,
  });

  const agent = createReactAgent({
    llm,
    tools,
  });
  console.log("   Agent ready!\n");

  // 5. Run the agent
  console.log("5. Running treasury agent...\n");
  console.log("\u2500".repeat(60));

  const result = await agent.invoke({
    messages: [
      new HumanMessage(
        "You are managing a treasury wallet. " +
          "First, check if the wallet is active (not paused). " +
          "Then check the ETH balance and remaining weekly spending allowance. " +
          "Analyze the current portfolio allocation and suggest whether rebalancing is needed. " +
          "If rebalancing is needed, propose a batch transaction plan.",
      ),
    ],
  });

  console.log("\n" + "\u2500".repeat(60));
  console.log("\nTreasury Agent Report:");
  const lastMessage = result.messages[result.messages.length - 1];
  console.log(lastMessage.content);
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  if (isMockMode) {
    await runMockDemo();
  } else {
    await runRealAgent();
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
