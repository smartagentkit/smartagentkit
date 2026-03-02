# Wallet Creation

SmartAgentKit creates ERC-4337 smart contract wallets powered by Safe and the ERC-7579 modular account standard. This guide covers wallet creation, policy configuration at deploy time, presets, and connecting to existing wallets.

## SmartAgentKitClient Constructor

```typescript
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { baseSepolia } from "viem/chains";

const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: "https://base-sepolia.g.alchemy.com/v2/YOUR_KEY",
  bundlerUrl: "https://api.pimlico.io/v2/84532/rpc?apikey=YOUR_KEY",
  paymasterUrl: "https://...", // Optional: gas sponsorship
  moduleAddresses: {           // Optional: auto-resolved for Base Sepolia & Sepolia
    spendingLimitHook: "0x...",
    allowlistHook: "0x...",
    emergencyPauseHook: "0x...",
    automationExecutor: "0x...",
  },
});
```

### Config Type

```typescript
interface SmartAgentKitConfig {
  chain: Chain;
  rpcUrl: string;
  bundlerUrl: string;
  paymasterUrl?: string;
  moduleAddresses?: ModuleAddresses;
}
```

- **`chain`** — A viem `Chain` object (e.g. `baseSepolia`, `sepolia`, `base`).
- **`rpcUrl`** — JSON-RPC endpoint for the target chain.
- **`bundlerUrl`** — ERC-4337 bundler endpoint (e.g. Pimlico, Alchemy, Stackup).
- **`paymasterUrl`** — Optional paymaster for gas sponsorship.
- **`moduleAddresses`** — Optional. Auto-resolved for Base Sepolia and Sepolia. Required for other chains.

## Creating a Wallet with Policies

```typescript
const wallet = await client.createWallet({
  owner: "0xYourAddress",
  ownerPrivateKey: "0xYourPrivateKey",
  policies: [
    {
      type: "spending-limit",
      limits: [
        { token: NATIVE_TOKEN, limit: parseEther("1"), window: 86400 },
      ],
    },
    {
      type: "allowlist",
      mode: "allow",
      targets: [{ address: "0xRouterAddress" }],
    },
    {
      type: "emergency-pause",
      guardian: "0xYourAddress",
      autoUnpauseAfter: 3600,
    },
  ],
});
```

The `policies` array accepts any combination of the three policy hooks. See the [Policy Configuration](/guides/policy-configuration) guide for full details on each policy type.

## Creating a Wallet with Presets

Presets provide pre-configured policy bundles for common use cases:

```typescript
const wallet = await client.createWallet({
  owner: "0xYourAddress",
  ownerPrivateKey: "0xYourPrivateKey",
  preset: "defi-trader",
  presetParams: {
    dailyEthLimit: parseEther("2"), // Override default 1 ETH
    guardian: "0xGuardianAddress",   // Override default (owner)
    allowedDexes: ["0xUniswapRouter"],
  },
});
```

### Available Presets

| Preset | Spending | Allowlist | Pause | Use Case |
|---|---|---|---|---|
| `defi-trader` | 1 ETH/day | DEX allowlist (via `allowedDexes`) | 24h auto-unpause | Trading agents |
| `treasury-agent` | 5 ETH/week | None | Manual unpause | Treasury ops |
| `payment-agent` | 0.1 ETH/day | Recipients (via `approvedRecipients`) | 1h auto-unpause | Payments |
| `minimal` | None | None | Manual unpause | Testing |

## Connecting to an Existing Wallet

If you already have a deployed Smart Agent wallet, connect to it instead of creating a new one:

```typescript
await client.connectWallet("0xWalletAddress", "0xOwnerPrivateKey");
// or with mnemonic
await client.connectWallet("0xWalletAddress", {
  mnemonic: "word1 word2 ...",
  addressIndex: 0,
});
```

## Signer Key Options

The `SignerKey` type accepts either a hex private key or a mnemonic:

```typescript
type SignerKey = Hex | MnemonicCredential;

interface MnemonicCredential {
  mnemonic: string;
  addressIndex?: number; // Default: 0
}
```

When using a mnemonic, the SDK derives the key using the standard BIP-44 Ethereum path (`m/44'/60'/0'/0/{addressIndex}`).

## What Happens During Wallet Creation

Understanding the internal flow helps with debugging and gas estimation:

1. **Owner resolution** — The owner account is resolved from the provided private key or mnemonic.
2. **Safe account deployment** — `toSafeSmartAccount()` from permissionless.js creates a Safe account with the ERC-7579 adapter via the Safe7579 Launchpad.
3. **HookMultiPlexer installation** — The HookMultiPlexer is installed as the single hook on the account. It is installed **empty** (no sub-hooks yet).
4. **Sub-hook initialization** — The first UserOp sends a batch that initializes all configured sub-hooks. For each sub-hook, the batch includes three calls:
   - `onInstall(initData)` — Installs the sub-hook with its configuration data
   - `setTrustedForwarder(multiplexer)` — Allows the HookMultiPlexer to call the sub-hook
   - `addHook(hookAddr, GLOBAL)` — Registers the sub-hook in the HookMultiPlexer

This two-step process (deploy empty, then configure) is required because the Safe7579 Launchpad only supports installing one module of each type at deployment time, and the sub-hooks need the multiplexer address to set as their trusted forwarder.
