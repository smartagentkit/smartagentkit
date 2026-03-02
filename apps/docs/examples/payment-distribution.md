# Payment Distribution Bot

A deterministic payment automation bot that distributes funds to allowlisted recipients on a schedule -- no LLM required.

## What It Demonstrates

- No LLM -- pure TypeScript automation
- Scheduled multi-recipient payouts
- Strict spending limits combined with allowlisted recipients
- `PayoutScheduler` pattern for deterministic automation

## Quick Start

```bash
cd apps/examples/payment-distribution-bot

# Mock mode (no API keys needed)
pnpm start:mock

# Testnet mode
cp .env.example .env
# Fill in: RPC_URL, BUNDLER_URL, OWNER_PRIVATE_KEY
pnpm start
```

## Configuration

| Variable | Description | Required |
|---|---|---|
| `RPC_URL` | Base Sepolia RPC | Testnet only |
| `BUNDLER_URL` | Pimlico bundler URL | Testnet only |
| `OWNER_PRIVATE_KEY` | Wallet owner key | Testnet only |

## Preset: `payment-agent`

This example uses the `payment-agent` preset, which configures:

- **Spending limit**: 0.1 ETH per day (rolling window)
- **Allowlist**: Only approved recipient addresses can receive funds
- **Emergency pause**: 1-hour auto-unpause

## Key Features

### PayoutScheduler

The `PayoutScheduler` manages a recipient list and payout timing. It determines when payouts are due and constructs the appropriate transactions:

```typescript
const scheduler = new PayoutScheduler({
  recipients: [
    { address: "0x...", amount: parseEther("0.01") },
    { address: "0x...", amount: parseEther("0.02") },
  ],
  interval: 86400, // daily
});
```

### Batch Execution

Multiple recipients are paid in a single `executeBatch()` call for gas efficiency:

```typescript
await client.executeBatch(wallet, {
  calls: scheduler.getPendingPayouts(),
});
```

### Allowlist Enforcement

The AllowlistHook ensures that funds can only be sent to pre-approved addresses. Any attempt to send to an unlisted address will cause the UserOp to revert on-chain.

## Source Code

See `apps/examples/payment-distribution-bot/` in the repository.
