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

## Core Features

- **Spending Limits** — Per-token caps over rolling time windows (e.g., 1 ETH per day)
- **Allowlist / Blocklist** — Restrict which contracts and function selectors the agent can call
- **Emergency Pause** — Circuit breaker to freeze all wallet activity instantly
- **Session Keys** — Scoped, time-limited key pairs via Smart Sessions (Rhinestone + Biconomy)
- **Custom Policies** — Plugin architecture for writing and registering your own policy hooks
- **LangChain Integration** — Drop-in tools for AI agent frameworks
- **CLI** — Create wallets, manage policies, and monitor status from the command line
- **Mock Testing** — Full in-memory mock client for testing without deploying or funding wallets

## Deployment Options

SmartAgentKit is chain-agnostic and does not rely on centralized deployments.

- **No official deployments required.** The SDK works with any deployed instance of the hook contracts.
- **Deploy your own hooks.** Use the provided Foundry deploy script or deploy manually to any EVM chain.
- **Arbitrary hook addresses.** Pass any contract address via `moduleAddresses` or `hookAddress` — the SDK does not hardcode addresses.
- **Built-in defaults for convenience.** The SDK ships with default addresses for Base Sepolia and Sepolia testnets. These are convenience defaults, not requirements.
- **Production deployments should use your own contracts.** Deploy, audit, and verify your own hook instances for production use.

```typescript
// Use your own deployed hooks
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

// Or install a policy with an explicit hook address
await client.policies.install(wallet, {
  plugin: "allowlist",
  hookAddress: "0xYourDeployedHook",
  config: { type: "allowlist", mode: "allow", targets: [...] },
}, ownerKey);
```

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

## Policy Playground

The [Policy Playground](apps/examples/policy-playground) is a hands-on example that demonstrates the plugin architecture. It walks through registering a custom plugin, validating config, encoding init data, resolving addresses, and creating a wallet with custom policies.

```bash
# Clone the repo and run the playground
git clone https://github.com/smartagentkit/smartagentkit.git
cd smartagentkit
pnpm install && pnpm build

cd apps/examples/policy-playground
pnpm start:mock
```

The playground shows:
- How to define a custom `PolicyPlugin` (a `TargetBlockerPlugin` that blocks calls to a single address)
- Registering the plugin with `pluginRegistry`
- Config validation, init data encoding, and address resolution
- Creating wallets with both built-in and custom policies

This is the best starting point for understanding how to extend SmartAgentKit with your own policies.

## Writing Custom Policies

SmartAgentKit has a plugin architecture for policies. You can write your own Solidity hook contract, define a TypeScript plugin, and register it with the SDK — no changes to SDK internals required.

```typescript
import { pluginRegistry } from "@smartagentkit/sdk";

// Register your custom plugin
pluginRegistry.register(myCustomPlugin);

// Use it like any built-in policy
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  policies: [
    { type: "spending-limit", limits: [...] },
    { type: "my-custom-hook", /* ... */ } as any,
  ],
});
```

See the [Custom Policies Guide](apps/docs/guides/custom-policies.md) for a full walkthrough including Solidity contract, TypeScript plugin definition, deployment, and testing.

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

## Presets

Pre-configured policy bundles for common use cases:

| Preset | Spending | Allowlist | Pause | Use Case |
|--------|----------|-----------|-------|----------|
| `defi-trader` | 1 ETH/day | DEX allowlist (pass `allowedDexes`) | Guardian = owner, 24h auto-unpause | Trading agents |
| `treasury-agent` | 5 ETH/week | None | Guardian = owner, manual unpause | Treasury ops |
| `payment-agent` | 0.1 ETH/day | Recipients allowlist (pass `approvedRecipients`) | Guardian = owner, 1h auto-unpause | Payments |
| `minimal` | None | None | Guardian = owner, manual unpause | Testing |

All presets default guardian to the owner address. Override with `presetParams: { guardian: "0x..." }`.

## What Policies Do — And Don't — Protect Against

Policies:
- Restrict the scope of transactions an agent can execute
- Enforce spending caps, target restrictions, and pause states on-chain via hooks
- Cannot be bypassed by a compromised agent or a modified SDK — enforcement is at the EVM level
- Provide a circuit breaker (emergency pause) for immediate response to incidents

Policies do **not**:
- Protect against protocol-level exploits in the contracts your agent interacts with
- Track all forms of value movement (e.g., token wrapping, flash loans, delegate calls)
- Replace security audits of your own hook contracts or application logic
- Prevent the wallet owner from removing policies (the owner has full override control by design)

See the [Security Model](apps/docs/security/model.md) for the full threat model and known limitations.

## Wanted Policies (Good First Contributions)

The plugin architecture makes it straightforward to add new policy types. The following are ideas for policies that would be useful — each is a good candidate for a first contribution:

| Policy Idea | Description | Module Type |
|---|---|---|
| **VelocityLimitPolicy** | Rate-limit the number of transactions per time window (e.g., max 10 txs/hour) | Hook |
| **USDOracleBudgetPolicy** | Spending limits denominated in USD using a Chainlink price feed | Hook |
| **GasCapPolicy** | Cap the total gas the wallet can consume per time window | Hook |
| **MultiRoleSessionPolicy** | Define named roles (admin, trader, viewer) with different session permissions | Validator |
| **ChainRestrictedPolicy** | Restrict cross-chain bridging by blocking known bridge contract addresses | Hook |
| **FunctionSelectorPolicy** | Fine-grained per-function limits (e.g., max 5 `swap()` calls per hour) | Hook |

To contribute a new policy:

1. Write the Solidity hook in `packages/contracts/src/modules/`
2. Add Foundry tests in `packages/contracts/test/`
3. Create the TypeScript plugin in `packages/sdk/src/plugins/`
4. Register it in `packages/sdk/src/plugins/index.ts`
5. Add tests in `packages/sdk/src/__tests__/plugins.test.ts`
6. Update documentation in `apps/docs/`

See [Contributing](CONTRIBUTING.md) and the [Custom Policies Guide](apps/docs/guides/custom-policies.md) for details.

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

We welcome contributions, especially new policy plugins. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

Good starting points:
- Pick a policy from the [Wanted Policies](#wanted-policies-good-first-contributions) list above
- Run the [Policy Playground](#policy-playground) to understand the plugin architecture
- Read the [Custom Policies Guide](apps/docs/guides/custom-policies.md) for the full walkthrough

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)
