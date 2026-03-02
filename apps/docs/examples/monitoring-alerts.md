# Monitoring & Alerts Agent

A guardian-pattern monitoring agent that watches wallet activity and automatically pauses the wallet when anomalous spending is detected.

## What It Demonstrates

- Guardian pattern -- monitoring a wallet without owning it
- Automatic pause on anomalous spending
- Configurable alert rules engine
- `connectWallet()` for connecting to existing wallets

## Quick Start

```bash
cd apps/examples/monitoring-alert-agent

# Mock mode (no API keys needed)
pnpm start:mock

# Testnet mode
cp .env.example .env
# Fill in: RPC_URL, BUNDLER_URL, GUARDIAN_PRIVATE_KEY, WALLET_ADDRESS
pnpm start
```

## Configuration

| Variable | Description | Required |
|---|---|---|
| `RPC_URL` | Base Sepolia RPC | Testnet only |
| `BUNDLER_URL` | Pimlico bundler URL | Testnet only |
| `GUARDIAN_PRIVATE_KEY` | Guardian key (not the owner key) | Testnet only |
| `WALLET_ADDRESS` | Address of the wallet to monitor | Testnet only |

## Architecture

```
Monitoring Agent (guardian key)
    |
connectWallet() -- read-only observation
    |
Alert Rules Engine
  |-- Low balance (< threshold)
  |-- High spending rate (> 80% of limit)
  |-- Unexpected sessions
    |
Auto-pause on critical alerts
```

## Key Features

### Alert Rules

The agent runs three configurable alert rules:

1. **Low balance**: Triggers when the wallet balance drops below a configurable threshold
2. **High spending rate**: Triggers when spending exceeds 80% of the configured limit within the time window
3. **Unexpected sessions**: Triggers when new session keys appear that were not created by the monitoring agent

### Guardian Key

The monitoring agent uses a separate guardian key, not the wallet owner key. This means:

- The guardian can pause the wallet instantly via a direct contract call
- The pause is not a UserOp, so it cannot be blocked by policies
- The guardian cannot execute transactions or modify policies

### Auto-Pause

When a critical alert fires (e.g., spending exceeds 80% of the limit), the agent automatically pauses the wallet:

```typescript
await client.pause(walletAddress, guardianKey);
```

### Connect to Existing Wallets

Uses `connectWallet()` instead of `createWallet()` to observe an already-deployed wallet:

```typescript
const wallet = await client.connectWallet({
  address: walletAddress,
});
```

## Source Code

See `apps/examples/monitoring-alert-agent/` in the repository.
