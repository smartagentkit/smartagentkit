# Arbitrage Agent

A deterministic arbitrage bot that uses session keys with short expiry and atomic buy+sell execution to capture cross-DEX price differences.

## What It Demonstrates

- Session keys with 1-hour expiry
- Atomic buy+sell pairs via `executeBatch()`
- DEX-specific allowlist (router addresses + swap selectors)
- Deterministic trading strategy with price monitoring

## Quick Start

```bash
cd apps/examples/arbitrage-agent

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

## Key Features

### Session Keys with Short Expiry

The agent creates session keys that expire after 1 hour, scoped to swap function selectors only:

```typescript
const session = await client.createSession(wallet, {
  actions: [
    { target: dexRouterA, selector: "0x38ed1739" }, // swapExactTokensForTokens
    { target: dexRouterB, selector: "0x38ed1739" },
  ],
  expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour
}, ownerKey);
```

### MockPriceFeed

The example includes a `MockPriceFeed` that simulates cross-DEX price differences, allowing you to test arbitrage logic without real market data.

### Atomic Execution

Buy and sell operations execute together via `executeBatch()`, ensuring both legs of the trade happen atomically:

```typescript
await client.executeBatch(wallet, {
  calls: [
    { target: dexA, data: buyCalldata },
    { target: dexB, data: sellCalldata },
  ],
  sessionKey: session.privateKey,
});
```

If either leg fails, the entire transaction reverts -- preventing partial fills.

### DEX Allowlist

The `defi-trader` preset restricts the wallet to interacting with specific DEX router addresses and function selectors only. This prevents the session key from being used to call arbitrary contracts.

### Spending Limits

The spending limit caps the maximum position size per trade, providing an additional safety layer beyond the allowlist.

## Source Code

See `apps/examples/arbitrage-agent/` in the repository.
