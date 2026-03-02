# AutomationExecutor

Scheduled task execution with caller restrictions, cooldowns, and execution limits. Enables automated recurring actions for AI agent wallets.

**Inheritance:** `ERC7579ExecutorBase`

**Source:** `packages/contracts/src/modules/AutomationExecutor.sol`

## Storage

```solidity
struct Task {
    address caller;
    address target;
    uint256 value;
    bytes calldata_;
    uint48 cooldown;
    uint48 maxExecutions;
    uint48 executionCount;
    uint48 lastExecuted;
}

mapping(address account => mapping(bytes32 taskId => Task)) public tasks;
```

## Functions

### `onInstall`

```solidity
function onInstall(bytes calldata data) external
```

Initialize with task definitions. Called automatically during module installation.

Each task is defined with:

| Field | Type | Description |
|---|---|---|
| `taskId` | `bytes32` | Unique identifier for the task |
| `caller` | `address` | Address authorized to trigger execution |
| `target` | `address` | Target contract to call |
| `value` | `uint256` | ETH value to send with the call |
| `calldata_` | `bytes` | Encoded function call data |
| `cooldown` | `uint48` | Minimum seconds between executions |
| `maxExecutions` | `uint48` | Maximum number of executions (0 = unlimited) |

### `executeTask`

```solidity
function executeTask(bytes32 taskId) external
```

Execute a registered task. The function performs the following checks before execution:

1. **Task exists:** Reverts with `TaskNotFound` if the task ID is not registered
2. **Caller authorized:** Reverts with `UnauthorizedCaller` if `msg.sender` does not match `task.caller`
3. **Cooldown elapsed:** Reverts with `CooldownNotElapsed` if not enough time has passed since the last execution (skipped on first execution when `lastExecuted == 0`)
4. **Execution limit:** Reverts with `MaxExecutionsReached` if `executionCount >= maxExecutions` (skipped when `maxExecutions == 0`)

On successful execution, the stored calldata is executed against the target address via the smart account.

### `onUninstall`

```solidity
function onUninstall(bytes calldata) external
```

Remove all tasks for the calling account.

## Errors

```solidity
error UnauthorizedCaller();
error CooldownNotElapsed();
error MaxExecutionsReached();
error TaskNotFound();
```

## Usage Example

A typical automation setup for periodic rebalancing:

```typescript
import { parseEther, encodeFunctionData } from "viem";

const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  policies: [
    {
      type: "automation",
      tasks: [
        {
          id: "daily-rebalance",
          caller: "0xAutomationBot...",
          target: "0xDex...",
          calldata: encodeFunctionData({
            abi: dexAbi,
            functionName: "rebalance",
            args: [parseEther("1")],
          }),
          cooldown: 86_400, // Once per day
          maxExecutions: 0, // Unlimited
        },
      ],
    },
  ],
});
```

## Design Notes

- The executor module type (`MODULE_TYPE_EXECUTOR = 2`) allows it to execute transactions on behalf of the account
- Tasks are immutable after installation -- to modify a task, uninstall and reinstall the module
- The cooldown check is skipped on the first execution (when `lastExecuted == 0`) to allow immediate first use
- When using with Foundry's `via_ir=true` optimizer, `block.timestamp` may be cached in loops -- use manual time tracking in tests
