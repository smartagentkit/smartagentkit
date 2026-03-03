# Policies

Functions and types for encoding policy configurations into ERC-7579 module installation data. Policies use a plugin architecture — see the [Custom Policies Guide](/guides/custom-policies) for extending with your own hooks.

## `encodePolicyInitData`

```typescript
encodePolicyInitData(
  policy: PolicyConfig,
  moduleAddresses?: ModuleAddresses,
  trustedForwarder?: Address
): EncodedPolicy
```

Encode a policy config into module installation data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `policy` | `PolicyConfig` | Yes | Policy configuration object |
| `moduleAddresses` | `ModuleAddresses` | No | Custom module addresses |
| `trustedForwarder` | `Address` | No | HookMultiPlexer address for forwarded calls |

**Returns:**

```typescript
interface EncodedPolicy {
  moduleAddress: Address;
  moduleType: number;
  initData: Hex;
}
```

## `encodeSpendingLimitInitData`

```typescript
encodeSpendingLimitInitData(
  policy: SpendingLimitPolicy,
  trustedForwarder?: Address
): Hex
```

Encode spending limit initialization data for the SpendingLimitHook contract.

**Validation rules:**
- No duplicate token addresses
- `limit` must be greater than 0
- `window` must be at least 60 seconds

**Throws:** `PolicyConfigError`

```typescript
import { encodeSpendingLimitInitData, NATIVE_TOKEN } from "@smartagentkit/sdk";

const initData = encodeSpendingLimitInitData({
  type: "spending-limit",
  limits: [
    { token: NATIVE_TOKEN, limit: parseEther("1"), window: 86_400 },
  ],
});
```

## `encodeAllowlistInitData`

```typescript
encodeAllowlistInitData(
  policy: AllowlistPolicy,
  trustedForwarder?: Address
): Hex
```

Encode allowlist initialization data for the AllowlistHook contract.

**Validation rules:**
- Allow mode requires at least one target
- Maximum 20 protected addresses
- Wildcard selector is `0x431e2cf5` (not `0x00000000`)

**Throws:** `PolicyConfigError`

```typescript
import { encodeAllowlistInitData } from "@smartagentkit/sdk";

const initData = encodeAllowlistInitData({
  type: "allowlist",
  mode: "allow",
  targets: [
    { address: "0xDex...", selector: "0xa9059cbb" },
    { address: "0xDex...", selector: "0x095ea7b3" },
  ],
});
```

## `encodeEmergencyPauseInitData`

```typescript
encodeEmergencyPauseInitData(
  policy: EmergencyPausePolicy,
  trustedForwarder?: Address
): Hex
```

Encode emergency pause initialization data for the EmergencyPauseHook contract.

**Validation rules:**
- Guardian address must not be the zero address

**Throws:** `PolicyConfigError`

```typescript
import { encodeEmergencyPauseInitData } from "@smartagentkit/sdk";

const initData = encodeEmergencyPauseInitData({
  type: "emergency-pause",
  guardian: "0xGuardian...",
  autoUnpauseAfter: 86_400, // 24 hours
});
```

## Plugin Architecture

### `PolicyPlugin<TConfig>`

Interface for policy plugins. See [Custom Policies Guide](/guides/custom-policies) for full documentation.

```typescript
interface PolicyPlugin<TConfig = unknown> {
  readonly id: string;
  readonly name: string;
  readonly moduleType: "hook" | "executor" | "validator" | "fallback";
  readonly isInfrastructure: boolean;
  readonly defaultAddresses?: Record<number, Address>;
  readonly abi: readonly Record<string, unknown>[];
  encodeInitData(config: TConfig, trustedForwarder: Address): Hex;
  validateConfig(config: TConfig): void;
  toInstalledPolicy(config: TConfig, moduleAddress: Address): {
    moduleAddress: Address; moduleType: number; name: string;
  };
}
```

### `pluginRegistry`

Singleton registry of policy plugins.

| Method | Description |
|---|---|
| `register(plugin)` | Register a new plugin (throws on duplicate) |
| `replace(plugin)` | Override an existing registration |
| `get(id)` | Get plugin by ID (throws if not found) |
| `has(id)` | Check if a plugin is registered |
| `all()` | Get all registered plugins |
| `resolveAddress(id, chainId, overrides?)` | Resolve deployed address |
| `setDefaultAddress(id, chainId, address)` | Set a default address |
| `getInfrastructureAddresses(chainId, overrides?)` | Get all protected addresses |

### `client.policies`

Policy management API on `SmartAgentKitClient`:

```typescript
client.policies.install(wallet, params, ownerKey): Promise<void>
client.policies.installRaw(wallet, params, ownerKey): Promise<void>
client.policies.list(walletAddress): Promise<InstalledPolicy[]>
```

### Built-in Plugins

Available as named exports:

- `spendingLimitPlugin` — SpendingLimitHook
- `allowlistPlugin` — AllowlistHook
- `emergencyPausePlugin` — EmergencyPauseHook
- `automationPlugin` — AutomationExecutor (stub)
