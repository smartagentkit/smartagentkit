# Testing

SmartAgentKit provides a dedicated testing package with a `MockSmartAgentKitClient` that enforces policies in-memory. This lets you write fast, deterministic tests without needing a blockchain, bundler, or any network connectivity.

## Install

```bash
npm install -D @smartagentkit/testing
```

## MockSmartAgentKitClient

```typescript
import { MockSmartAgentKitClient } from "@smartagentkit/testing";

const client = new MockSmartAgentKitClient({
  verbose: true,             // Log all operations to console
  initialBalance: parseEther("10"), // Start with 10 ETH
});
```

The mock client implements the same interface as `SmartAgentKitClient`, making it a drop-in replacement for testing.

## In-Memory Policy Enforcement

The mock client enforces all three policy types locally:

- **Spending limits** -- Tracks cumulative spending per token per window. Resets after the window expires.
- **Allowlist** -- Checks targets against the configured allow/block list before executing.
- **Pause** -- Blocks all executions when the wallet is paused.

```typescript
const wallet = await client.createWallet({
  owner: "0xYourAddress",
  preset: "defi-trader",
});

// This works -- within the 1 ETH/day limit
await client.execute(wallet, {
  target: "0xSomeAddress",
  value: parseEther("0.5"),
});

// This fails -- cumulative 1.1 ETH exceeds the 1 ETH/day limit
await client.execute(wallet, {
  target: "0xSomeAddress",
  value: parseEther("0.6"),
});
// Throws SpendingLimitExceededError
```

## Presets

The mock client supports the same presets as the real SDK:

```typescript
const wallet = await client.createWallet({
  owner: "0x...",
  preset: "defi-trader",       // or treasury-agent, payment-agent, minimal
  presetParams: { dailyEthLimit: parseEther("2") },
});
```

See the [Wallet Creation](/guides/wallet-creation#available-presets) guide for the full preset table.

## Mock-Specific Methods

The mock client exposes additional methods for test setup and assertions.

### `getLog()`

Returns a chronological log of all operations performed:

```typescript
const log = client.getLog();
// [
//   { operation: "createWallet", timestamp: ..., params: {...}, result: {...} },
//   { operation: "execute", timestamp: ..., params: {...}, result: {...} },
//   ...
// ]
```

### `setState()`

Directly set wallet state for test scenarios:

```typescript
client.setState(wallet.address, {
  paused: true,
  ethBalance: parseEther("5"),
});
```

### `getWalletState()`

Read the current wallet state:

```typescript
const state = client.getWalletState(wallet.address);
console.log(state.paused);     // true
console.log(state.ethBalance); // 5000000000000000000n
```

## Using with Vitest

```typescript
import { describe, it, expect } from "vitest";
import { MockSmartAgentKitClient } from "@smartagentkit/testing";
import { parseEther } from "viem";

describe("My Agent", () => {
  it("respects spending limits", async () => {
    const client = new MockSmartAgentKitClient();
    const wallet = await client.createWallet({
      owner: "0x1234567890abcdef1234567890abcdef12345678",
      preset: "defi-trader",
    });

    // Should succeed
    await client.execute(wallet, {
      target: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      value: parseEther("0.5"),
    });

    // Should fail -- exceeds 1 ETH/day limit
    await expect(
      client.execute(wallet, {
        target: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        value: parseEther("0.6"),
      }),
    ).rejects.toThrow("Spending limit exceeded");
  });
});
```

## Mock Flag Pattern

All SmartAgentKit examples support a `--mock` flag for running without network access:

```typescript
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { MockSmartAgentKitClient } from "@smartagentkit/testing";
import { baseSepolia } from "viem/chains";

const isMock = process.argv.includes("--mock");

const client = isMock
  ? new MockSmartAgentKitClient({ verbose: true })
  : new SmartAgentKitClient({
      chain: baseSepolia,
      rpcUrl: process.env.RPC_URL!,
      bundlerUrl: process.env.BUNDLER_URL!,
    });
```

This pattern lets you develop and test your agent logic locally, then switch to the real client for testnet or mainnet execution.

## Using with LangChain

The mock client works seamlessly with the LangChain integration:

```typescript
import { createSmartAgentKitTools } from "@smartagentkit/langchain";
import { MockSmartAgentKitClient } from "@smartagentkit/testing";

const client = new MockSmartAgentKitClient();
const wallet = await client.createWallet({ owner: "0x...", preset: "minimal" });
const tools = createSmartAgentKitTools(client, wallet.address);
// Tools work the same -- mock client is a drop-in replacement
```

This is particularly useful for testing LangChain agent flows without incurring gas costs or waiting for transaction confirmations.
