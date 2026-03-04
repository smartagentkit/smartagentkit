# SmartAgentKit

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/smartagentkit/smartagentkit/ci.yml?branch=main&label=CI)](https://github.com/smartagentkit/smartagentkit/actions)
[![npm: @smartagentkit/sdk](https://img.shields.io/npm/v/@smartagentkit/sdk?label=sdk)](https://www.npmjs.com/package/@smartagentkit/sdk)
[![npm: @smartagentkit/langchain](https://img.shields.io/npm/v/@smartagentkit/langchain?label=langchain)](https://www.npmjs.com/package/@smartagentkit/langchain)

Open-source SDK and smart contract toolkit for deploying **policy-governed smart wallets** for AI agents on EVM chains.

## What Is SmartAgentKit?

SmartAgentKit deploys ERC-4337 smart accounts (Safe + ERC-7579 modules) with built-in policy enforcement. Your agent gets a wallet that physically cannot exceed its budget, call unapproved contracts, or operate outside its session window — because on-chain hooks revert any transaction that violates policy.

This is not application-level filtering. Policies are enforced by the blockchain itself.

## Why Agent Wallets Need Policies

AI agents need wallets to interact with blockchains. But giving an LLM unrestricted access to a wallet is a security risk. One hallucinated transaction, one prompt injection, or one buggy tool call could drain the entire balance. Traditional EOA wallets offer no guardrails: if you have the private key, you can do anything.

SmartAgentKit solves this by constraining agent behavior at the smart contract level. Even if the agent is compromised, the on-chain policies hold.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Your Application / AI Agent                     │
│  (LangChain, custom agent, etc.)                 │
├─────────────────────────────────────────────────┤
│  @smartagentkit/sdk  or  @smartagentkit/langchain │
│  createWallet() · execute() · checkAllowance()   │
├─────────────────────────────────────────────────┤
│  ERC-4337 Bundler (Pimlico)                      │
├─────────────────────────────────────────────────┤
│  On-Chain: Safe + ERC-7579 Adapter               │
│  ┌─────────────────────────────────────┐         │
│  │ HookMultiPlexer (single hook slot)  │         │
│  │  ├─ SpendingLimitHook               │         │
│  │  ├─ AllowlistHook                   │         │
│  │  ├─ EmergencyPauseHook              │         │
│  │  └─ YourCustomHook (plugin)         │         │
│  └─────────────────────────────────────┘         │
└─────────────────────────────────────────────────┘
```

The SDK builds ERC-4337 UserOperations and submits them through a bundler. The bundler sends them to the EntryPoint contract, which calls your Safe account. The Safe7579 adapter routes execution through the HookMultiPlexer, which runs every installed policy hook before and after each call. If any hook reverts, the entire UserOperation fails.

ERC-7579 accounts support only one hook — the HookMultiPlexer fills that slot and routes to all individual policy hooks. This is a hard architectural requirement.

## Deployment Options

SmartAgentKit is chain-agnostic and does not rely on centralized deployments.

- **No official deployments required.** The SDK works with any deployed instance of the hook contracts.
- **Deploy your own hooks.** Use the provided Foundry deploy script or deploy manually to any EVM chain.
- **Arbitrary hook addresses.** Pass any contract address via `moduleAddresses` or `hookAddress` — the SDK does not hardcode addresses.
- **Built-in defaults for convenience.** The SDK ships with default addresses for Base Sepolia and Sepolia testnets. These are convenience defaults, not requirements.
- **Production deployments should use your own contracts.** Deploy, audit, and verify your own hook instances for production use.

```typescript
// Use your own deployed hooks on any chain
const client = new SmartAgentKitClient({
  chain: myChain,
  rpcUrl: "...",
  bundlerUrl: "...",
  moduleAddresses: {
    spendingLimitHook: "0xYourSpendingLimitHook",
    allowlistHook: "0xYourAllowlistHook",
    emergencyPauseHook: "0xYourEmergencyPauseHook",
  },
});
```

## Quickstart

### Install

```bash
npm install @smartagentkit/sdk
```

### Create a Policy-Governed Wallet

```typescript
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { baseSepolia } from "viem/chains";

const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: process.env.RPC_URL!,
  bundlerUrl: process.env.BUNDLER_URL!,
});

const wallet = await client.createWallet({
  owner: "0xYourAddress",
  ownerPrivateKey: "0xYourPrivateKey",
  preset: "defi-trader",
  // defi-trader preset includes:
  //   - 1 ETH/day spending limit
  //   - Allowlist for common DeFi protocols
  //   - Emergency pause (guardian = owner)
});

console.log(`Agent wallet deployed at: ${wallet.address}`);
```

### Execute a Transaction

```typescript
await client.execute(wallet, {
  target: "0xTokenAddress",
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: ["0xRecipient", parseEther("100")],
  }),
});
// If this exceeds the spending limit, it reverts on-chain.
```

### Emergency Pause

```typescript
// Guardian pauses all agent activity
await client.pause(wallet.address, guardianPrivateKey);

// All agent transactions now revert until unpaused
await client.unpause(wallet.address, guardianPrivateKey);
```

### CLI

```bash
# Install globally
npm install -g smartagentkit

# Create a wallet with the defi-trader preset
sak create --preset defi-trader --chain base-sepolia --owner 0xYourAddress --owner-key 0xYourKey

# Check wallet status
sak status --wallet 0xWalletAddress

# Pause the wallet
sak pause --wallet 0xWalletAddress --guardian-key 0xGuardianKey
```

## Policy Modules

### SpendingLimitHook

Per-token spending caps with rolling time windows. Tracks cumulative spending and resets when the window expires.

```typescript
{
  type: "spending-limit",
  limits: [
    { token: NATIVE_TOKEN, limit: parseEther("1"), window: 86400 }, // 1 ETH/day
    { token: USDC_ADDRESS, limit: 1000_000000n, window: 3600 },     // 1000 USDC/hour
  ]
}
```

### AllowlistHook

Restrict which contracts and function selectors the agent can interact with.

```typescript
{
  type: "allowlist",
  mode: "allow", // or "block"
  targets: [
    { address: UNISWAP_ROUTER, selector: "0x..." }, // Specific function
    { address: AAVE_POOL },                          // All functions (wildcard)
  ]
}
```

### EmergencyPauseHook

Circuit breaker with optional auto-unpause timeout.

```typescript
{
  type: "emergency-pause",
  guardian: "0xYourAddress",
  autoUnpauseAfter: 3600, // Auto-unpause after 1 hour (0 = manual only)
}
```

### Presets

Pre-configured policy bundles for common use cases:

| Preset | Spending | Allowlist | Pause | Use Case |
|--------|----------|-----------|-------|----------|
| `defi-trader` | 1 ETH/day | DEX allowlist (pass `allowedDexes`) | Guardian = owner, 24h auto-unpause | Trading agents |
| `treasury-agent` | 5 ETH/week | None | Guardian = owner, manual unpause | Treasury ops |
| `payment-agent` | 0.1 ETH/day | Recipients allowlist (pass `approvedRecipients`) | Guardian = owner, 1h auto-unpause | Payments |
| `minimal` | None | None | Guardian = owner, manual unpause | Testing |

All presets default guardian to the owner address. Override with `presetParams: { guardian: "0x..." }`.

## Installing Custom Policies

SmartAgentKit has a plugin architecture for policies. You can write your own Solidity hook, define a TypeScript plugin, and register it with the SDK — no changes to SDK internals required.

### Install via Plugin

Register a plugin and install it with an explicit hook address:

```typescript
import { pluginRegistry } from "@smartagentkit/sdk";

// Register your custom plugin
pluginRegistry.register(myCustomPlugin);

// Install with an explicit hook address
await client.policies.install(wallet, {
  plugin: "my-custom-hook",
  hookAddress: "0xYourDeployedHook",
  config: { type: "my-custom-hook", /* plugin-specific config */ },
}, ownerKey);
```

If the plugin has `defaultAddresses` for the current chain, `hookAddress` can be omitted — the SDK resolves the address from the registry. Otherwise, `hookAddress` is required.

Plugins can also be used at wallet creation time:

```typescript
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  policies: [
    { type: "spending-limit", limits: [...] },
    { type: "my-custom-hook", /* ... */ } as any,
  ],
  // Provide addresses for custom hooks
  moduleAddresses: {
    ...existingAddresses,
    customModules: { "my-custom-hook": "0xYourDeployedHook" },
  },
});
```

### Install Raw (No Plugin)

For external or community hooks where you don't have a plugin definition, use `installRaw()` with pre-encoded init data:

```typescript
await client.policies.installRaw(wallet, {
  hookAddress: "0xExternalHook",
  moduleType: "hook",
  initData: "0x...", // Pre-encoded onInstall data
}, ownerKey);
```

This skips plugin resolution and config validation entirely. You are responsible for encoding the init data correctly. This is the escape hatch for any ERC-7579 hook contract.

See the [Custom Policies Guide](https://smartagentkit.github.io/smartagentkit/guides/custom-policies) for the full walkthrough including Solidity contracts, TypeScript plugin definitions, deployment, and testing.

## Policy Playground

The [Policy Playground](apps/examples/policy-playground) demonstrates the plugin architecture end-to-end. It defines a custom `TargetBlockerPlugin`, registers it, validates config, encodes init data, resolves addresses, and creates a wallet with both built-in and custom policies.

```bash
# Clone the repo and run the playground
git clone https://github.com/smartagentkit/smartagentkit.git
cd smartagentkit
pnpm install && pnpm build

