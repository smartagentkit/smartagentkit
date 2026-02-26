# Arbitrage Agent

A DEX arbitrage bot that uses session keys for time-scoped access, atomic batch execution for simultaneous buy+sell, and policy-governed spending limits. No LLM — algorithmic trading loop.

## Architecture

```
MockPriceFeed / Real Oracle
 |
 v
Strategy Engine
 |--- detectOpportunity() --> Filter by min spread (50 bps)
 |--- computeTradeSize()  --> Scale by spread magnitude
 |
 v
ArbitrageExecutor
 |--- buildSwapCalls()    --> Atomic buy+sell pair
 |--- executeArbitrage()  --> executeBatch() via SmartAgentKit
 |
 v
SmartAgentKit SDK Client (with session key)
 |
 v
On-chain Policies:
 |--- SpendingLimitHook (1 ETH/day)
 |--- AllowlistHook (only DEX routers + swap selectors)
 |--- EmergencyPauseHook (1-day auto-unpause)
 |
 v
Safe Smart Account
```

## What it Demonstrates

- **Session keys** — Time-scoped access (1 hour) limited to swap function selectors
- **`executeBatch()`** — Atomic buy+sell pairs (both succeed or both revert)
- **DEX-specific allowlist** — Only approved router addresses and swap selectors
- **Spending limit tracking** — Bot stops when daily limit is reached
- **Session lifecycle** — Create session -> trade -> revoke session on exit
- **No LLM required** — Deterministic algorithmic strategy

## Prerequisites

**Mock mode (no prerequisites):**
```bash
pnpm start:mock
```

**Testnet mode:**
1. Node.js 18+
2. Deployed SmartAgentKit contracts on Base Sepolia
3. A funded wallet on Base Sepolia
4. A Pimlico API key

## Quick Start

### Mock Mode (Recommended first)

```bash
pnpm install
pnpm start:mock
```

Generates 20 synthetic price ticks with 3 profitable opportunities. Shows the full lifecycle: session creation, price monitoring, 3 trades, limit tracking, and session revocation.

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
| `DEX_A_ROUTER` | First DEX router address | Testnet only |
| `DEX_B_ROUTER` | Second DEX router address | Testnet only |
| `MIN_SPREAD_BPS` | Minimum spread to trade (default: 50 bps) | No |
| `MAX_TRADE_SIZE_ETH` | Maximum trade size in ETH (default: 0.5) | No |
| `POLL_INTERVAL_MS` | Price check interval in ms (default: 5000) | No |

## How it Works

1. Creates a wallet with DEX-specific allowlist (only approved router addresses + swap selectors)
2. Creates a time-scoped session key (1 hour) limited to swap functions
3. Enters fast polling loop:
   - Check if wallet is paused (skip if yes)
   - Check remaining daily allowance (stop if limit reached)
   - Fetch prices from both DEXes
   - If profitable opportunity (>50 bps spread), execute atomic batch: buy on DEX A + sell on DEX B
4. On exit: revokes session key

## Security Considerations

- Session keys auto-expire after 1 hour — no permanent access
- Daily spending limit (1 ETH) caps maximum exposure
- Allowlist restricts interactions to known DEX router contracts only
- Atomic execution ensures no partial fills (buy without sell)
- Emergency pause provides an instant kill switch
- On exit, session keys are explicitly revoked
- Never commit `.env` files with real private keys
