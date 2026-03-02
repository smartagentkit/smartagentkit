# Deployments

Built-in deployment addresses for SmartAgentKit modules on supported chains.

## `DEPLOYMENTS` Record

```typescript
const DEPLOYMENTS: Record<number, ModuleAddresses>
```

A mapping from chain ID to deployed module addresses. The SDK uses this record to auto-resolve module addresses when `moduleAddresses` is not provided in the client config.

## Base Sepolia (Chain ID: 84532)

| Module | Address |
|---|---|
| SpendingLimitHook | `0x0ea97ef2fc52700d1628110a8f411fefb0c0aa8b` |
| AllowlistHook | `0x61a2100072d03f66de6f7dd0dfc2f7aa5c91e777` |
| EmergencyPauseHook | `0xb8fdc9ee56cfb4077e132eff631b546fe6e79fec` |
| AutomationExecutor | `0x729c29b35c396b907ed118f00fbe4d4bcc3a7f46` |

## Auto-Resolution

When `moduleAddresses` is not specified in the `SmartAgentKitConfig`, the SDK looks up `DEPLOYMENTS[chain.id]`. If a matching entry is found, those addresses are used automatically.

```typescript
// Auto-resolves Base Sepolia addresses -- no moduleAddresses needed
const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: "https://...",
  bundlerUrl: "https://...",
});
```

For chains without built-in deployments, you must provide `moduleAddresses` in the constructor:

```typescript
const client = new SmartAgentKitClient({
  chain: optimismSepolia,
  rpcUrl: "https://...",
  bundlerUrl: "https://...",
  moduleAddresses: {
    spendingLimitHook: "0x...",
    allowlistHook: "0x...",
    emergencyPauseHook: "0x...",
    automationExecutor: "0x...",
  },
});
```

## Adding Deployments

After deploying SmartAgentKit modules to a new chain using the `Deploy.s.sol` script, create a JSON file at:

```
packages/sdk/deployments/{chain-name}.json
```

Format:

```json
{
  "chainId": 10,
  "spendingLimitHook": "0x...",
  "allowlistHook": "0x...",
  "emergencyPauseHook": "0x...",
  "automationExecutor": "0x..."
}
```

The deployment file will be picked up automatically by the SDK build process.
