# Introduction

## The Problem

AI agents need wallets to interact with blockchains — but giving an LLM unrestricted access to a wallet is a security nightmare. One hallucinated transaction, one prompt injection, or one buggy tool call could drain the entire balance. Traditional EOA wallets offer no guardrails: if you have the private key, you can do anything.

## The Solution

SmartAgentKit deploys **ERC-4337 smart accounts** (Safe + ERC-7579 modules) with **policy enforcement at the smart contract level**. Your agent gets a wallet that physically cannot exceed its budget, call unapproved contracts, or operate outside its session window — because the on-chain hooks will revert any transaction that violates policy.

This is not application-level filtering. Policies are enforced by the blockchain itself.

## Key Features

- **Spending Limits** — Per-token caps over rolling time windows (e.g., 1 ETH per day)
- **Allowlist / Blocklist** — Control which contracts and function selectors your agent can call
- **Emergency Pause** — Circuit breaker to freeze all wallet activity instantly, with optional auto-unpause
- **Session Keys** — Scoped, time-limited key pairs via Smart Sessions (Rhinestone + Biconomy)
- **LangChain Integration** — Drop-in tools for AI agent frameworks
- **CLI** — Create wallets, manage policies, and monitor status from the command line
- **Mock Testing** — Full in-memory mock client for testing without deploying or funding wallets

## Supported Chains

| Chain | Status |
|---|---|
| Base Sepolia | Deployed |
| Sepolia | Deployed |
| Base | Deploy script available |
| Optimism | Deploy script available |
| Arbitrum | Deploy script available |
| Polygon | Deploy script available |
| Ethereum | Deploy script available |

Deploying to mainnet or other testnets requires running the deploy script from `packages/contracts/`.

## Package Ecosystem

| Package | npm | Description |
|---|---|---|
| `@smartagentkit/sdk` | `@smartagentkit/sdk` | Core TypeScript SDK |
| `smartagentkit` | `smartagentkit` | CLI tool (`sak` command) |
| `@smartagentkit/langchain` | `@smartagentkit/langchain` | LangChain integration |
| `@smartagentkit/testing` | `@smartagentkit/testing` | Mock client for testing |
| `packages/contracts` | -- | Solidity modules (Foundry) |

## Architecture

```
Your Application / AI Agent
        |
@smartagentkit/sdk or @smartagentkit/langchain
        |
ERC-4337 Bundler (Pimlico)
        |
On-Chain: Safe + ERC-7579 Adapter
  |-- HookMultiPlexer
  |   |-- SpendingLimitHook
  |   |-- AllowlistHook
  |   +-- EmergencyPauseHook
  +-- AutomationExecutor
```

The SDK builds ERC-4337 UserOperations and submits them through a bundler. The bundler sends them to the EntryPoint contract, which calls your Safe account. The Safe7579 adapter routes execution through the HookMultiPlexer, which runs every installed policy hook before and after each call. If any hook reverts, the entire UserOperation fails.

## Next Steps

- [Quickstart](/getting-started/quickstart) — Deploy your first agent wallet in 5 minutes
- [Installation](/getting-started/installation) — Detailed setup for all packages
- [Core Concepts](/getting-started/concepts) — Understand the architecture in depth
