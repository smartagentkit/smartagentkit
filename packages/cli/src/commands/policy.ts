import { Command } from "commander";
import chalk from "chalk";
import type { Address } from "viem";
import { createSdkClient } from "../utils/client.js";
import {
  success,
  error,
  info,
  createTable,
} from "../utils/display.js";
import { validateAddress } from "../utils/validation.js";

export const policyCommand = new Command("policy")
  .description("Manage policy modules (list/add/remove)");

policyCommand
  .command("list")
  .description("List installed policies on a wallet")
  .requiredOption("--wallet <address>", "Wallet address")
  .option("--chain <name>", "Target chain", "base-sepolia")
  .option("--rpc-url <url>", "RPC URL")
  .option("--bundler-url <url>", "Bundler URL")
  .action(async (options) => {
    try {
      const walletAddress = validateAddress(options.wallet, "wallet");

      const client = createSdkClient({
        chain: options.chain,
        rpcUrl: options.rpcUrl,
        bundlerUrl: options.bundlerUrl,
      });

      // Check spending limit remaining
      try {
        const remaining = await client.getRemainingAllowance(
          walletAddress,
          "0x0000000000000000000000000000000000000000" as Address,
        );
        const table = createTable(["Policy", "Token", "Remaining"]);
        table.push(["SpendingLimit", "ETH (native)", remaining.toString()]);
        console.log();
        console.log(chalk.bold("Installed Policies"));
        console.log(table.toString());
      } catch {
        info("No policies found or moduleAddresses not configured.");
        info("Use `sak config set moduleAddresses.spendingLimitHook <address>` to configure.");
      }

      // Check pause status
      try {
        const paused = await client.isPaused(walletAddress);
        console.log();
        info(`Emergency Pause: ${paused ? chalk.red("PAUSED") : chalk.green("Active")}`);
      } catch {
        // No pause hook configured
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

policyCommand
  .command("add")
  .description("Add a policy to an existing wallet (coming soon)")
  .action(() => {
    info("Policy addition via CLI is coming in a future release.");
    info("Use the SDK directly: client.addPolicy(wallet, policy, ownerKey)");
  });

policyCommand
  .command("remove")
  .description("Remove a policy from a wallet (coming soon)")
  .action(() => {
    info("Policy removal via CLI is coming in a future release.");
    info("Use the SDK directly: client.removePolicy(wallet, moduleAddress, ownerKey)");
  });
