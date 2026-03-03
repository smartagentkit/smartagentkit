/**
 * Policy Plugin Playground
 *
 * Demonstrates:
 * 1. Registering a custom policy plugin
 * 2. Creating a wallet with built-in + custom policies
 * 3. Using the plugin registry API
 * 4. Address resolution and configuration
 *
 * Run: pnpm start:mock
 */

import { privateKeyToAccount } from "viem/accounts";
import {
  pluginRegistry,
  spendingLimitPlugin,
  allowlistPlugin,
  emergencyPausePlugin,
  NATIVE_TOKEN,
  WINDOW_1_DAY,
} from "@smartagentkit/sdk";
import type { Address, Hex } from "viem";
import { parseEther } from "viem";
import { targetBlockerPlugin, type TargetBlockerConfig } from "./custom-plugin.js";

const MOCK_MODE = process.argv.includes("--mock");

// ─── Step 1: Register the custom plugin ─────────────────────

console.log("=== Policy Plugin Playground ===\n");
console.log("Step 1: Register custom plugin");

// Avoid duplicate registration if module is re-imported
if (!pluginRegistry.has("target-blocker")) {
  pluginRegistry.register(targetBlockerPlugin);
}
console.log(`  Registered: ${targetBlockerPlugin.name} (${targetBlockerPlugin.id})`);

// ─── Step 2: Explore the registry ────────────────────────────

console.log("\nStep 2: Explore the registry");

const allPlugins = pluginRegistry.all();
console.log(`  Total plugins registered: ${allPlugins.length}`);
for (const plugin of allPlugins) {
  console.log(`    - ${plugin.id} (${plugin.moduleType}, infrastructure=${plugin.isInfrastructure})`);
}

// ─── Step 3: Test validation ─────────────────────────────────

console.log("\nStep 3: Test config validation");

try {
  targetBlockerPlugin.validateConfig({
    type: "target-blocker",
    blockedTarget: "0x0000000000000000000000000000000000000000",
  } as TargetBlockerConfig);
  console.log("  ERROR: Should have thrown!");
} catch (e) {
  console.log(`  Validation caught: ${(e as Error).message}`);
}

const validConfig: TargetBlockerConfig = {
  type: "target-blocker",
  blockedTarget: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as Address,
};
targetBlockerPlugin.validateConfig(validConfig);
console.log("  Valid config passed validation");

// ─── Step 4: Encode init data ────────────────────────────────

console.log("\nStep 4: Encode init data");

const trustedForwarder = "0xF6782ed057F95f334D04F0Af1Af4D14fb84DE549" as Address;
const initData = targetBlockerPlugin.encodeInitData(validConfig, trustedForwarder);
console.log(`  Init data (${initData.length} chars): ${initData.slice(0, 42)}...`);

// ─── Step 5: Test address resolution ──────────────────────────

console.log("\nStep 5: Address resolution");

// No default addresses configured yet
let resolved = pluginRegistry.resolveAddress("target-blocker", 84532);
console.log(`  Before setDefaultAddress: ${resolved ?? "undefined"}`);

// Set a default address
const fakeHookAddress = "0x4444444444444444444444444444444444444444" as Address;
pluginRegistry.setDefaultAddress("target-blocker", 84532, fakeHookAddress);
resolved = pluginRegistry.resolveAddress("target-blocker", 84532);
console.log(`  After setDefaultAddress:  ${resolved}`);

// Override takes precedence
const overrideAddr = "0x9999999999999999999999999999999999999999" as Address;
resolved = pluginRegistry.resolveAddress("target-blocker", 84532, {
  "target-blocker": overrideAddr,
});
console.log(`  With override:            ${resolved}`);

// ─── Step 6: Infrastructure addresses ────────────────────────

console.log("\nStep 6: Infrastructure addresses");

const infraAddresses = pluginRegistry.getInfrastructureAddresses(84532);
console.log(`  Infrastructure addresses for chain 84532: ${infraAddresses.length}`);
for (const addr of infraAddresses) {
  const plugin = allPlugins.find(
    (p) => p.isInfrastructure && p.defaultAddresses?.[84532]?.toLowerCase() === addr.toLowerCase(),
  );
  console.log(`    ${addr} (${plugin?.name ?? "unknown"})`);
}

// ─── Step 7: Mock wallet demo ────────────────────────────────

if (MOCK_MODE) {
  console.log("\nStep 7: Mock wallet demo");

  const { MockSmartAgentKitClient } = await import("@smartagentkit/testing");

  const mockClient = new MockSmartAgentKitClient({ verbose: true });
  const owner = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;

  const wallet = await mockClient.createWallet({
    owner,
    ownerPrivateKey: "0x" + "ab".repeat(32) as Hex,
    policies: [
      {
        type: "spending-limit",
        limits: [{ token: NATIVE_TOKEN, limit: parseEther("1"), window: WINDOW_1_DAY }],
      },
      {
        type: "emergency-pause",
        guardian: owner,
      },
    ],
  });

  console.log(`  Created wallet: ${wallet.address}`);
  console.log(`  Policies: ${wallet.policies.length}`);
  for (const p of wallet.policies) {
    console.log(`    - ${p.config.type}`);
  }

  // Execute a transaction
  const txHash = await mockClient.execute(wallet, {
    target: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    value: parseEther("0.1"),
  });
  console.log(`  Transaction sent: ${txHash.slice(0, 18)}...`);

  // Check remaining allowance
  const remaining = await mockClient.getRemainingAllowance(wallet.address, NATIVE_TOKEN);
  console.log(`  Remaining ETH allowance: ${remaining}`);
} else {
  console.log("\nStep 7: Skipped (run with --mock for wallet demo)");
}

console.log("\n=== Playground complete ===");
