// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ERC7579ExecutorBase } from "modulekit/module-bases/ERC7579ExecutorBase.sol";

/**
 * @title AutomationExecutor
 * @notice ERC-7579 Executor that allows external automation services
 *         (e.g. Gelato, Chainlink Keepers) to trigger pre-approved
 *         actions on the agent wallet.
 *
 * @dev Installed as a TYPE_EXECUTOR module on the Safe account. Each
 *      task specifies an authorized caller, target, calldata, cooldown,
 *      and optional max execution count. The executor validates all
 *      constraints before calling `_execute()` on the account.
 *
 *      OWNER RECONFIGURATION: Admin functions (addTask, removeTask)
 *      cannot be called through UserOps because AllowlistHook's protected addresses
 *      mechanism blocks calls to this executor's address. Owners must use Safe-native
 *      execTransaction to reconfigure tasks.
 *
 *      SECURITY — Target validation: Task targets are not validated beyond
 *      a zero-address check. The account owner is responsible for ensuring
 *      task targets are safe. Use AllowlistHook + SpendingLimitHook for
 *      defense-in-depth.
 *
 *      SECURITY — Emergency stop: There is no built-in mechanism to pause
 *      automation tasks. Use EmergencyPauseHook to block all executions,
 *      including automation, when paused.
 */
