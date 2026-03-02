# Security Best Practices

## Use All Three Hooks

Always install SpendingLimitHook + AllowlistHook + EmergencyPauseHook together. Each covers a different attack vector:

- **SpendingLimitHook** limits how much the agent can spend
- **AllowlistHook** limits where the agent can send transactions
- **EmergencyPauseHook** provides a circuit breaker for emergencies

Using only one or two leaves gaps in your defense.

## Set Conservative Spending Limits

- Start with the **smallest limit** that works for your use case
- Use **shorter time windows** (hours, not weeks) for higher-risk agents
- Set **separate limits for each token** the agent needs access to
- Remember that limits are per-token -- an agent with access to many tokens can spend more in aggregate

```typescript
const wallet = await client.createWallet({
  owner: ownerAddress,
  policies: [
    {
      type: "spending-limit",
      params: {
        token: NATIVE_TOKEN,
        limit: parseEther("0.1"),  // Start small
        window: WINDOW_1_HOUR,     // Short window
      },
    },
  ],
});
```

## Prefer Allowlist Mode

Use `mode: "allow"` (whitelist) over `mode: "block"` (blacklist). It is safer to enumerate what IS allowed than to try to block everything that is not:

```typescript
{
  type: "allowlist",
  params: {
    mode: "allow",
    targets: [
      { address: dexRouter, selectors: ["0x38ed1739"] }, // Only swap function
    ],
  },
}
```

## Protect Module Addresses

Add all module addresses to `protectedAddresses` in the AllowlistHook. This prevents the agent from uninstalling its own policies:

```typescript
{
  type: "allowlist",
  params: {
    mode: "allow",
    targets: [...],
    protectedAddresses: [
      hookMultiplexerAddress,
      spendingLimitHookAddress,
      allowlistHookAddress,
      emergencyPauseHookAddress,
    ],
  },
}
```

## Monitor Spending Rates

Use the [Monitoring & Alerts](/examples/monitoring-alerts) pattern. Set up a separate guardian that watches spending and auto-pauses if thresholds are breached.

```typescript
const remaining = await client.getRemainingAllowance(walletAddress, NATIVE_TOKEN);
const limit = parseEther("1");
const usagePercent = ((limit - remaining) * 100n) / limit;

if (usagePercent > 80n) {
  await client.pause(walletAddress, guardianKey);
}
```

## Use Session Keys for Agents

Do not give agents the owner key. Create session keys with:

- **Specific target contracts** and function selectors
- **Short expiry times** (1-24 hours)
- **Session-specific spending limits** where applicable

```typescript
const session = await client.createSession(wallet, {
  actions: [
    { target: dexRouter, selector: "0x38ed1739" },
  ],
  expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour
}, ownerKey);

// Give the agent only the session key
const agentKey = session.privateKey;
```

## Store the Owner Key Securely

- The owner key should be held by a **human**, not the AI agent
- Use a hardware wallet or secure key management system
- The owner key is the ultimate override -- protect it accordingly
- Never store the owner key in `.env` files in production

## Set Auto-Unpause Thoughtfully

- For **high-value wallets**: Manual unpause only (`autoUnpauseAfter: 0`)
- For **automated systems**: 1-24 hours is reasonable depending on risk tolerance
- Never set very long auto-unpause for production wallets
- Consider who will be available to manually unpause if needed

## Test with Mock Mode

Always test your agent logic with `MockSmartAgentKitClient` before deploying to testnet:

```typescript
import { MockSmartAgentKitClient } from "@smartagentkit/testing";

const client = new MockSmartAgentKitClient({ preset: "defi-trader" });
const wallet = await client.createWallet({ owner: "0x..." });

// Test your agent logic here
// Mock client enforces the same policies in-memory
```

## Audit Trail

Use `MockSmartAgentKitClient.getLog()` during development to review all operations your agent performs:

```typescript
const log = client.getLog();
// Review for unexpected patterns:
// - Transactions to unknown addresses
// - Spending close to limits
// - Rapid-fire transactions
```

Look for unexpected patterns before moving to testnet deployment.
