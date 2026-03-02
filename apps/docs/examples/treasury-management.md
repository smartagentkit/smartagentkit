# Treasury Management Agent

An autonomous treasury agent powered by Claude (Anthropic) that performs atomic batch rebalancing within weekly spending limits.

## What It Demonstrates

- Claude (Anthropic) as LLM -- showing vendor diversity beyond OpenAI
- Atomic batch rebalancing with `executeBatch()`
- Weekly spending limits for treasury operations
- Portfolio allocation reasoning

## Quick Start

```bash
cd apps/examples/treasury-management-agent

# Mock mode (no API keys needed)
pnpm start:mock

# Testnet mode
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, RPC_URL, BUNDLER_URL, OWNER_PRIVATE_KEY
pnpm start
```

## Configuration

| Variable | Description | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key | Testnet only |
| `RPC_URL` | Base Sepolia RPC | Testnet only |
| `BUNDLER_URL` | Pimlico bundler URL | Testnet only |
| `OWNER_PRIVATE_KEY` | Wallet owner key | Testnet only |

## Preset: `treasury-agent`

This example uses the `treasury-agent` preset, which configures:

- **Spending limit**: 5 ETH per week (rolling window)
- **No allowlist**: Treasury operations need flexibility to interact with various protocols
- **Emergency pause**: Manual unpause only (no auto-unpause) for maximum security

## Key Features

### Batch Rebalancing

Uses `executeBatch()` for atomic multi-call rebalancing. All calls in a batch execute together or not at all, preventing partial portfolio states:

```typescript
await client.executeBatch(wallet, {
  calls: [
    { target: tokenA, data: sellCalldata },
    { target: tokenB, data: buyCalldata },
    { target: tokenC, data: buyCalldata },
  ],
});
```

### Budget Tracking

The agent tracks spending across the weekly window and reasons about remaining budget before executing trades.

### Claude Integration

Demonstrates that SmartAgentKit works with any LLM provider. Claude reasons about portfolio allocation, risk assessment, and rebalancing strategy before executing transactions.

## Source Code

See `apps/examples/treasury-management-agent/` in the repository.
