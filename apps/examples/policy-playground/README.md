# Policy Playground

Demonstrates the SmartAgentKit plugin architecture for custom policy hooks.

## What This Shows

1. **Custom Plugin Definition** (`src/custom-plugin.ts`) — A `TargetBlockerPlugin` that blocks calls to a specific address
2. **Plugin Registry** — Register, query, and resolve addresses for plugins
3. **Config Validation** — Runtime type checking before on-chain transactions
4. **Init Data Encoding** — Producing the `onInstall` calldata for your Solidity contract
5. **Address Resolution** — Default addresses, overrides, and per-chain configuration
6. **Mock Wallet Demo** — Creating wallets with policies using the mock client

## Quick Start

```bash
# Run in mock mode (no RPC needed)
pnpm start:mock

# Run against live chain (requires .env)
cp .env.example .env
# Edit .env with your keys
pnpm start
```

## Files

| File | Description |
|---|---|
| `src/custom-plugin.ts` | Example `PolicyPlugin` implementation |
| `src/playground.ts` | Main demo script |
| `.env.example` | Environment variables template |

## Learn More

- [Custom Policies Guide](https://smartagentkit.github.io/smartagentkit/guides/custom-policies)
- [Policy Configuration Guide](https://smartagentkit.github.io/smartagentkit/guides/policy-configuration)
- [Policies API Reference](https://smartagentkit.github.io/smartagentkit/api/sdk/policies)
