# Errors

Custom error classes exported by `@smartagentkit/sdk`. All errors extend the base `SmartAgentKitError` class.

## Error Hierarchy

```
SmartAgentKitError (base)
├── WalletCreationError
├── PolicyConfigError
├── ExecutionError
├── SpendingLimitExceededError
├── WalletPausedError
└── SessionError
```

## `SmartAgentKitError`

Base error class for all SDK errors. Extends the built-in `Error` class.

```typescript
class SmartAgentKitError extends Error {
  constructor(message: string);
}
```

## `WalletCreationError`

Thrown when wallet creation or connection fails.

```typescript
class WalletCreationError extends SmartAgentKitError {
  constructor(message: string);
}
```

**Message format:** `"Wallet creation failed: {message}"`

**Thrown by:** `createWallet()`, `connectWallet()`

## `PolicyConfigError`

Thrown when a policy configuration is invalid.

```typescript
class PolicyConfigError extends SmartAgentKitError {
  constructor(message: string);
}
```

**Message format:** `"Invalid policy configuration: {message}"`

**Thrown by:** `encodePolicyInitData()`, `encodeSpendingLimitInitData()`, `encodeAllowlistInitData()`, `encodeEmergencyPauseInitData()`

## `ExecutionError`

Thrown when a transaction fails to execute.

```typescript
class ExecutionError extends SmartAgentKitError {
  constructor(message: string);
}
```

**Message format:** `"Transaction execution failed: {message}"`

**Thrown by:** `execute()`, `executeBatch()`, `pause()`, `unpause()`

## `SpendingLimitExceededError`

Thrown when a transaction would exceed the configured spending limit.

```typescript
class SpendingLimitExceededError extends SmartAgentKitError {
  constructor(token: string, attempted: bigint, remaining: bigint);
}
```

**Message format:** `"Spending limit exceeded for {token}: attempted {attempted}, remaining {remaining}"`

**Thrown by:** `execute()`, `executeBatch()` (in `MockSmartAgentKitClient`)

## `WalletPausedError`

Thrown when attempting to execute through a paused wallet.

```typescript
class WalletPausedError extends SmartAgentKitError {
  constructor(walletAddress: string);
}
```

**Message format:** `"Wallet {walletAddress} is currently paused"`

**Thrown by:** `execute()`, `executeBatch()` (in `MockSmartAgentKitClient`)

## `SessionError`

Thrown when session creation, usage, or revocation fails.

```typescript
class SessionError extends SmartAgentKitError {
  constructor(message: string);
}
```

**Message format:** `"Session error: {message}"`

**Thrown by:** `createSession()`, `revokeSession()`, `buildSession()`

## Error Handling Example

```typescript
import {
  SmartAgentKitError,
  SpendingLimitExceededError,
  WalletPausedError,
} from "@smartagentkit/sdk";

try {
  await client.execute(wallet, { target: "0x...", value: parseEther("100") });
} catch (error) {
  if (error instanceof SpendingLimitExceededError) {
    console.log("Over budget -- reduce the amount");
  } else if (error instanceof WalletPausedError) {
    console.log("Wallet is paused -- contact guardian");
  } else if (error instanceof SmartAgentKitError) {
    console.log("SDK error:", error.message);
  }
}
```
