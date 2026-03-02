import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import type { Address, Hex } from "viem";
import { createSdkClient } from "../utils/client.js";
import {
  success,
  error,
  info,
  printKeyValue,
  createTable,
} from "../utils/display.js";
import { validateAddress, resolveSignerKey, validateSelector, validateHex } from "../utils/validation.js";

export const sessionCommand = new Command("session")
  .description("Manage session keys (create/revoke/list)");

sessionCommand
  .command("create")
  .description("Create a new session key for an agent")
  .requiredOption("--wallet <address>", "Wallet address")
  .option("--owner-key <hex>", "Owner private key (or set SAK_OWNER_KEY env var)")
  .option("--owner-mnemonic <phrase>", "Owner mnemonic phrase (or set SAK_OWNER_MNEMONIC env var)")
  .option("--address-index <n>", "HD derivation index (default: 0)", "0")
  .requiredOption("--target <address>", "Target contract address")
  .requiredOption("--selector <hex>", "Allowed function selector (e.g., 0xa9059cbb)")
  .option("--expires <seconds>", "Session duration in seconds", "3600")
  .option("--chain <name>", "Target chain", "base-sepolia")
  .option("--rpc-url <url>", "RPC URL")
  .option("--bundler-url <url>", "Bundler URL")
  .action(async (options) => {
    const spinner = ora("Creating session key...").start();

    try {
      const walletAddress = validateAddress(options.wallet, "wallet");
      const targetAddress = validateAddress(options.target, "target");
      const ownerKey = resolveSignerKey(
        options.ownerKey,
        options.ownerMnemonic,
        "SAK_OWNER_KEY",
        "SAK_OWNER_MNEMONIC",
        "owner",
        parseInt(options.addressIndex, 10),
      );

      const client = createSdkClient({
        chain: options.chain,
        rpcUrl: options.rpcUrl,
        bundlerUrl: options.bundlerUrl,
      });

      // Connect to the wallet first
      await client.connectWallet(walletAddress, ownerKey);

      const expiresAt =
        Math.floor(Date.now() / 1000) + parseInt(options.expires, 10);

      const result = await client.createSession(
        {
          address: walletAddress,
          owner: walletAddress, // Will be resolved from connected wallet
          chain: (await import("../utils/chains.js")).resolveChain(
            options.chain ?? "base-sepolia",
          ),
          isDeployed: true,
          policies: [],
          sessions: [],
        },
        {
          sessionKey: "0x0000000000000000000000000000000000000000" as Address, // Will be generated
          actions: [
            {
              target: targetAddress,
              selector: validateSelector(options.selector, "function"),
            },
          ],
          expiresAt,
        },
        ownerKey,
      );

      spinner.stop();
      success("Session key created!");
      console.log();

      // Warn about sensitive key material
      console.log(
        chalk.yellow(
          "  WARNING: The private key below grants transaction signing access.",
        ),
      );
      console.log(
        chalk.yellow(
          "  Store it securely and never share it publicly.",
        ),
      );
      console.log();

      printKeyValue([
        ["Session Key", result.sessionKey],
        ["Private Key", result.privateKey],
        ["Permission ID", result.permissionId],
        [
          "Expires",
          new Date(expiresAt * 1000).toISOString(),
        ],
      ]);
      console.log();
      info(
        "Save the private key securely — the agent needs it to sign transactions.",
      );
    } catch (err) {
      spinner.stop();
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

sessionCommand
  .command("list")
  .description("List active sessions for a wallet")
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

      const sessions = client.getActiveSessions(walletAddress);

      if (sessions.length === 0) {
        info("No active sessions found for this wallet.");
        info(
          chalk.gray(
            "Note: Session data is stored in-memory only and does not persist across CLI invocations.",
          ),
        );
        return;
      }

      const table = createTable([
        "Session Key",
        "Expires",
        "Actions",
      ]);

      for (const s of sessions) {
        const expiresIn = s.expiresAt - Math.floor(Date.now() / 1000);
        const expiresStr =
          expiresIn > 0
            ? `${Math.floor(expiresIn / 3600)}h ${Math.floor((expiresIn % 3600) / 60)}m`
            : chalk.red("Expired");

        table.push([
          `${s.sessionKey.slice(0, 10)}...`,
          expiresStr,
          s.actions.length.toString(),
        ]);
      }

      console.log();
      console.log(chalk.bold(`Sessions for ${walletAddress}`));
      console.log(table.toString());
      console.log();
      info(
        chalk.gray(
          "Note: Session data is stored in-memory only and does not persist across CLI invocations.",
        ),
      );
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

sessionCommand
  .command("revoke")
  .description("Revoke a session key")
  .requiredOption("--wallet <address>", "Wallet address")
  .requiredOption("--permission-id <hex>", "Permission ID to revoke")
  .option("--owner-key <hex>", "Owner private key (or set SAK_OWNER_KEY env var)")
  .option("--owner-mnemonic <phrase>", "Owner mnemonic phrase (or set SAK_OWNER_MNEMONIC env var)")
  .option("--address-index <n>", "HD derivation index (default: 0)", "0")
  .option("--chain <name>", "Target chain", "base-sepolia")
  .option("--rpc-url <url>", "RPC URL")
  .option("--bundler-url <url>", "Bundler URL")
  .action(async (options) => {
    const spinner = ora("Revoking session...").start();

    try {
      const walletAddress = validateAddress(options.wallet, "wallet");
      const ownerKey = resolveSignerKey(
        options.ownerKey,
        options.ownerMnemonic,
        "SAK_OWNER_KEY",
        "SAK_OWNER_MNEMONIC",
        "owner",
        parseInt(options.addressIndex, 10),
      );

      const client = createSdkClient({
        chain: options.chain,
        rpcUrl: options.rpcUrl,
        bundlerUrl: options.bundlerUrl,
      });

      await client.connectWallet(walletAddress, ownerKey);

      await client.revokeSession(
        {
          address: walletAddress,
          owner: walletAddress,
          chain: (await import("../utils/chains.js")).resolveChain(
            options.chain ?? "base-sepolia",
          ),
          isDeployed: true,
          policies: [],
          sessions: [],
        },
        validateHex(options.permissionId, "permission ID"),
        ownerKey,
      );

      spinner.stop();
      success("Session revoked!");
      printKeyValue([
        ["Permission ID", options.permissionId],
      ]);
    } catch (err) {
      spinner.stop();
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
