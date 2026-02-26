import { Command } from "commander";
import ora from "ora";
import { createSdkClient } from "../utils/client.js";
import { success, error, printKeyValue } from "../utils/display.js";
import { validateAddress, resolveSignerKey } from "../utils/validation.js";

export const pauseCommand = new Command("pause")
  .description("Emergency pause a wallet")
  .requiredOption("--wallet <address>", "Wallet address")
  .option("--guardian-key <hex>", "Guardian private key (or set SAK_GUARDIAN_KEY env var)")
  .option("--guardian-mnemonic <phrase>", "Guardian mnemonic phrase (or set SAK_GUARDIAN_MNEMONIC env var)")
  .option("--address-index <n>", "HD derivation index (default: 0)", "0")
  .option("--chain <name>", "Target chain", "base-sepolia")
  .option("--rpc-url <url>", "RPC URL")
  .option("--bundler-url <url>", "Bundler URL")
  .action(async (options) => {
    const spinner = ora("Pausing wallet...").start();

    try {
      const walletAddress = validateAddress(options.wallet, "wallet");
      const guardianKey = resolveSignerKey(
        options.guardianKey,
        options.guardianMnemonic,
        "SAK_GUARDIAN_KEY",
        "SAK_GUARDIAN_MNEMONIC",
        "guardian",
        parseInt(options.addressIndex, 10),
      );

      const client = createSdkClient({
        chain: options.chain,
        rpcUrl: options.rpcUrl,
        bundlerUrl: options.bundlerUrl,
      });

      const txHash = await client.pause(
        walletAddress,
        guardianKey,
      );

      spinner.stop();
      success("Wallet paused!");
      printKeyValue([
        ["Wallet", walletAddress],
        ["Tx Hash", txHash],
      ]);
    } catch (err) {
      spinner.stop();
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export const unpauseCommand = new Command("unpause")
  .description("Unpause a wallet")
  .requiredOption("--wallet <address>", "Wallet address")
  .option("--guardian-key <hex>", "Guardian private key (or set SAK_GUARDIAN_KEY env var)")
  .option("--guardian-mnemonic <phrase>", "Guardian mnemonic phrase (or set SAK_GUARDIAN_MNEMONIC env var)")
  .option("--address-index <n>", "HD derivation index (default: 0)", "0")
  .option("--chain <name>", "Target chain", "base-sepolia")
  .option("--rpc-url <url>", "RPC URL")
  .option("--bundler-url <url>", "Bundler URL")
  .action(async (options) => {
    const spinner = ora("Unpausing wallet...").start();

    try {
      const walletAddress = validateAddress(options.wallet, "wallet");
      const guardianKey = resolveSignerKey(
        options.guardianKey,
        options.guardianMnemonic,
        "SAK_GUARDIAN_KEY",
        "SAK_GUARDIAN_MNEMONIC",
        "guardian",
        parseInt(options.addressIndex, 10),
      );

      const client = createSdkClient({
        chain: options.chain,
        rpcUrl: options.rpcUrl,
        bundlerUrl: options.bundlerUrl,
      });

      const txHash = await client.unpause(
        walletAddress,
        guardianKey,
      );

      spinner.stop();
      success("Wallet unpaused!");
      printKeyValue([
        ["Wallet", walletAddress],
        ["Tx Hash", txHash],
      ]);
    } catch (err) {
      spinner.stop();
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
