# Sessions

Functions for managing Smart Sessions (Rhinestone + Biconomy) -- scoped session keys for AI agents.

## Constants

```typescript
SMART_SESSIONS_ADDRESS = "0x00000000002B0eCfbD0496EE71e01257dA0E37DE"
OWNABLE_VALIDATOR_ADDRESS = "0x2483DA3A338895199E5e538530213157e931Bf06"
```

## `buildSession`

```typescript
buildSession(
  sessionKeyAddress: Address,
  params: CreateSessionParams,
  chainId: number,
  sessionValidatorAddress?: Address
): Session
```

Build a Smart Sessions session structure.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sessionKeyAddress` | `Address` | Yes | Public address of the session key |
| `params` | `CreateSessionParams` | Yes | Session parameters (actions, expiry, limits) |
| `chainId` | `number` | Yes | Chain ID for the session |
| `sessionValidatorAddress` | `Address` | No | Custom session validator address |

**Validation:**
- `expiresAt` must be in the future
- At least one action is required

**Throws:** `SessionError`

## `getSmartSessionsModule`

```typescript
getSmartSessionsModule(sessions?: Session[]): {
  address: Address;
  initData: Hex;
}
```

Get the Smart Sessions module installation config for use during wallet creation or module installation.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sessions` | `Session[]` | No | Initial sessions to install |

## `computePermissionId`

```typescript
computePermissionId(session: Session): Hex
```

Compute the deterministic permission ID for a session. This ID is used for revoking sessions and encoding use-session signatures.

## `getEnableDetails`

```typescript
getEnableDetails(
  sessions: Session[],
  account: Address,
  publicClients: PublicClient[],
  enableValidatorAddress?: Address
): Promise<EnableSessionData>
```

Get the data the owner must sign to enable a session on-chain.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sessions` | `Session[]` | Yes | Sessions to enable |
| `account` | `Address` | Yes | Smart account address |
| `publicClients` | `PublicClient[]` | Yes | viem public clients for chain queries |
| `enableValidatorAddress` | `Address` | No | Custom validator address |

**Returns:**

```typescript
interface EnableSessionData {
  permissionEnableHash: Hex;
  mode: SmartSessionMode;
  permissionId: Hex;
  signature: Hex;
  enableSessionData: Hex;
}
```

## `encodeUseSessionSignature`

```typescript
encodeUseSessionSignature(permissionId: Hex, signature: Hex): Hex
```

Encode a signature for using an existing (already enabled) session.

## `encodeEnableSessionSignature`

```typescript
encodeEnableSessionSignature(
  permissionId: Hex,
  signature: Hex,
  enableSessionData: Hex
): Hex
```

Encode a signature for enabling and using a session in one step.

## `getRemoveAction`

```typescript
getRemoveAction(permissionId: Hex): {
  to: Address;
  value: bigint;
  data: Hex;
}
```

Get the transaction data to revoke a session on-chain. The returned object can be passed directly to `execute()`.

## `SmartSessionMode`

```typescript
enum SmartSessionMode {
  USE = 0,
  ENABLE = 1,
}
```

| Mode | Value | Description |
|---|---|---|
| `USE` | `0` | Use an already-enabled session |
| `ENABLE` | `1` | Enable a new session and use it in the same UserOp |
