import { Command } from "commander";
import ora from "ora";
import type { Address } from "viem";
import type { PresetName } from "@smartagentkit/sdk";
import { createSdkClient } from "../utils/client.js";
import { success, error, printKeyValue } from "../utils/display.js";
import { validateAddress, resolveSignerKey } from "../utils/validation.js";

export const createCommand = new Command("create")
  .description("Create a new agent wallet")
  .requiredOption("--owner <address>", "Owner address")
  .option("--owner-key <hex>", "Owner private key (or set SAK_OWNER_KEY env var)")
  .option("--owner-mnemonic <phrase>", "Owner mnemonic phrase (or set SAK_OWNER_MNEMONIC env var)")
  .option("--address-index <n>", "HD derivation index (default: 0)", "0")
  .option("--preset <name>", "Policy preset (minimal, defi-trader, treasury-agent, payment-agent)")
  .option("--chain <name>", "Target chain", "base-sepolia")
  .option("--rpc-url <url>", "RPC URL")
  .option("--bundler-url <url>", "Bundler URL")
  .option("--salt <number>", "CREATE2 salt for deterministic address")
  .action(async (options) => {
    const spinner = ora("Creating agent wallet...").start();

    try {
      const ownerAddress = validateAddress(options.owner, "owner");
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

      // Build wallet params with either private key or mnemonic
      const walletParams: Parameters<typeof client.createWallet>[0] = {
        owner: ownerAddress,
        preset: options.preset as PresetName | undefined,
        salt: options.salt ? BigInt(options.salt) : undefined,
      };
      if (typeof ownerKey === "string") {
        walletParams.ownerPrivateKey = ownerKey;
      } else {
        walletParams.ownerMnemonic = ownerKey.mnemonic;
        walletParams.addressIndex = ownerKey.addressIndex;
      }

      const wallet = await client.createWallet(walletParams);

      spinner.stop();
      success("Agent wallet created!");
      console.log();
      printKeyValue([
        ["Address", wallet.address],
        ["Owner", wallet.owner],
        ["Chain", wallet.chain.name],
        ["Deployed", wallet.isDeployed ? "Yes" : "No (deploy on first tx)"],
        ["Policies", wallet.policies.length.toString()],
      ]);

      if (wallet.policies.length > 0) {
        console.log();
        console.log("  Installed policies:");
        for (const p of wallet.policies) {
          console.log(`    - ${p.name} (${p.moduleAddress})`);
        }
      }
    } catch (err) {
      spinner.stop();
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
