import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { createSdkClient } from "../utils/client.js";
import {
  success,
  error,
  printKeyValue,
  formatBalance,
} from "../utils/display.js";
import { validateAddress } from "../utils/validation.js";

export const statusCommand = new Command("status")
  .description("Show wallet status, balances, and policies")
  .requiredOption("--wallet <address>", "Wallet address")
  .option("--chain <name>", "Target chain", "base-sepolia")
  .option("--rpc-url <url>", "RPC URL")
  .option("--bundler-url <url>", "Bundler URL")
  .action(async (options) => {
    const spinner = ora("Fetching wallet status...").start();

    try {
      const walletAddress = validateAddress(options.wallet, "wallet");

      const client = createSdkClient({
        chain: options.chain,
        rpcUrl: options.rpcUrl,
        bundlerUrl: options.bundlerUrl,
      });

      const balances = await client.getBalances(walletAddress);

      spinner.stop();
      console.log();
      console.log(chalk.bold("Wallet Status"));
      console.log();
      printKeyValue([
        ["Address", walletAddress],
        ["ETH Balance", formatBalance(balances.eth)],
      ]);

      // Check pause status if module addresses configured
      try {
        const paused = await client.isPaused(walletAddress);
        console.log();
        printKeyValue([
          ["Paused", paused ? chalk.red("Yes") : chalk.green("No")],
        ]);
      } catch {
        // moduleAddresses not configured, skip pause check
      }

      // Show active sessions
      const sessions = client.getActiveSessions(walletAddress);
      if (sessions.length > 0) {
        console.log();
        console.log(chalk.bold(`Active Sessions (${sessions.length})`));
        for (const s of sessions) {
          const expiresIn = s.expiresAt - Math.floor(Date.now() / 1000);
          const expiresStr =
            expiresIn > 0
              ? `${Math.floor(expiresIn / 3600)}h ${Math.floor((expiresIn % 3600) / 60)}m`
              : chalk.red("Expired");
          printKeyValue([
            ["  Session Key", s.sessionKey],
            ["  Expires In", expiresStr],
          ]);
        }
      }
    } catch (err) {
      spinner.stop();
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
