# DeFi Trading Agent

A LangChain + LangGraph ReAct agent powered by GPT-4o that autonomously trades within policy guardrails.

## What It Demonstrates

- LangChain + LangGraph ReAct agent with GPT-4o
- Policy-governed autonomous trading within spending limits
- Session keys for scoped agent access
- All 5 LangChain tools in action

## Architecture

```
GPT-4o (LLM)
    |
LangGraph ReAct Agent
    |
SmartAgentKit LangChain Tools
    |
SmartAgentKit SDK --> Bundler --> On-Chain
```

The agent uses a reasoning loop: it checks balances, evaluates spending limits, decides on trades, and executes transactions -- all through the SmartAgentKit LangChain tools.

## Quick Start

```bash
cd apps/examples/defi-trading-agent

# Mock mode (no API keys needed)
pnpm start:mock

# Testnet mode
cp .env.example .env
# Fill in the required variables (see below)
pnpm start
```

## Configuration

| Variable | Description | Required |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key | Testnet only |
| `RPC_URL` | Base Sepolia RPC | Testnet only |
| `BUNDLER_URL` | Pimlico bundler URL | Testnet only |
| `OWNER_PRIVATE_KEY` | Wallet owner key | Testnet only |

## Preset: `defi-trader`

This example uses the `defi-trader` preset, which configures:

- **Spending limit**: 1 ETH per day (rolling window)
- **Allowlist**: Configured DEX contract addresses only
- **Emergency pause**: 24-hour auto-unpause, guardian = owner

## Key Code Highlights

### Tool Creation

The example uses `createSmartAgentKitTools()` to generate LangChain-compatible tools:

```typescript
import { createSmartAgentKitTools } from "@smartagentkit/langchain";

const tools = createSmartAgentKitTools(client, walletAddress, sessionKey);
```

### Agent Behavior

The ReAct agent reasons about:

1. Current wallet balance and spending limits
2. Whether a trade is within policy bounds
3. Transaction execution and result verification

### Session Keys

Session keys provide time-limited access for the agent, scoped to specific contracts and function selectors. The owner creates a session, and the agent uses the session key for all operations.

## Source Code

See `apps/examples/defi-trading-agent/` in the repository.
