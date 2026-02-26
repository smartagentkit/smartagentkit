# DeFi Trading Agent Example

An AI agent that autonomously manages a DeFi trading wallet using SmartAgentKit and LangChain.

## Architecture

```
User
 |
 v
LangGraph ReAct Agent (GPT-4o)
 |
 v
LangChain Tools (check_balance, send_tx, check_allowance, ...)
 |
 v
SmartAgentKit SDK Client
 |
 v
ERC-4337 UserOps --> Bundler --> On-chain Policies --> Safe Smart Account
```

## What it Demonstrates

- **LangChain integration** — AI agent with SmartAgentKit tools
- **`defi-trader` preset** — Pre-configured spending limits + emergency pause
- **Session keys** — Scoped access for the agent via Smart Sessions
- **Policy enforcement** — On-chain spending limits and pause checks

## Prerequisites

**Mock mode (no prerequisites):**
```bash
pnpm start:mock
```

**Testnet mode:**
1. Node.js 18+
2. Deployed SmartAgentKit contracts on Base Sepolia (run `forge script Deploy.s.sol`)
3. A funded wallet on Base Sepolia (for gas)
4. An OpenAI API key (for the LLM)
5. A Pimlico API key (for the bundler)

## Quick Start

### Mock Mode (Recommended first)

```bash
pnpm install
pnpm start:mock
```

No API keys, no funded wallets, no deployed contracts. The mock client simulates the entire SDK in-memory.

### Testnet Mode

```bash
cp .env.example .env
# Edit .env with your values
pnpm start
```

## Configuration

| Variable | Description | Required |
|---|---|---|
| `RPC_URL` | Base Sepolia RPC (Alchemy, Infura, etc.) | Testnet only |
| `BUNDLER_URL` | Pimlico bundler URL | Testnet only |
| `OWNER_ADDRESS` | Wallet owner address | Testnet only |
| `OWNER_PRIVATE_KEY` | Wallet owner private key | Testnet only |
| `SPENDING_LIMIT_HOOK` | Deployed SpendingLimitHook address | Testnet only |
| `ALLOWLIST_HOOK` | Deployed AllowlistHook address | Testnet only |
| `EMERGENCY_PAUSE_HOOK` | Deployed EmergencyPauseHook address | Testnet only |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o | Testnet only |

## How it Works

1. Creates a SmartAgentKit client (or mock client in `--mock` mode)
2. Deploys a smart wallet with `defi-trader` preset (spending limits + emergency pause)
3. Creates a session key scoped to ERC-20 transfer calls
4. Sets up LangChain tools backed by the SDK client
5. Runs a ReAct agent that checks balances, allowances, and wallet status
6. In mock mode, runs a scripted demo calling the same tools directly

## Security Considerations

- Never commit `.env` files with real private keys
- Session keys are time-scoped (24h) and function-scoped
- On-chain spending limits enforce maximum daily spend
- Emergency pause allows the owner to freeze the wallet instantly
