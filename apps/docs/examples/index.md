# Examples

SmartAgentKit ships with five runnable example projects that demonstrate different architectures, from LLM-powered autonomous agents to deterministic automation bots.

## Overview

| Example | LLM | Preset | Key Feature | Complexity |
|---|---|---|---|---|
| [DeFi Trading Agent](/examples/defi-trading-agent) | GPT-4o (LangChain) | `defi-trader` | ReAct agent, session keys | Advanced |
| [Treasury Management](/examples/treasury-management) | Claude (Anthropic) | `treasury-agent` | Batch rebalancing | Advanced |
| [Payment Distribution](/examples/payment-distribution) | None | `payment-agent` | Scheduled payouts, allowlist | Intermediate |
| [Monitoring & Alerts](/examples/monitoring-alerts) | None | `minimal` | Guardian pattern, auto-pause | Intermediate |
| [Arbitrage Agent](/examples/arbitrage-agent) | None | `defi-trader` | Session keys, atomic swaps | Advanced |
| [Policy Playground](/examples/policy-playground) | None | Custom | Plugin architecture, custom policies | Beginner |

## Mock Mode

All examples support mock mode for testing without deploying or funding wallets. Mock mode uses `MockSmartAgentKitClient` from `@smartagentkit/testing`, which enforces the same policies in-memory.

```bash
# Run any example in mock mode
pnpm start:mock
```

## Getting Started

```bash
# Clone the repo
git clone https://github.com/smartagentkit/smartagentkit.git
cd smartagentkit

# Install and build
pnpm install && pnpm build

# Run any example in mock mode
cd apps/examples/defi-trading-agent
pnpm start:mock
```

## Testnet Mode

To run examples against a real testnet (Base Sepolia), you need:

1. An RPC URL (e.g., from Alchemy or Infura)
2. A Pimlico bundler URL
3. An owner private key with testnet ETH
4. Any LLM API keys required by the specific example

Copy `.env.example` to `.env` in the example directory and fill in the required values.
