import { Command } from "commander";
import chalk from "chalk";
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  setConfigValue,
  deleteConfigValue,
} from "../utils/config.js";
import { listChains } from "../utils/chains.js";
import { success, error, info, printKeyValue } from "../utils/display.js";

export const configCommand = new Command("config")
  .description("Manage CLI configuration");

configCommand
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log();
    console.log(chalk.bold("Configuration"));
    console.log(chalk.gray(`  File: ${getConfigPath()}`));
    console.log();
    console.log(JSON.stringify(config, null, 2));
  });

configCommand
  .command("set")
  .description("Set a configuration value")
  .argument("<key>", "Config key (e.g., rpcUrl, defaultChain)")
  .argument("<value>", "Config value")
  .action((key: string, value: string) => {
    // Handle nested keys like moduleAddresses.spendingLimitHook
    if (key.includes(".")) {
      const parts = key.split(".");
      const config = loadConfig();
      let obj = config as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]] || typeof obj[parts[i]] !== "object") {
          obj[parts[i]] = {};
        }
        obj = obj[parts[i]] as Record<string, unknown>;
      }
      obj[parts[parts.length - 1]] = value;
      saveConfig(config);
    } else {
      setConfigValue(key, value);
    }
    success(`Set ${key} = ${value}`);
  });

configCommand
  .command("delete")
  .description("Delete a configuration value")
  .argument("<key>", "Config key to delete (supports dot-notation, e.g. moduleAddresses.spendingLimitHook)")
  .action((key: string) => {
    if (key.includes(".")) {
      const parts = key.split(".");
      const config = loadConfig();
      let obj = config as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]] || typeof obj[parts[i]] !== "object") {
          // Path doesn't exist, nothing to delete
          success(`Deleted ${key}`);
          return;
        }
        obj = obj[parts[i]] as Record<string, unknown>;
      }
      delete obj[parts[parts.length - 1]];
      saveConfig(config);
    } else {
      deleteConfigValue(key);
    }
    success(`Deleted ${key}`);
  });

configCommand
  .command("chains")
  .description("List supported chain names")
  .action(() => {
    console.log();
    console.log(chalk.bold("Supported Chains"));
    console.log();
    for (const name of listChains()) {
      console.log(`  ${chalk.cyan(name)}`);
    }
  });

configCommand
  .command("init")
  .description("Initialize configuration interactively")
  .option("--chain <name>", "Default chain", "base-sepolia")
  .option("--rpc-url <url>", "RPC URL")
  .option("--bundler-url <url>", "Bundler URL")
  .action((options) => {
    const config = loadConfig();

    if (options.chain) config.defaultChain = options.chain;
    if (options.rpcUrl) config.rpcUrl = options.rpcUrl;
    if (options.bundlerUrl) config.bundlerUrl = options.bundlerUrl;

    saveConfig(config);
    success("Configuration saved!");
    console.log();
    printKeyValue([
      ["Config file", getConfigPath()],
      ["Default chain", config.defaultChain],
      ["RPC URL", config.rpcUrl ?? "(not set)"],
      ["Bundler URL", config.bundlerUrl ?? "(not set)"],
    ]);
  });
