# MockSmartAgentKitClient

The `@smartagentkit/testing` package provides an in-memory mock of the full SDK client for testing without RPC, bundler, or deployed contracts.

## Constructor

```typescript
new MockSmartAgentKitClient(options?: MockClientOptions)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `verbose` | `boolean` | `false` | Log all operations to console |
| `initialBalance` | `bigint` | `10n * 10n**18n` | Starting ETH balance (10 ETH) |
| `tokenBalances` | `Record<string, bigint>` | `{}` | Starting token balances keyed by address |

```typescript
import { MockSmartAgentKitClient } from "@smartagentkit/testing";

const mockClient = new MockSmartAgentKitClient({
  verbose: true,
  initialBalance: parseEther("100"),
  tokenBalances: {
    "0xUSDC...": 1_000_000n * 10n ** 6n, // 1M USDC
  },
});
```

## ISmartAgentKitClient Methods

`MockSmartAgentKitClient` implements all methods from the `ISmartAgentKitClient` interface. See [SmartAgentKitClient](/api/sdk/client) for full method signatures.

### Key Differences from the Real Client

| Behavior | Real Client | Mock Client |
|---|---|---|
| RPC connection | Required | Not needed |
| Bundler | Required | Not needed |
| Deployed contracts | Required | Not needed |
| Policy enforcement | On-chain hooks | In-memory simulation |
| Transaction hashes | Real on-chain hashes | Deterministic mock values |
| Session storage | In-memory (same) | In-memory (same) |
| Balances | Read from chain | Tracked in-memory |

### Supported Features

- Wallet creation with all presets (`defi-trader`, `treasury-agent`, `payment-agent`, `minimal`)
- `execute()` and `executeBatch()` with in-memory policy checks
- Spending limit enforcement with rolling windows
- Allowlist/blocklist enforcement
- Pause/unpause state tracking
- Session creation, listing, and revocation
- Balance tracking (ETH and ERC-20 tokens)

## Mock-Specific Methods

### `getLog`

```typescript
getLog(): MockLogEntry[]
```

Returns the full operation log. Useful for asserting that specific operations occurred during a test.

```typescript
interface MockLogEntry {
  operation: string;
  timestamp: number;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
}
```

```typescript
const log = mockClient.getLog();
const executions = log.filter((e) => e.operation === "execute");
expect(executions).toHaveLength(3);
```

### `setState`

```typescript
setState(walletAddress: Address, updates: Partial<MockWalletState>): void
```

Override wallet state for test setup. Useful for setting up specific scenarios without executing transactions.

```typescript
interface MockWalletState {
  paused: boolean;
  ethBalance: bigint;
  tokenBalances: Record<string, bigint>;
  // ... other internal state
}
```

```typescript
// Set up a paused wallet for testing
mockClient.setState(wallet.address, { paused: true });

// Set up a wallet with low balance
mockClient.setState(wallet.address, {
  ethBalance: parseEther("0.001"),
});
```

### `getWalletState`

```typescript
getWalletState(walletAddress: Address): MockWalletState
```

Read the current mock wallet state. Useful for asserting state changes after operations.

```typescript
const state = mockClient.getWalletState(wallet.address);
expect(state.ethBalance).toBeLessThan(parseEther("10"));
expect(state.paused).toBe(false);
```

## Example: Unit Testing with Vitest

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { MockSmartAgentKitClient } from "@smartagentkit/testing";
import { parseEther } from "viem";

describe("My Agent", () => {
  let client: MockSmartAgentKitClient;
  let wallet: AgentWallet;

  beforeEach(async () => {
    client = new MockSmartAgentKitClient({
      initialBalance: parseEther("10"),
    });
    wallet = await client.createWallet({
      owner: "0x1234...",
      preset: "defi-trader",
    });
  });

  it("should respect spending limits", async () => {
    // This should succeed (within 1 ETH daily limit)
    await client.execute(wallet, {
      target: "0xDex...",
      value: parseEther("0.5"),
    });

    // This should fail (would exceed 1 ETH daily limit)
    await expect(
      client.execute(wallet, {
        target: "0xDex...",
        value: parseEther("0.8"),
      })
    ).rejects.toThrow("Spending limit exceeded");
  });

  it("should block when paused", async () => {
    await client.pause(wallet.address, "0xOwnerKey...");

    await expect(
      client.execute(wallet, {
        target: "0x...",
        value: parseEther("0.01"),
      })
    ).rejects.toThrow("paused");
  });
});
```
