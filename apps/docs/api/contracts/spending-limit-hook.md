# SpendingLimitHook

Per-token spending caps with rolling time windows. Prevents AI agents from exceeding configured budgets.

**Inheritance:** `ERC7579HookDestruct`

**Source:** `packages/contracts/src/modules/SpendingLimitHook.sol`

## Storage

```solidity
mapping(address account => mapping(address token => SpendingConfig)) public configs;

struct SpendingConfig {
    uint256 limit;
    uint256 spent;
    uint48 windowStart;
    uint48 windowSize;
}
```

## Functions

### `onInstall`

```solidity
function onInstall(bytes calldata data) external
```

Initialize spending limits for the calling account. Called automatically during module installation.

**Data format:** ABI-encoded array of `(address token, uint256 limit, uint48 window)` tuples, with an optional trailing trusted forwarder address.

### `onUninstall`

```solidity
function onUninstall(bytes calldata) external
```

Remove all spending configurations for the calling account.

### `setSpendingLimit`

```solidity
function setSpendingLimit(address token, uint256 limit, uint48 window) external
```

Update or add a spending limit for a token. Only callable by the account itself (via UserOp).

| Parameter | Type | Description |
|---|---|---|
| `token` | `address` | Token address (use zero address for native ETH) |
| `limit` | `uint256` | Maximum amount per window (in token decimals) |
| `window` | `uint48` | Window duration in seconds (minimum 60) |

### `removeSpendingLimit`

```solidity
function removeSpendingLimit(address token) external
```

Remove a spending limit for a specific token. Only callable by the account itself.

### `getRemainingAllowance`

```solidity
function getRemainingAllowance(address account, address token) external view returns (uint256)
```

Returns the remaining allowance for a token in the current window. If the window has elapsed since the last spend, the full limit is returned.

### `preCheck`

```solidity
function preCheck(
    address msgSender,
    uint256 msgValue,
    bytes calldata msgData
) external returns (bytes memory hookData)
```

Hook entry point called by the HookMultiPlexer before every transaction. Checks:
- Native ETH value against the ETH spending limit
- ERC-20 `transfer()` amount against the token spending limit
- ERC-20 `approve()` amount against the token spending limit
- ERC-20 `transferFrom()` amount against the token spending limit

Reverts with `SpendingLimitExceeded` if any limit would be exceeded.

## Events

```solidity
event SpendingLimitSet(address indexed account, address indexed token, uint256 limit, uint48 window);
event SpendingLimitRemoved(address indexed account, address indexed token);
```

## Errors

```solidity
error SpendingLimitExceeded(address token, uint256 attempted, uint256 remaining);
error InvalidWindow();    // window < 60 seconds
error InvalidLimit();     // limit == 0
error DuplicateToken(address token);
```

## Known Limitations

- Does not track token wrapping/unwrapping (e.g., WETH deposit/withdraw)
- Does not track flash loans
- Does not track delegate calls
- ERC-20 detection is based on function selectors; non-standard transfer functions are not tracked
