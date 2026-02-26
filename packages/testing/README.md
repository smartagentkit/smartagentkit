# @smartagentkit/testing

Mock client for SmartAgentKit that simulates the full SDK API in-memory. Run examples and integration tests without funded wallets, deployed contracts, or network access.

## Install

```bash
npm install --save-dev @smartagentkit/testing
```

## Quick Start

```typescript
import { MockSmartAgentKitClient } from "@smartagentkit/testing";

const client = new MockSmartAgentKitClient({ preset: "defi-trader" });

const wallet = await client.createWallet({
  owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  ownerPrivateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  preset: "defi-trader",
});

// Spending limits, allowlist, and pause are all enforced in-memory
await client.execute(wallet, {
  target: "0x...",
  value: 1000000000000000n,
});
```

## Features

- **Full API parity** with `SmartAgentKitClient` via `ISmartAgentKitClient` interface
- **In-memory policy enforcement** - spending limits, allowlist, pause state
- **Preset support** - defi-trader, treasury-agent, payment-agent, minimal
- **Test helpers** - `getLog()`, `setState()`, `getWalletState()` for setup and assertions

## Documentation

See the [main repository](https://github.com/smartagentkit/smartagentkit) for full documentation and examples.

## License

MIT
