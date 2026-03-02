import { isAddress, isHex } from "viem";
import type { Address, Hex } from "viem";
import type { SignerKey } from "@smartagentkit/sdk";

/**
 * Validate and return a checksummed Ethereum address.
 * Throws a descriptive error if the input is not a valid address.
 */
export function validateAddress(input: string, label: string): Address {
  if (!isAddress(input)) {
    throw new Error(
      `Invalid ${label} address: "${input}". Expected a 0x-prefixed 20-byte hex string.`,
    );
  }
  return input as Address;
}

/**
 * Validate a hex-encoded private key (64 hex chars after 0x prefix).
 */
export function validatePrivateKey(input: string, label: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input)) {
    throw new Error(
      `Invalid ${label} private key. Expected a 0x-prefixed 32-byte hex string.`,
    );
  }
  return input as Hex;
}

/**
 * Validate a BIP-39 mnemonic phrase (12 or 24 space-separated words).
 */
export function validateMnemonic(input: string, label: string): string {
  const words = input.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    throw new Error(
      `Invalid ${label} mnemonic. Expected 12 or 24 space-separated words.`,
    );
  }
  return input.trim();
}

/**
 * Resolve a private key from either CLI option or environment variable.
 * @param cliValue - Value from CLI option (may be undefined)
 * @param envVar - Environment variable name to fall back to
 * @param label - Label for error messages (e.g., "owner")
 * @returns The validated private key
 */
export function resolvePrivateKey(
  cliValue: string | undefined,
  envVar: string,
  label: string,
): Hex {
  const raw = cliValue ?? process.env[envVar];
  if (!raw) {
    throw new Error(
      `No ${label} private key provided. Use --${label}-key <hex> or set ${envVar} environment variable.`,
    );
  }
  return validatePrivateKey(raw, label);
}

/**
 * Resolve a signer credential from CLI options and environment variables.
 * Accepts either a private key or a mnemonic phrase.
 *
 * @param keyValue - Private key from CLI option (may be undefined)
 * @param mnemonicValue - Mnemonic from CLI option (may be undefined)
 * @param keyEnvVar - Env var for private key (e.g., "SAK_OWNER_KEY")
 * @param mnemonicEnvVar - Env var for mnemonic (e.g., "SAK_OWNER_MNEMONIC")
 * @param label - Label for error messages (e.g., "owner")
 * @param addressIndex - HD derivation index (default: 0)
 * @returns A SignerKey (Hex or MnemonicCredential)
 */
export function resolveSignerKey(
  keyValue: string | undefined,
  mnemonicValue: string | undefined,
  keyEnvVar: string,
  mnemonicEnvVar: string,
  label: string,
  addressIndex?: number,
): SignerKey {
  const rawKey = keyValue ?? process.env[keyEnvVar];
  const rawMnemonic = mnemonicValue ?? process.env[mnemonicEnvVar];

  // SECURITY: Warn if key material was passed as a CLI argument (visible in `ps aux`)
  if (keyValue) {
    process.stderr.write(
      `\x1b[33mWARNING: ${label} private key passed as a CLI argument. ` +
        `CLI arguments are visible to other users via \`ps aux\`. ` +
        `Use the ${keyEnvVar} environment variable instead.\x1b[0m\n`,
    );
  }
  if (mnemonicValue) {
    process.stderr.write(
      `\x1b[33mWARNING: ${label} mnemonic passed as a CLI argument. ` +
        `CLI arguments are visible to other users via \`ps aux\`. ` +
        `Use the ${mnemonicEnvVar} environment variable instead.\x1b[0m\n`,
    );
  }

  if (rawKey) {
    return validatePrivateKey(rawKey, label);
  }

  if (rawMnemonic) {
    const mnemonic = validateMnemonic(rawMnemonic, label);
    return { mnemonic, addressIndex: addressIndex ?? 0 };
  }

  throw new Error(
    `No ${label} credential provided. ` +
      `Set the ${keyEnvVar} or ${mnemonicEnvVar} environment variable ` +
      `(preferred), or use --${label}-key / --${label}-mnemonic.`,
  );
}

/**
 * Validate a 4-byte function selector (0x + 8 hex chars).
 */
export function validateSelector(input: string, label: string): Hex {
  if (!/^0x[0-9a-fA-F]{8}$/.test(input)) {
    throw new Error(
      `Invalid ${label} selector: "${input}". Expected a 0x-prefixed 4-byte hex string (e.g., 0xa9059cbb).`,
    );
  }
  return input as Hex;
}

/**
 * Validate a generic hex string (0x-prefixed, even length).
 */
export function validateHex(input: string, label: string): Hex {
  if (!isHex(input)) {
    throw new Error(
      `Invalid ${label}: "${input}". Expected a 0x-prefixed hex string.`,
    );
  }
  return input as Hex;
}
