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
  salt?: string;
}

/**
 * Allowed top-level configuration keys and their allowed nested keys.
 * Any key not in this allowlist will be rejected by setConfigValue and
 * the `config set` command.
 */
const ALLOWED_CONFIG_KEYS: Record<string, true | string[]> = {
  defaultChain: true,
  rpcUrl: true,
  bundlerUrl: true,
  paymasterUrl: true,
  salt: true,
  moduleAddresses: [
    "spendingLimitHook",
    "allowlistHook",
    "emergencyPauseHook",
    "automationExecutor",
  ],
};

/**
 * Checks whether a dot-notation key path is safe and within the allowlist.
 * Returns an error message string if invalid, or `null` if the key is valid.
 */
export function validateConfigKey(key: string): string | null {
  // Prototype pollution guard — reject any segment that could pollute
  const DANGEROUS_SEGMENTS = ["__proto__", "constructor", "prototype"];
  const parts = key.split(".");
  for (const part of parts) {
    if (DANGEROUS_SEGMENTS.includes(part)) {
      return `Rejected: key segment "${part}" is not allowed (prototype pollution risk).`;
    }
  }

  const topLevel = parts[0];
  const allowed = ALLOWED_CONFIG_KEYS[topLevel];
  if (!allowed) {
    return `Unknown config key "${topLevel}". Allowed keys: ${Object.keys(ALLOWED_CONFIG_KEYS).join(", ")}.`;
  }

  if (parts.length === 1) {
    return null; // top-level key that exists in the allowlist
  }

  if (allowed === true) {
    // Top-level scalar — does not support nested paths
    return `Key "${topLevel}" does not support nested properties.`;
  }

  if (parts.length === 2) {
    if (!(allowed as string[]).includes(parts[1])) {
      return `Unknown nested key "${parts[1]}" under "${topLevel}". Allowed: ${(allowed as string[]).join(", ")}.`;
    }
    return null;
  }

  return `Key path "${key}" is too deeply nested. Maximum depth is 2.`;
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
  return (config as unknown as Record<string, unknown>)[key] as string | undefined;
}

export function setConfigValue(key: string, value: string): void {
  const validationError = validateConfigKey(key);
  if (validationError) {
    throw new Error(validationError);
  }
  const config = loadConfig();
  (config as unknown as Record<string, unknown>)[key] = value;
  saveConfig(config);
}

export function deleteConfigValue(key: string): void {
  const validationError = validateConfigKey(key);
  if (validationError) {
    throw new Error(validationError);
  }
  const config = loadConfig();
  delete (config as unknown as Record<string, unknown>)[key];
  saveConfig(config);
}
