# Policies

Functions for encoding policy configurations into ERC-7579 module installation data.

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