cd apps/examples/policy-playground
pnpm start:mock
```

The playground runs through 7 steps and prints the result of each operation. No chain connection, funding, or API keys required in mock mode.

Start with `src/custom-plugin.ts` to see a complete `PolicyPlugin` implementation, then read `src/playground.ts` to see how it integrates with the SDK.

## What Policies Do — And Don't — Protect Against

Policies **do**:
- Enforce spending caps, target restrictions, and pause states on-chain via hooks
- Restrict which contracts and function selectors the agent can call
- Limit blast radius of a compromised agent or session key
- Provide a circuit breaker (emergency pause) for immediate response to incidents
- Cannot be bypassed by a compromised agent or a modified SDK — enforcement is at the EVM level

Policies do **not**:
- Protect against protocol-level exploits in contracts your agent interacts with
- Track all forms of value movement (e.g., token wrapping, flash loans, delegate calls)
- Automatically track USD-denominated value (limits are in token amounts)
- Replace security audits of your own hook contracts or application logic
- Prevent the wallet owner from removing policies (the owner has full override control by design)

See the [Security Model](https://smartagentkit.github.io/smartagentkit/security/model) for the full threat model and known limitations.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@smartagentkit/sdk`](packages/sdk) | Core TypeScript SDK | [![npm](https://img.shields.io/npm/v/@smartagentkit/sdk)](https://www.npmjs.com/package/@smartagentkit/sdk) |
| [`smartagentkit`](packages/cli) | CLI tool (`sak` alias) | [![npm](https://img.shields.io/npm/v/smartagentkit)](https://www.npmjs.com/package/smartagentkit) |
| [`@smartagentkit/langchain`](packages/integrations/langchain) | LangChain integration | [![npm](https://img.shields.io/npm/v/@smartagentkit/langchain)](https://www.npmjs.com/package/@smartagentkit/langchain) |
| [`@smartagentkit/testing`](packages/testing) | Mock client for testing | [![npm](https://img.shields.io/npm/v/@smartagentkit/testing)](https://www.npmjs.com/package/@smartagentkit/testing) |
| [`packages/contracts`](packages/contracts) | Solidity modules (Foundry) | — |

## Examples

See [`apps/examples/`](apps/examples) for complete working examples:

- **[DeFi Trading Agent](apps/examples/defi-trading-agent)** — Autonomous trading agent using LangChain + LangGraph within policy guardrails
- **[Treasury Management](apps/examples/treasury-management-agent)** — Batch rebalancing with Claude (Anthropic)
- **[Payment Distribution](apps/examples/payment-distribution-bot)** — Scheduled payouts with recipient allowlist
- **[Monitoring & Alerts](apps/examples/monitoring-alert-agent)** — Guardian pattern with auto-pause rules
- **[Arbitrage Agent](apps/examples/arbitrage-agent)** — Session keys for atomic DEX arbitrage
- **[Policy Playground](apps/examples/policy-playground)** — Custom plugin development and testing

All examples support `--mock` mode for running without deploying or funding wallets.

## Key Technologies

- **[ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)** — Account Abstraction
- **[ERC-7579](https://eips.ethereum.org/EIPS/eip-7579)** — Modular Smart Accounts
- **[Safe](https://safe.global/)** — Smart account base (via Safe7579 adapter)
- **[Rhinestone ModuleKit](https://docs.rhinestone.wtf/)** — Module development framework
- **[HookMultiPlexer](https://github.com/rhinestonewtf/core-modules)** — Multi-hook routing
- **[permissionless.js](https://docs.pimlico.io/permissionless)** — ERC-4337 SDK
- **[Smart Sessions](https://github.com/erc7579/smartsessions)** — Session key management

## Development

```bash
# Prerequisites: Node 22+, pnpm 10+, Foundry

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build and test contracts
cd packages/contracts
forge build
forge test

# Run SDK tests
pnpm test
```

## Project Structure

```
smartagentkit/
├── packages/
│   ├── contracts/           # Solidity modules (Foundry)
│   │   ├── src/modules/     # SpendingLimitHook, AllowlistHook, EmergencyPauseHook, AutomationExecutor
│   │   ├── script/          # Deploy scripts
│   │   └── test/
│   ├── sdk/                 # @smartagentkit/sdk
│   │   └── src/plugins/     # Plugin architecture (registry, built-in plugins)
│   ├── cli/                 # smartagentkit CLI
│   ├── testing/             # @smartagentkit/testing (MockSmartAgentKitClient)
│   └── integrations/
│       └── langchain/       # @smartagentkit/langchain
├── apps/
│   ├── docs/                # Documentation site (VitePress)
│   └── examples/            # 6 runnable examples including Policy Playground
└── .github/workflows/       # CI/CD
```

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

To contribute a policy plugin:
- Run the [Policy Playground](#policy-playground) to understand the plugin architecture
- Read the [Custom Policies Guide](https://smartagentkit.github.io/smartagentkit/guides/custom-policies) for the full walkthrough

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)
