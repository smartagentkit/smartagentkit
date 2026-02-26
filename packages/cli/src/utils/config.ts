import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface CliConfig {
  defaultChain: string;
  rpcUrl?: string;
  bundlerUrl?: string;
  paymasterUrl?: string;
  moduleAddresses?: {
    spendingLimitHook?: string;
    allowlistHook?: string;
    emergencyPauseHook?: string;
    automationExecutor?: string;
  };
}

const CONFIG_DIR = path.join(os.homedir(), ".smartagentkit");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: CliConfig = {
  defaultChain: "base-sepolia",
};

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function loadConfig(): CliConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: CliConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function getConfigValue(key: string): string | undefined {
  const config = loadConfig();
  return (config as Record<string, unknown>)[key] as string | undefined;
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  (config as Record<string, unknown>)[key] = value;
  saveConfig(config);
}

export function deleteConfigValue(key: string): void {
  const config = loadConfig();
  delete (config as Record<string, unknown>)[key];
  saveConfig(config);
}
