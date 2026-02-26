# Monitoring Alert Agent

A guardian watchdog that monitors smart wallets, detects anomalous spending patterns, and auto-pauses wallets when critical thresholds are breached. No LLM — deterministic rule evaluation.

## Architecture

```
Alert Rules Engine
 |--- low-balance       --> WARNING if ETH < threshold
 |--- high-spending-rate --> CRITICAL + auto-pause if > 80% of limit used
 |--- unexpected-sessions --> WARNING if session count > expected
 |
 v
WalletMonitor (poll loop)
 |
 v
SmartAgentKit SDK Client
 |--- connectWallet()       --> Attach to existing wallets
 |--- getBalances()         --> Check ETH balance
 |--- getRemainingAllowance() --> Check spending velocity
 |--- isPaused()            --> Check pause status
 |--- getActiveSessions()   --> Count active sessions
 |--- pause()               --> Auto-pause on critical alert
 |
 v
On-chain State --> Safe Smart Accounts
```

## What it Demonstrates

- **Guardian pattern** — Separate monitoring agent protects wallets created by other agents
- **`connectWallet()`** — Monitors wallets without creating them
- **Auto-pause** — Automatically pauses wallets when spending exceeds 80% of limits
- **Configurable alert rules** — Extensible rule engine for custom monitoring
- **No LLM required** — Deterministic, reliable monitoring

## Prerequisites

**Mock mode (no prerequisites):**
```bash
pnpm start:mock
```

**Testnet mode:**
1. Node.js 18+
2. Deployed SmartAgentKit contracts on Base Sepolia
3. Existing wallets to monitor
4. Guardian private key (must be configured as guardian on monitored wallets)

## Quick Start

### Mock Mode (Recommended first)

```bash
pnpm install
pnpm start:mock
```

Creates two mock wallets, simulates spending over 5 cycles, and shows the monitor detecting anomalous spending and triggering an auto-pause.

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
| `SPENDING_LIMIT_HOOK` | Deployed SpendingLimitHook address | Testnet only |
| `ALLOWLIST_HOOK` | Deployed AllowlistHook address | Testnet only |
| `EMERGENCY_PAUSE_HOOK` | Deployed EmergencyPauseHook address | Testnet only |
| `GUARDIAN_PRIVATE_KEY` | Guardian's private key for auto-pause | Testnet only |
| `MONITORED_WALLETS` | Comma-separated wallet addresses | Testnet only |
| `LOW_BALANCE_THRESHOLD` | ETH balance warning threshold (default: 0.1) | No |
| `SPENDING_RATE_THRESHOLD` | Spending rate trigger (default: 0.8 = 80%) | No |
| `MAX_EXPECTED_SESSIONS` | Session count warning threshold (default: 2) | No |
| `POLL_INTERVAL` | Seconds between monitoring cycles (default: 30) | No |

## How it Works

1. Connects to one or more existing wallets (doesn't create them)
2. Every N seconds, takes a snapshot of each wallet: balances, remaining allowances, pause status, active sessions
3. Evaluates configurable alert rules against each snapshot
4. If `high-spending-rate` rule triggers (>80% of limit used), auto-pauses the wallet
5. Logs all alerts with severity levels and timestamps

## Alert Rules

| Rule | Severity | Trigger | Action |
|---|---|---|---|
| `low-balance` | Warning | ETH balance below threshold | Log alert |
| `high-spending-rate` | Critical | >80% of spending limit consumed | Auto-pause wallet |
| `unexpected-sessions` | Warning | Session count exceeds expected | Log alert |

## Security Considerations

- Guardian key must be stored securely (never in version control)
- Auto-pause is a safety mechanism — ensure the guardian address matches the wallet's configured guardian
- Monitor should run in a trusted environment (not on the same machine as the trading bot)
- Consider rate-limiting alerts in production to avoid notification fatigue
