# AllowlistHook

Allowlist and blocklist enforcement for target contracts and function selectors. Restricts which contracts and functions an AI agent can interact with.

**Inheritance:** `ERC7579HookDestruct`

**Source:** `packages/contracts/src/modules/AllowlistHook.sol`

## Modes

| Mode | Value | Behavior |
|---|---|---|
| `ALLOWLIST` | `0` | Only listed targets/selectors are allowed; everything else is blocked |
| `BLOCKLIST` | `1` | Listed targets/selectors are blocked; everything else is allowed |

## Storage

```solidity
mapping(address account => mapping(address target => mapping(bytes4 selector => bool))) public permissions;
```

## Functions

### `onInstall`

```solidity
function onInstall(bytes calldata data) external
```

Initialize with mode, targets, protected addresses, and optional trusted forwarder. Called automatically during module installation.

### `onUninstall`

```solidity
function onUninstall(bytes calldata) external
```

Remove all permissions for the calling account.

### `addPermission`

```solidity
function addPermission(address target, bytes4 selector) external
```

Add a permission entry. Use `0x431e2cf5` as the selector for wildcard (all selectors on a target).

| Parameter | Type | Description |
|---|---|---|
| `target` | `address` | Target contract address |
| `selector` | `bytes4` | Function selector, or `0x431e2cf5` for wildcard |

### `removePermission`

```solidity
function removePermission(address target, bytes4 selector) external
```

Remove a permission entry.

### `setMode`

```solidity
function setMode(uint8 mode) external
```

Switch between ALLOWLIST (`0`) and BLOCKLIST (`1`) mode. Only callable by the account itself.

### `isTargetAllowed`

```solidity
function isTargetAllowed(address account, address target, bytes4 selector) external view returns (bool)
```

Check if a specific target/selector combination is allowed for an account.

### `preCheck`

```solidity
function preCheck(
    address msgSender,
    uint256 msgValue,
    bytes calldata msgData
) external returns (bytes memory hookData)
```

Hook entry point called by the HookMultiPlexer before every transaction. Extracts the target address and function selector from `msgData` and checks against the permission table.

Reverts with `TargetNotAllowed` if the call is not permitted.

## Errors

```solidity
error TargetNotAllowed(address target, bytes4 selector);
error ProtectedAddress(address target);
error TooManyPermissions();         // > 100 permissions
error TooManyProtectedAddresses();  // > 20 protected addresses
```

## Important Notes

### Wildcard Selector

The wildcard selector is `0x431e2cf5`, **not** `0x00000000`.

- `0x431e2cf5` -- matches all function selectors on a target (wildcard)
- `0x00000000` -- matches calls with empty calldata (plain ETH transfers)

### Protected Addresses

Protected addresses are always blocked regardless of mode. This prevents the agent from interacting with critical contracts (e.g., the module itself, governance contracts) even if the allowlist would otherwise permit it.

```solidity
// Protected addresses are blocked in both ALLOWLIST and BLOCKLIST modes
addProtectedAddress(address target);
removeProtectedAddress(address target);
```

Maximum 20 protected addresses per account.
