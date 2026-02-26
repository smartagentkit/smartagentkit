import { Command } from "commander";
import chalk from "chalk";
import { info, printKeyValue } from "../utils/display.js";
import { resolveChain } from "../utils/chains.js";
import { validateAddress } from "../utils/validation.js";

export const fundCommand = new Command("fund")
  .description("Show how to fund an agent wallet")
  .requiredOption("--wallet <address>", "Wallet address")
  .option("--chain <name>", "Target chain", "base-sepolia")
  .action((options) => {
    const chain = resolveChain(options.chain);
    const walletAddress = validateAddress(options.wallet, "wallet");

    console.log();
    console.log(chalk.bold("Fund Your Agent Wallet"));
    console.log();
    printKeyValue([
      ["Wallet", walletAddress],
      ["Chain", chain.name],
    ]);
    console.log();

    // Show faucet links for testnets
    const faucets: Record<string, string> = {
      "Base Sepolia": "https://www.coinbase.com/faucets/base-sepolia",
      "Sepolia": "https://sepoliafaucet.com",
      "Optimism Sepolia": "https://www.alchemy.com/faucets/optimism-sepolia",
      "Arbitrum Sepolia": "https://www.alchemy.com/faucets/arbitrum-sepolia",
    };

    const faucetUrl = faucets[chain.name];
    if (faucetUrl) {
      info(`Testnet faucet: ${chalk.underline(faucetUrl)}`);
      console.log();
    }

    info("Send ETH to the wallet address above to fund it.");
    info("The wallet will be deployed on the first transaction (if not yet deployed).");
  });
