# Policy Configuration

SmartAgentKit provides three policy hooks that enforce rules at the smart contract level:

- **SpendingLimitHook** — Per-token spending caps with rolling time windows
- **AllowlistHook** — Restrict which contracts and functions the wallet can call
- **EmergencyPauseHook** — Circuit breaker to halt all wallet activity

All hooks route through the **HookMultiPlexer**, which is the single hook installed on the ERC-7579 account. This is a hard architectural requirement because ERC-7579 only supports one hook per account.

## Spending Limits

The SpendingLimitHook enforces per-token spending caps over rolling time windows.

```typescript
{
  type: "spending-limit",
  limits: [
    { token: NATIVE_TOKEN, limit: parseEther("1"), window: WINDOW_1_DAY },
    { token: "0xUSDC...", limit: 1000_000000n, window: WINDOW_1_HOUR },
  ],
}
```

### Parameters

- **`token`** — Token address. Use `0x0000000000000000000000000000000000000000` (or the `NATIVE_TOKEN` constant) for native ETH.
- **`limit`** — Maximum amount in the smallest unit (wei for ETH, 6 decimals for USDC, etc.).
- **`window`** — Rolling time window in seconds. Minimum: 60 seconds.

### Time Window Constants

| Constant | Value |
|---|---|
| `WINDOW_1_HOUR` | 3600 |
| `WINDOW_1_DAY` | 86400 |
| `WINDOW_1_WEEK` | 604800 |

### What Is Tracked

- Native ETH transfers (`msg.value`)
- ERC-20 `transfer()` calls
- ERC-20 `approve()` calls
- ERC-20 `transferFrom()` calls

### What Is NOT Tracked

- Token wrapping/unwrapping
- Flash loans
- Delegate calls

## Allowlist / Blocklist

The AllowlistHook restricts which contracts and functions the wallet can interact with.

### Allowlist Mode

Only the specified targets are permitted. All other calls revert.

```typescript
{
  type: "allowlist",
  mode: "allow",
  targets: [
    { address: "0xRouter", selector: "0x38ed1739" }, // Specific function
    { address: "0xPool" },                            // All functions (wildcard)
  ],
  protectedAddresses: ["0xModuleAddr1", "0xModuleAddr2"], // Max 20
}
```

### Blocklist Mode

Everything is permitted except the specified targets.

```typescript
{
  type: "allowlist",
  mode: "block",
  targets: [
    { address: "0xMaliciousContract" },
  ],
}
```

### Important Notes

- Omitting `selector` means ALL functions on that address are allowed/blocked (wildcard).
- The wildcard selector internally is `0x431e2cf5`, not `0x00000000`.
- **`protectedAddresses`** cannot be called even in blocklist mode. Maximum 20 protected addresses.
- Maximum **100 target permissions** per account.

## Emergency Pause

The EmergencyPauseHook is a circuit breaker. When triggered, all UserOps from the wallet revert.

```typescript
{
  type: "emergency-pause",
  guardian: "0xGuardianAddress",
  autoUnpauseAfter: 3600, // Seconds. 0 = manual only
}
```

### Guardian Actions

Guardian actions are direct contract calls, not UserOps:

```typescript
// Pause the wallet
await client.pause(wallet.address, guardianPrivateKey);

// Unpause the wallet
await client.unpause(wallet.address, guardianPrivateKey);

// Check pause status
const paused = await client.isPaused(wallet.address);
```

### Constraints

- **Pause cooldown:** 1 hour between pauses (anti-griefing protection).
- **Max auto-unpause:** 365 days.
- **Effect:** When paused, ALL UserOps from the wallet revert.

## Combining Policies

Best practice is to use all three policies together for defense in depth:

```typescript
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  policies: [
    { type: "spending-limit", limits: [...] },
    { type: "allowlist", mode: "allow", targets: [...] },
    { type: "emergency-pause", guardian: "0x...", autoUnpauseAfter: 3600 },
  ],
});
```

This gives you:
- **Spending limits** cap the financial exposure per time window.
- **Allowlist** restricts the attack surface to known-good contracts.
- **Emergency pause** provides a manual kill switch if something goes wrong.

## Automation Executor

For scheduled or automated tasks, use the AutomationExecutor module:

```typescript
{
  type: "automation",
  tasks: [{
    id: "daily-rebalance",
    caller: "0xAutomationBot",
    target: "0xDeFiProtocol",
    calldata: "0x...",
    cooldown: 86400,      // Once per day
    maxExecutions: 30,    // Max 30 times total
  }],
}
```

Each task defines:
- **`id`** — Unique identifier for the task.
- **`caller`** — Address authorized to trigger the task.
- **`target`** — Contract to call.
- **`calldata`** — Encoded function call.
- **`cooldown`** — Minimum seconds between executions.
- **`maxExecutions`** — Total number of allowed executions (0 = unlimited).

## Custom Policies

SmartAgentKit supports custom policy plugins. You can write your own Solidity hook, define a plugin object, and register it with the SDK. See the [Custom Policies Guide](/guides/custom-policies) for a full walkthrough.

```typescript
import { pluginRegistry } from "@smartagentkit/sdk";

pluginRegistry.register(myCustomPlugin);

const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  policies: [
    { type: "my-custom-hook", /* ... */ } as any,
  ],
});
```

## Using Your Own Deployments

If you've deployed hooks at custom addresses, pass them via `moduleAddresses`:

```typescript
const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: "...",
  bundlerUrl: "...",
  moduleAddresses: {
    spendingLimitHook: "0xMyAddress...",
    allowlistHook: "0xMyAddress...",
    emergencyPauseHook: "0xMyAddress...",
    customModules: {
      "my-custom-hook": "0xMyHookAddress...",
    },
  },
});
```

Or set defaults on the plugin registry:

```typescript
pluginRegistry.setDefaultAddress("my-custom-hook", 84532, "0xMyHookAddress...");
```

## Policy Encoding (Advanced)

For manual encoding of policy init data (useful for custom integrations):

```typescript
import {
  encodePolicyInitData,
  encodeSpendingLimitInitData,
} from "@smartagentkit/sdk";

const encoded = encodePolicyInitData(policy, moduleAddresses, trustedForwarder);
// Returns: { moduleAddress, moduleType, initData }
```

This is used internally by `createWallet` but is exported for advanced use cases where you need to construct module installation transactions manually.
