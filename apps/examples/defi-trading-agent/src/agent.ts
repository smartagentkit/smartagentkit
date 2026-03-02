/**
 * DeFi Trading Agent Example
 *
 * Demonstrates how to create an AI agent that can autonomously execute
 * DeFi trades within policy-governed guardrails using SmartAgentKit.
 *
 * The agent:
 * 1. Checks its wallet balance
 * 2. Verifies spending allowance
 * 3. Executes transactions within policy limits
 * 4. Checks wallet pause status
 *
 * All actions are constrained by on-chain policies:
 * - SpendingLimitHook: Max 0.1 ETH per day
 * - AllowlistHook: Can only interact with approved contracts
 * - EmergencyPauseHook: Owner can freeze the wallet at any time
 *
 * Run with --mock flag to use in-memory mock client (no API keys or funded wallets needed).
 */

import "dotenv/config";
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { createSmartAgentKitTools } from "@smartagentkit/langchain";
import { baseSepolia } from "viem/chains";
import type { Address, Hex } from "viem";

const isMockMode = process.argv.includes("--mock");

// ─── Configuration ──────────────────────────────────────────────

const config = {
  rpcUrl: process.env.RPC_URL!,
  bundlerUrl: process.env.BUNDLER_URL!,
  ownerAddress: process.env.OWNER_ADDRESS! as Address,
  ownerPrivateKey: process.env.OWNER_PRIVATE_KEY! as Hex,
  moduleAddresses: {
    spendingLimitHook: process.env.SPENDING_LIMIT_HOOK! as Address,
    allowlistHook: process.env.ALLOWLIST_HOOK! as Address,
    emergencyPauseHook: process.env.EMERGENCY_PAUSE_HOOK! as Address,
  },
};

// ─── Mock Mode ──────────────────────────────────────────────────

async function runMockDemo() {
  const { MockSmartAgentKitClient } = await import("@smartagentkit/testing");

  console.log("SmartAgentKit DeFi Trading Agent (MOCK MODE)");
  console.log("=============================================\n");

  // 1. Create mock client
  console.log("1. Creating mock SmartAgentKit client...");
  const mockClient = new MockSmartAgentKitClient({
    initialBalance: 10000000000000000000n, // 10 ETH
    verbose: true,
  });

  // 2. Create wallet with defi-trader preset
  console.log("2. Creating agent wallet with defi-trader preset...");
  const wallet = await mockClient.createWallet({
    owner: "0x1234567890abcdef1234567890abcdef12345678" as Address,
    ownerPrivateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex,
    preset: "defi-trader",
    presetParams: {
      guardian: "0x1234567890abcdef1234567890abcdef12345678" as Address,
    },
  });
  console.log(`   Wallet address: ${wallet.address}`);
  console.log(`   Policies installed: ${wallet.policies.length}`);
  console.log();

  // 3. Create LangChain tools using mock client
  console.log("3. Setting up LangChain tools (backed by mock client)...");
  // The mock client has the same API shape as SmartAgentKitClient
  const tools = createSmartAgentKitTools(
    mockClient,
    wallet.address,
  );
  console.log(`   ${tools.length} tools available: ${tools.map((t) => t.name).join(", ")}`);
  console.log();

  // 4. Run scripted demo (no LLM needed)
  console.log("4. Running scripted demo (no LLM required)...\n");
  console.log("\u2500".repeat(60));

  // Step A: Check wallet status
  console.log("\n[Agent] Checking wallet status...");
  const statusResult = await tools.find((t) => t.name === "check_wallet_status")!.invoke({});
  console.log(`   Result: ${statusResult}`);

  // Step B: Check balance
  console.log("\n[Agent] Checking wallet balance...");
  const balanceResult = await tools.find((t) => t.name === "check_wallet_balance")!.invoke({});
  console.log(`   Result: ${balanceResult}`);

  // Step C: Check spending allowance
  console.log("\n[Agent] Checking ETH spending allowance...");
  const allowanceResult = await tools.find((t) => t.name === "check_spending_allowance")!.invoke({
    token: "0x0000000000000000000000000000000000000000",
  });
  console.log(`   Result: ${allowanceResult}`);

  // Step D: Send a transaction
  console.log("\n[Agent] Sending 0.1 ETH transaction...");
  const txResult = await tools.find((t) => t.name === "send_transaction")!.invoke({
    target: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    value: "100000000000000000", // 0.1 ETH in wei
  });
  console.log(`   Result: ${txResult}`);

  // Step E: Check allowance again after spending
  console.log("\n[Agent] Checking remaining allowance after spend...");
  const allowanceAfter = await tools.find((t) => t.name === "check_spending_allowance")!.invoke({
    token: "0x0000000000000000000000000000000000000000",
  });
  console.log(`   Result: ${allowanceAfter}`);

  console.log("\n" + "\u2500".repeat(60));
  console.log("\nMock demo complete! All operations ran in-memory.");
  console.log("Run without --mock flag for real testnet execution.");
}

