# EmergencyPauseHook

Circuit breaker with guardian-controlled pause/unpause and optional auto-unpause. Provides a kill switch for AI agent wallets.

**Inheritance:** `ERC7579HookBase`

**Source:** `packages/contracts/src/modules/EmergencyPauseHook.sol`

## Storage

```solidity
mapping(address account => PauseConfig) public pauseConfigs;

struct PauseConfig {
    address guardian;
    bool paused;
    uint48 pausedAt;
    uint48 autoUnpauseAfter;
    uint48 lastPausedAt;  // For cooldown enforcement
}
```

## Functions

### `onInstall`

```solidity
function onInstall(bytes calldata data) external
```

Initialize with guardian address and auto-unpause timeout. Called automatically during module installation.

| Data Field | Type | Description |
|---|---|---|
| `guardian` | `address` | Address authorized to pause the account |
| `autoUnpauseAfter` | `uint48` | Seconds until auto-unpause (0 = manual only) |

### `pause`

```solidity
function pause(address account) external
```

Pause the account, freezing all transaction activity. Only callable by the designated guardian.

A 1-hour cooldown is enforced between consecutive pauses to prevent griefing.

### `unpause`

```solidity
function unpause(address account) external
```

Unpause the account. Callable by the guardian or by the account itself.

### `isPaused`

```solidity
function isPaused(address account) external view returns (bool)
```

Check if an account is currently paused. Accounts for auto-unpause: if `autoUnpauseAfter` is set and enough time has elapsed since `pausedAt`, this returns `false` even if `paused` is still `true` in storage.

### `setGuardian`

```solidity
function setGuardian(address newGuardian) external
```

Change the guardian address. Only callable by the account itself (via UserOp).

### `setAutoUnpauseTimeout`

```solidity
function setAutoUnpauseTimeout(uint48 timeout) external
```

Change the auto-unpause duration. Maximum 365 days. Set to `0` to require manual unpause. Only callable by the account itself.

### `preCheck`

```solidity
function preCheck(
    address,
    uint256,
    bytes calldata
) external returns (bytes memory hookData)
```

Hook entry point called by the HookMultiPlexer before every transaction. Reverts with `AccountPaused` if the account is currently paused (after accounting for auto-unpause).

## Events

```solidity
event Paused(address indexed account, address indexed guardian);
event Unpaused(address indexed account);
event GuardianChanged(address indexed account, address indexed newGuardian);
```

## Errors

```solidity
error AccountPaused(address account);
error NotGuardian();
error PauseCooldown();                // < 1 hour since last pause
error InvalidAutoUnpauseTimeout();    // > 365 days
```

## Usage Pattern

The EmergencyPauseHook is designed as a safety net for autonomous AI agents:

1. **Normal operation:** The hook's `preCheck` passes through without interference
2. **Anomaly detected:** A monitoring system or human operator calls `pause()` via the guardian key
3. **Investigation:** While paused, all UserOps from the wallet revert
4. **Resolution:** The guardian calls `unpause()` or the auto-unpause timer expires

### Auto-Unpause

When `autoUnpauseAfter` is set, the wallet automatically becomes usable again after the specified duration without requiring an explicit `unpause()` call. This is useful for:
- Temporary cooldown periods after suspicious activity
- Preventing permanent lockout if the guardian key is lost
- Time-limited investigation windows

### Cooldown

A 1-hour cooldown between pauses prevents a compromised guardian from repeatedly pausing and unpausing the wallet to cause disruption.