contract AutomationExecutor is ERC7579ExecutorBase {
    // ─── Types ──────────────────────────────────────────────────

    struct TaskConfig {
        address caller;
        address target;
        uint256 value;
        bytes callData;
        uint48 cooldown;
        uint32 maxExecutions; // 0 = unlimited
        uint32 executionCount;
        uint48 lastExecuted;
    }

    struct TaskInit {
        bytes32 taskId;
        address caller;
        address target;
        uint256 value;
        bytes callData;
        uint48 cooldown;
        uint32 maxExecutions;
    }

    // ─── Storage ────────────────────────────────────────────────

    mapping(address account => mapping(bytes32 taskId => TaskConfig)) public tasks;
    mapping(address account => bytes32[]) internal _taskIds;
    mapping(address account => bool) internal _initialized;

    /// @dev Per-account reentrancy guard. This blocks ALL reentrant task execution for the
    ///      same account, including calls to a different task from within a task callback.
    ///      This is a deliberate safety constraint — cross-task execution patterns should
    ///      use separate accounts or schedule tasks independently.
    mapping(address account => bool) private _executing;

    // ─── Constants ──────────────────────────────────────────────

    /// @dev Maximum number of tasks per account (DoS protection)
    uint256 internal constant MAX_TASKS = 50;

    // ─── Errors ─────────────────────────────────────────────────

    error UnauthorizedCaller(address caller, bytes32 taskId);
    error MaxExecutionsReached(bytes32 taskId, uint32 max);
    error CooldownNotElapsed(bytes32 taskId, uint48 nextAllowed);
    error TaskNotFound(bytes32 taskId);
    error TaskAlreadyExists(bytes32 taskId);
    error InvalidTaskConfig(string reason);
    error TooManyTasks(uint256 max);
    error ReentrantCall();

    // ─── Events ─────────────────────────────────────────────────

    event TaskAdded(address indexed account, bytes32 indexed taskId, address caller, address target);
    event TaskRemoved(address indexed account, bytes32 indexed taskId);
    event TaskExecuted(
        address indexed account,
        bytes32 indexed taskId,
        address indexed caller,
        uint32 executionCount
    );

    // ─── ERC-7579 Module Lifecycle ──────────────────────────────

    function onInstall(bytes calldata data) external override {
        address account = msg.sender;
        if (_initialized[account]) revert ModuleAlreadyInitialized(account);

        if (data.length > 0) {
            TaskInit[] memory inits = abi.decode(data, (TaskInit[]));
            for (uint256 i = 0; i < inits.length; i++) {
                _addTask(account, inits[i]);
            }
        }

        _initialized[account] = true;
    }

    function onUninstall(bytes calldata) external override {
        address account = msg.sender;
        if (!_initialized[account]) revert NotInitialized(account);

        // Delete all tasks for this account
        bytes32[] storage ids = _taskIds[account];
        for (uint256 i = 0; i < ids.length; i++) {
            delete tasks[account][ids[i]];
        }
        delete _taskIds[account];
        delete _executing[account];
        _initialized[account] = false;
    }

    function isModuleType(uint256 typeID) external pure override returns (bool) {
        return typeID == TYPE_EXECUTOR;
    }

    function isInitialized(address smartAccount) external view returns (bool) {
        return _initialized[smartAccount];
    }

    // ─── Task Management (called by account) ────────────────────

    /**
     * @notice Add a new automation task. Must be called by the account owner
     *         (via a UserOp / executeFromExecutor).
     */
    function addTask(TaskInit calldata init) external {
        address account = msg.sender;
        if (!_initialized[account]) revert NotInitialized(account);
        _addTask(account, init);
    }

    /**
     * @notice Remove an automation task.
     */
    function removeTask(bytes32 taskId) external {
        address account = msg.sender;
        if (!_initialized[account]) revert NotInitialized(account);
        TaskConfig storage task = tasks[account][taskId];
        if (task.caller == address(0)) revert TaskNotFound(taskId);

        delete tasks[account][taskId];

        // Remove from taskIds array
        bytes32[] storage ids = _taskIds[account];
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == taskId) {
                ids[i] = ids[ids.length - 1];
                ids.pop();
                break;
            }
        }

        emit TaskRemoved(account, taskId);
    }

    // ─── Task Execution (called by automation service) ──────────

    /**
     * @notice Execute a pre-approved task on behalf of the account.
     * @param account The smart account to execute on.
     * @param taskId The task identifier.
     */
    function executeTask(address account, bytes32 taskId) external {
        if (!_initialized[account]) revert NotInitialized(account);
        if (_executing[account]) revert ReentrantCall();

        TaskConfig storage task = tasks[account][taskId];

        // Check task exists before caller check (more specific error)
        if (task.caller == address(0)) revert TaskNotFound(taskId);

        // Validate caller
        if (task.caller != msg.sender) {
            revert UnauthorizedCaller(msg.sender, taskId);
        }

        // Validate max executions
        if (task.maxExecutions > 0 && task.executionCount >= task.maxExecutions) {
            revert MaxExecutionsReached(taskId, task.maxExecutions);
        }

        // Validate cooldown (skip for first execution)
        if (task.lastExecuted > 0) {
            uint48 nextAllowed = task.lastExecuted + task.cooldown;
            if (block.timestamp < nextAllowed) {
                revert CooldownNotElapsed(taskId, nextAllowed);
            }
        }

        // Reentrancy guard
        _executing[account] = true;

        // Update state before execution (CEI pattern)
        task.executionCount++;
        task.lastExecuted = uint48(block.timestamp);

        // Execute the pre-approved action through the account
        _execute(account, task.target, task.value, task.callData);

        _executing[account] = false;
        emit TaskExecuted(account, taskId, msg.sender, task.executionCount);
    }

    // ─── View Functions ─────────────────────────────────────────

    /**
     * @notice Get task IDs for an account.
     */
    function getTaskIds(address account) external view returns (bytes32[] memory) {
        return _taskIds[account];
    }

    /**
     * @notice Check if a task can be executed right now.
     * @dev NOTE: This function only checks task-level constraints (existence, max executions,
     *      cooldown). It does NOT check whether the account has sufficient ETH balance for
     *      `task.value`, whether the target call will succeed, or whether other hooks
     *      (e.g. SpendingLimitHook, AllowlistHook) will allow the execution.
     */
    function canExecute(address account, bytes32 taskId) external view returns (bool) {
        TaskConfig storage task = tasks[account][taskId];
        if (task.caller == address(0)) return false;
        if (task.maxExecutions > 0 && task.executionCount >= task.maxExecutions) return false;
        if (task.lastExecuted > 0 && block.timestamp < task.lastExecuted + task.cooldown) return false;
        return true;
    }

    // ─── Internal ───────────────────────────────────────────────

    /**
     * @dev Task targets are not validated against hook infrastructure addresses.
     *      If a task targets a hook or the multiplexer, it will be blocked at
     *      execution time by AllowlistHook's protected addresses check.
     */
    function _addTask(address account, TaskInit memory init) internal {
        if (init.caller == address(0)) revert InvalidTaskConfig("caller cannot be zero");
        if (init.target == address(0)) revert InvalidTaskConfig("target cannot be zero");

        if (_taskIds[account].length >= MAX_TASKS) {
            revert TooManyTasks(MAX_TASKS);
        }

        TaskConfig storage existing = tasks[account][init.taskId];
        if (existing.caller != address(0)) revert TaskAlreadyExists(init.taskId);

        tasks[account][init.taskId] = TaskConfig({
            caller: init.caller,
            target: init.target,
            value: init.value,
            callData: init.callData,
            cooldown: init.cooldown,
            maxExecutions: init.maxExecutions,
            executionCount: 0,
            lastExecuted: 0
        });

        _taskIds[account].push(init.taskId);

        emit TaskAdded(account, init.taskId, init.caller, init.target);
    }

    function name() external pure returns (string memory) {
        return "AutomationExecutor";
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
