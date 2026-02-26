# SmartAgentKit

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/smartagentkit/smartagentkit/ci.yml?branch=main&label=CI)](https://github.com/smartagentkit/smartagentkit/actions)
[![npm: @smartagentkit/sdk](https://img.shields.io/npm/v/@smartagentkit/sdk?label=sdk)](https://www.npmjs.com/package/@smartagentkit/sdk)
[![npm: @smartagentkit/langchain](https://img.shields.io/npm/v/@smartagentkit/langchain?label=langchain)](https://www.npmjs.com/package/@smartagentkit/langchain)

Open-source SDK and smart contract toolkit for deploying **policy-governed smart wallets** for AI agents on EVM chains.

Give your AI agents the ability to transact on-chain — within boundaries you define.

## The Problem

AI agents need wallets. But giving an agent unrestricted access to a wallet is a security nightmare. One hallucinated transaction could drain funds.

## The Solution

SmartAgentKit deploys ERC-4337 smart accounts (Safe + ERC-7579 modules) with built-in policy enforcement:

- **Spending Limits** — Per-token caps over rolling time windows
- **Allowlist/Blocklist** — Restrict which contracts and functions the agent can call
- **Emergency Pause** — Circuit breaker to freeze all agent activity instantly
- **Session Keys** — Scoped, time-limited keys for agents (via Smart Sessions)

Policies are enforced at the smart contract level. Even if the agent is compromised, the policies hold.

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
│  │  └─ EmergencyPauseHook              │         │
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

### Check Remaining Allowance

```typescript
const remaining = await client.getRemainingAllowance(
  wallet.address,
  "0x0000000000000000000000000000000000000000", // Native ETH
);
console.log(`Remaining: ${formatEther(remaining)} ETH`);
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

## Presets

Pre-configured policy bundles for common use cases:

| Preset | Spending | Allowlist | Pause | Use Case |
|--------|----------|-----------|-------|----------|
| `defi-trader` | 1 ETH/day | DEX allowlist (pass `allowedDexes`) | Guardian = owner, 24h auto-unpause | Trading agents |
| `treasury-agent` | 5 ETH/week | None | Guardian = owner, manual unpause | Treasury ops |
| `payment-agent` | 0.1 ETH/day | Recipients allowlist (pass `approvedRecipients`) | Guardian = owner, 1h auto-unpause | Payments |
| `minimal` | None | None | Guardian = owner, manual unpause | Testing |

All presets default guardian to the owner address. Override with `presetParams: { guardian: "0x..." }`.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@smartagentkit/sdk`](packages/sdk) | Core TypeScript SDK | [![npm](https://img.shields.io/npm/v/@smartagentkit/sdk)](https://www.npmjs.com/package/@smartagentkit/sdk) |
| [`smartagentkit`](packages/cli) | CLI tool (`sak` alias) | [![npm](https://img.shields.io/npm/v/smartagentkit)](https://www.npmjs.com/package/smartagentkit) |
| [`@smartagentkit/langchain`](packages/integrations/langchain) | LangChain integration | [![npm](https://img.shields.io/npm/v/@smartagentkit/langchain)](https://www.npmjs.com/package/@smartagentkit/langchain) |
| [`packages/contracts`](packages/contracts) | Solidity modules (Foundry) | — |

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
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── SpendingLimitHook.sol
│   │   │   │   ├── AllowlistHook.sol
│   │   │   │   ├── EmergencyPauseHook.sol
│   │   │   │   └── AutomationExecutor.sol
│   │   │   └── factory/     # (reserved for future use)
│   │   ├── script/          # Deploy scripts
│   │   └── test/
│   ├── sdk/                 # @smartagentkit/sdk
│   ├── cli/                 # smartagentkit CLI
│   └── integrations/
│       └── langchain/       # @smartagentkit/langchain
├── apps/
│   └── examples/
│       └── defi-trading-agent/  # LangChain agent example
└── .github/workflows/       # CI/CD
```

## Key Technologies

- **[ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)** — Account Abstraction
- **[ERC-7579](https://eips.ethereum.org/EIPS/eip-7579)** — Modular Smart Accounts
- **[Safe](https://safe.global/)** — Smart account base (via Safe7579 adapter)
- **[Rhinestone ModuleKit](https://docs.rhinestone.wtf/)** — Module development framework
- **[HookMultiPlexer](https://github.com/rhinestonewtf/core-modules)** — Multi-hook routing
- **[permissionless.js](https://docs.pimlico.io/permissionless)** — ERC-4337 SDK
- **[Smart Sessions](https://github.com/erc7579/smartsessions)** — Session key management

## Security

- All policy modules are ERC-7579 hooks enforced at the smart contract level
- Modules use Rhinestone ModuleKit audited base classes
- HookMultiPlexer routes through all installed hooks — policies cannot be bypassed
- Emergency pause provides an instant circuit breaker
- Owner retains full override control at all times

## Examples

See [`apps/examples/`](apps/examples) for complete working examples:

- **[DeFi Trading Agent](apps/examples/defi-trading-agent)** — Autonomous trading agent using LangChain + LangGraph within policy guardrails

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)
