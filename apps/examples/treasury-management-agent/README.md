# Treasury Management Agent

A Claude-powered AI agent that manages a treasury wallet, reasons about portfolio allocation, and executes atomic batch rebalancing transactions.

## Architecture

```
User
 |
 v
LangGraph ReAct Agent (Claude Sonnet)
 |
 v
LangChain Tools (check_balance, send_batch_tx, check_allowance, ...)
 |
 v
SmartAgentKit SDK Client
 |
 v
ERC-4337 UserOps --> Bundler --> On-chain Policies --> Safe Smart Account
```

## What it Demonstrates

- **Claude (Anthropic) as LLM** — Vendor diversity vs. the OpenAI-based DeFi agent
- **`treasury-agent` preset** — Weekly spending limits + manual-only emergency pause
- **`executeBatch()`** — Atomic multi-call rebalancing (approve+swap)
- **Budget tracking** — Agent checks remaining weekly allowance before acting
- **Portfolio reasoning** — Claude analyzes allocation and proposes rebalancing

## Prerequisites

**Mock mode (no prerequisites):**
```bash
pnpm start:mock
```

**Testnet mode:**
1. Node.js 18+
2. Deployed SmartAgentKit contracts on Base Sepolia
3. A funded wallet on Base Sepolia
4. An Anthropic API key (for Claude)
5. A Pimlico API key (for the bundler)

## Quick Start

### Mock Mode (Recommended first)

```bash
pnpm install
pnpm start:mock
```

Runs a scripted treasury management demo: checks balances, analyzes allocation, executes atomic batch rebalance, reports remaining budget. No API keys needed.

### Testnet Mode

```bash
cp .env.example .env
# Edit .env with your values
pnpm start
```

## Configuration

| Variable | Description | Required |
|---|---|---|
| `RPC_URL` | Base Sepolia RPC endpoint | Testnet only |
| `BUNDLER_URL` | Pimlico bundler URL | Testnet only |
| `OWNER_ADDRESS` | Wallet owner address | Testnet only |
| `OWNER_PRIVATE_KEY` | Wallet owner private key | Testnet only |
| `SPENDING_LIMIT_HOOK` | Deployed SpendingLimitHook address | Testnet only |
| `ALLOWLIST_HOOK` | Deployed AllowlistHook address | Testnet only |
| `EMERGENCY_PAUSE_HOOK` | Deployed EmergencyPauseHook address | Testnet only |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | Testnet only |

## How it Works

1. Creates a wallet with `treasury-agent` preset (5 ETH/week spending limit, manual-only pause)
2. Claude reasons about the current portfolio allocation (target: 60% ETH, 40% stablecoins)
3. Checks current balances and remaining weekly allowance
4. If rebalancing is needed, executes batch transactions atomically
5. Reports on remaining budget and final portfolio state

## Security Considerations

- Weekly spending limit (5 ETH) prevents catastrophic treasury drain
- Manual-only emergency pause (no auto-unpause) — requires explicit guardian action
- Batch transactions are atomic — all succeed or all revert
- Claude's recommendations are advisory — policy enforcement happens on-chain
- Never commit `.env` files with real private keys or API keys
