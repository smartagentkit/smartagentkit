# Payment Distribution Bot

A scheduled payroll bot that distributes ETH to whitelisted recipients within policy-governed guardrails. No LLM required — pure TypeScript automation.

## Architecture

```
Config (.env)
 |
 v
PayoutScheduler (timer loop)
 |
 v
SmartAgentKit SDK Client
 |--- isPaused() --> Skip if paused
 |--- getRemainingAllowance() --> Check daily budget
 |--- executeBatch() --> Atomic payout to all eligible recipients
 |
 v
On-chain Policies --> Safe Smart Account
```

## What it Demonstrates

- **No LLM required** — SDK used directly from TypeScript, no LangChain
- **`payment-agent` preset** — Strict spending limits + allowlisted recipients
- **`executeBatch()`** — Atomic multi-recipient payouts
- **Allowlist enforcement** — Only whitelisted addresses can receive funds
- **Spending limit tracking** — Bot respects daily limits automatically
- **Emergency pause** — Owner can halt payouts at any time

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

Runs 3 payout cycles in-memory, showing spending limit enforcement on cycle 3.

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
| `RECIPIENTS` | Comma-separated recipient addresses | Testnet only |
| `AMOUNTS` | Comma-separated ETH amounts | Testnet only |
| `PAYOUT_INTERVAL` | Seconds between payout cycles (default: 86400) | Testnet only |

## How it Works

1. Creates a wallet with `payment-agent` preset (0.1 ETH/day limit, allowlisted recipients, 1h auto-unpause)
2. Builds a payroll schedule from `RECIPIENTS` and `AMOUNTS`
3. On each cycle:
   - Checks if the wallet is paused (skips if yes)
   - Checks remaining daily allowance
   - Determines which payouts fit within the budget
   - Executes an atomic batch payout to all eligible recipients
   - Reports results in a formatted table
4. If daily limit is reached, waits for the next window

## Security Considerations

- Only allowlisted addresses can receive payouts
- Daily spending limit prevents draining the wallet
- Emergency pause gives the owner a kill switch
- Auto-unpause (1 hour) ensures operations resume after temporary pauses
- Never commit `.env` files with real private keys