// ─── Real Mode ──────────────────────────────────────────────────

async function runRealAgent() {
  const { ChatOpenAI } = await import("@langchain/openai");
  const { createReactAgent } = await import("@langchain/langgraph/prebuilt");
  const { HumanMessage } = await import("@langchain/core/messages");

  console.log("SmartAgentKit DeFi Trading Agent");
  console.log("================================\n");

  // 1. Create the SmartAgentKit client
  console.log("1. Creating SmartAgentKit client...");
  const sakClient = new SmartAgentKitClient({
    chain: baseSepolia,
    rpcUrl: config.rpcUrl,
    bundlerUrl: config.bundlerUrl,
    moduleAddresses: config.moduleAddresses,
  });

  // 2. Create wallet with defi-trader preset
  console.log("2. Creating agent wallet with defi-trader preset...");
  const wallet = await sakClient.createWallet({
    owner: config.ownerAddress,
    ownerPrivateKey: config.ownerPrivateKey,
    preset: "defi-trader",
    presetParams: {
      guardian: config.ownerAddress,
    },
  });
  console.log(`   Wallet address: ${wallet.address}`);
  console.log(`   Policies installed: ${wallet.policies.length}`);
  console.log();

  // 3. Create session key for the agent
  console.log("3. Creating session key for agent...");
  const { sessionKey, permissionId } =
    await sakClient.createSession(
      wallet,
      {
        sessionKey: "0x0000000000000000000000000000000000000000" as Address,
        actions: [
          {
            target: "0x0000000000000000000000000000000000000000" as Address,
            selector: "0xa9059cbb" as Hex,
          },
        ],
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
      },
      config.ownerPrivateKey,
    );
  console.log(`   Session key: ${sessionKey}`);
  console.log(`   Permission ID: ${permissionId}`);
  console.log();

  // 4. Create LangChain tools
  console.log("4. Setting up LangChain tools...");
  const tools = createSmartAgentKitTools(
    sakClient,
    wallet.address,
  );
  console.log(`   ${tools.length} tools available: ${tools.map((t) => t.name).join(", ")}`);
  console.log();

  // 5. Create LLM and agent
  console.log("5. Creating AI agent...");
  const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
  });

  const agent = createReactAgent({
    llm,
    tools,
  });
  console.log("   Agent ready!\n");

  // 6. Run the agent
  console.log("6. Running agent...\n");
  console.log("\u2500".repeat(60));

  const result = await agent.invoke({
    messages: [
      new HumanMessage(
        "First check if the wallet is active (not paused). " +
          "Then check the wallet's ETH balance. " +
          "Finally, check how much spending allowance remains for native ETH. " +
          "Summarize the wallet's status.",
      ),
    ],
  });

  // Print the final response
  console.log("\n" + "\u2500".repeat(60));
  console.log("\nAgent Response:");
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
