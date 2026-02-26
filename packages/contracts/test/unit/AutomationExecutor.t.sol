// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "forge-std/Test.sol";
import { AutomationExecutor } from "../../src/modules/AutomationExecutor.sol";

/// @dev Mock account that approves the executor to call executeFromExecutor
contract MockAccount {
    address public executor;
    bool public lastCallSuccess;
    bytes public lastCallResult;

    constructor(address _executor) {
        executor = _executor;
    }

    function executeFromExecutor(
        bytes32, /* mode */
        bytes calldata /* executionCalldata */
    ) external payable returns (bytes[] memory returnData) {
        require(msg.sender == executor, "only executor");
        lastCallSuccess = true;
        returnData = new bytes[](1);
        returnData[0] = "";
        return returnData;
    }
}

/// @dev Mock account that calls back executeTask during executeFromExecutor (for reentrancy testing)
contract ReentrantMockAccount {
    address public executor;
    bytes32 public reentrantTaskId;

    constructor(address _executor) {
        executor = _executor;
    }

    function setReentrantTaskId(bytes32 _taskId) external {
        reentrantTaskId = _taskId;
    }

    function executeFromExecutor(
        bytes32, /* mode */
        bytes calldata /* executionCalldata */
    ) external payable returns (bytes[] memory returnData) {
        require(msg.sender == executor, "only executor");

        // Attempt reentrancy — call executeTask again
        AutomationExecutor(executor).executeTask(address(this), reentrantTaskId);

        returnData = new bytes[](1);
        returnData[0] = "";
        return returnData;
    }
}

/// @dev Mock target that records calls
contract MockTarget {
    uint256 public callCount;
    uint256 public lastValue;
    bytes public lastData;

    fallback() external payable {
        callCount++;
        lastValue = msg.value;
        lastData = msg.data;
    }

    receive() external payable {
        callCount++;
        lastValue = msg.value;
    }
}

contract AutomationExecutorTest is Test {
    AutomationExecutor public executor;
    MockAccount public account;
    MockTarget public target;

    address public automationService = makeAddr("automationService");
    address public otherCaller = makeAddr("otherCaller");

    bytes32 constant TASK_ID_1 = keccak256("task-1");
    bytes32 constant TASK_ID_2 = keccak256("task-2");

    function setUp() public {
        executor = new AutomationExecutor();
        account = new MockAccount(address(executor));
        target = new MockTarget();
    }

    // ─── Helpers ──────────────────────────────────────────────────

    function _defaultTaskInit() internal view returns (AutomationExecutor.TaskInit memory) {
        return AutomationExecutor.TaskInit({
            taskId: TASK_ID_1,
            caller: automationService,
            target: address(target),
            value: 0,
            callData: abi.encodeWithSignature("doSomething()"),
            cooldown: 60,
            maxExecutions: 0 // unlimited
        });
    }

    function _installDefault() internal {
        AutomationExecutor.TaskInit[] memory inits = new AutomationExecutor.TaskInit[](1);
        inits[0] = _defaultTaskInit();

        vm.prank(address(account));
        executor.onInstall(abi.encode(inits));
    }

    function _installTwoTasks() internal {
        AutomationExecutor.TaskInit[] memory inits = new AutomationExecutor.TaskInit[](2);
        inits[0] = _defaultTaskInit();
        inits[1] = AutomationExecutor.TaskInit({
            taskId: TASK_ID_2,
            caller: automationService,
            target: address(target),
            value: 0.1 ether,
            callData: abi.encodeWithSignature("doOther()"),
            cooldown: 300,
            maxExecutions: 5
        });

        vm.prank(address(account));
        executor.onInstall(abi.encode(inits));
    }

    // ─── Installation Tests ───────────────────────────────────────

    function test_onInstall_setsUpTasks() public {
        _installDefault();

        assertTrue(executor.isInitialized(address(account)));

        (address caller, address tgt,,,,,,) = executor.tasks(address(account), TASK_ID_1);
        assertEq(caller, automationService);
        assertEq(tgt, address(target));
    }

    function test_onInstall_multipleTasks() public {
        _installTwoTasks();

        bytes32[] memory ids = executor.getTaskIds(address(account));
        assertEq(ids.length, 2);

        (address caller1,,,,,,,) = executor.tasks(address(account), TASK_ID_1);
        (address caller2,,,,,,,) = executor.tasks(address(account), TASK_ID_2);
        assertEq(caller1, automationService);
        assertEq(caller2, automationService);
    }

    function test_onInstall_emptyData() public {
        vm.prank(address(account));
        executor.onInstall("");

        assertTrue(executor.isInitialized(address(account)));
        bytes32[] memory ids = executor.getTaskIds(address(account));
        assertEq(ids.length, 0);
    }

    function test_onInstall_revertsIfAlreadyInitialized() public {
        _installDefault();

        AutomationExecutor.TaskInit[] memory inits = new AutomationExecutor.TaskInit[](0);
        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSignature("ModuleAlreadyInitialized(address)", address(account)));
        executor.onInstall(abi.encode(inits));
    }

    // ─── Uninstall Tests ──────────────────────────────────────────

    function test_onUninstall_clearsAllTasks() public {
        _installTwoTasks();

        vm.prank(address(account));
        executor.onUninstall("");

        assertFalse(executor.isInitialized(address(account)));
        bytes32[] memory ids = executor.getTaskIds(address(account));
        assertEq(ids.length, 0);

        (address caller,,,,,,,) = executor.tasks(address(account), TASK_ID_1);
        assertEq(caller, address(0));
    }

    // ─── Module Type Tests ────────────────────────────────────────

    function test_isModuleType_executor() public view {
        assertTrue(executor.isModuleType(2)); // TYPE_EXECUTOR = 2
    }

    function test_isModuleType_notHook() public view {
        assertFalse(executor.isModuleType(4)); // TYPE_HOOK = 4
    }

    // ─── Task Execution Tests ─────────────────────────────────────

    function test_executeTask_succeeds() public {
        _installDefault();

        vm.prank(automationService);
        executor.executeTask(address(account), TASK_ID_1);

        // Verify the account's executeFromExecutor was called
        assertTrue(account.lastCallSuccess());

        // Verify execution count incremented
        (,,,,,, uint32 count,) = executor.tasks(address(account), TASK_ID_1);
        assertEq(count, 1);
    }

    function test_executeTask_revertsForUnauthorizedCaller() public {
        _installDefault();

        vm.prank(otherCaller);
        vm.expectRevert(
            abi.encodeWithSelector(
                AutomationExecutor.UnauthorizedCaller.selector,
                otherCaller,
                TASK_ID_1
            )
        );
        executor.executeTask(address(account), TASK_ID_1);
    }

    function test_executeTask_revertsIfTaskNotFound() public {
        _installDefault();

        bytes32 fakeTask = keccak256("nonexistent");
        vm.prank(automationService);
        vm.expectRevert(
            abi.encodeWithSelector(
                AutomationExecutor.TaskNotFound.selector,
                fakeTask
            )
        );
        executor.executeTask(address(account), fakeTask);
    }

    function test_executeTask_notInitialized_reverts() public {
        vm.prank(automationService);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", address(account)));
        executor.executeTask(address(account), TASK_ID_1);
    }

    function test_executeTask_respectsCooldown() public {
        _installDefault();

        // First execution succeeds
        vm.prank(automationService);
        executor.executeTask(address(account), TASK_ID_1);

        // Immediate retry fails
        vm.prank(automationService);
        vm.expectRevert(
            abi.encodeWithSelector(
                AutomationExecutor.CooldownNotElapsed.selector,
                TASK_ID_1,
                uint48(block.timestamp + 60) // cooldown = 60s
            )
        );
        executor.executeTask(address(account), TASK_ID_1);

        // After cooldown, succeeds
        vm.warp(block.timestamp + 61);
        vm.prank(automationService);
        executor.executeTask(address(account), TASK_ID_1);

        (,,,,,, uint32 count,) = executor.tasks(address(account), TASK_ID_1);
        assertEq(count, 2);
    }

    function test_executeTask_enforceMaxExecutions() public {
        AutomationExecutor.TaskInit[] memory inits = new AutomationExecutor.TaskInit[](1);
        inits[0] = AutomationExecutor.TaskInit({
            taskId: TASK_ID_1,
            caller: automationService,
            target: address(target),
            value: 0,
            callData: "",
            cooldown: 0, // no cooldown for this test
            maxExecutions: 3
        });

        vm.prank(address(account));
        executor.onInstall(abi.encode(inits));

        // Execute 3 times (should succeed)
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(automationService);
            executor.executeTask(address(account), TASK_ID_1);
        }

        // 4th execution fails
        vm.prank(automationService);
        vm.expectRevert(
            abi.encodeWithSelector(
                AutomationExecutor.MaxExecutionsReached.selector,
                TASK_ID_1,
                uint32(3)
            )
        );
        executor.executeTask(address(account), TASK_ID_1);
    }

    function test_executeTask_unlimitedExecutions() public {
        _installDefault(); // maxExecutions = 0 (unlimited)

        // Execute many times, each with warp past cooldown
        // Track time manually to avoid optimizer caching block.timestamp
        uint256 currentTime = block.timestamp;
        for (uint256 i = 0; i < 20; i++) {
            vm.prank(automationService);
            executor.executeTask(address(account), TASK_ID_1);
            currentTime += 61;
            vm.warp(currentTime);
        }

        (,,,,,, uint32 count,) = executor.tasks(address(account), TASK_ID_1);
        assertEq(count, 20);
    }

    function test_executeTask_emitsEvent() public {
        _installDefault();

        vm.expectEmit(true, true, true, true);
        emit AutomationExecutor.TaskExecuted(address(account), TASK_ID_1, automationService, 1);

        vm.prank(automationService);
        executor.executeTask(address(account), TASK_ID_1);
    }

    // ─── Task Management Tests ────────────────────────────────────

    function test_addTask_succeeds() public {
        _installDefault();

        AutomationExecutor.TaskInit memory newTask = AutomationExecutor.TaskInit({
            taskId: TASK_ID_2,
            caller: otherCaller,
            target: address(target),
            value: 0,
            callData: "",
            cooldown: 120,
            maxExecutions: 10
        });

        vm.prank(address(account));
        executor.addTask(newTask);

        bytes32[] memory ids = executor.getTaskIds(address(account));
        assertEq(ids.length, 2);

        (address caller,,,,,,,) = executor.tasks(address(account), TASK_ID_2);
        assertEq(caller, otherCaller);
    }

    function test_addTask_revertsForDuplicate() public {
        _installDefault();

        AutomationExecutor.TaskInit memory dup = _defaultTaskInit();
        vm.prank(address(account));
        vm.expectRevert(
            abi.encodeWithSelector(AutomationExecutor.TaskAlreadyExists.selector, TASK_ID_1)
        );
        executor.addTask(dup);
    }

    function test_addTask_revertsForZeroCaller() public {
        _installDefault();

        AutomationExecutor.TaskInit memory bad = AutomationExecutor.TaskInit({
            taskId: TASK_ID_2,
            caller: address(0),
            target: address(target),
            value: 0,
            callData: "",
            cooldown: 60,
            maxExecutions: 0
        });

        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSelector(AutomationExecutor.InvalidTaskConfig.selector, "caller cannot be zero"));
        executor.addTask(bad);
    }

    function test_addTask_revertsForZeroTarget() public {
        _installDefault();

        AutomationExecutor.TaskInit memory bad = AutomationExecutor.TaskInit({
            taskId: TASK_ID_2,
            caller: automationService,
            target: address(0),
            value: 0,
            callData: "",
            cooldown: 60,
            maxExecutions: 0
        });

        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSelector(AutomationExecutor.InvalidTaskConfig.selector, "target cannot be zero"));
        executor.addTask(bad);
    }

    function test_addTask_exceedsMaxTasks_reverts() public {
        // Install with empty data
        vm.prank(address(account));
        executor.onInstall("");

        // Add 50 tasks (the max)
        for (uint256 i = 0; i < 50; i++) {
            AutomationExecutor.TaskInit memory init = AutomationExecutor.TaskInit({
                taskId: keccak256(abi.encodePacked("task-", i)),
                caller: automationService,
                target: address(target),
                value: 0,
                callData: "",
                cooldown: 0,
                maxExecutions: 0
            });
            vm.prank(address(account));
            executor.addTask(init);
        }

        // 51st should fail
        AutomationExecutor.TaskInit memory overflow = AutomationExecutor.TaskInit({
            taskId: keccak256("overflow"),
            caller: automationService,
            target: address(target),
            value: 0,
            callData: "",
            cooldown: 0,
            maxExecutions: 0
        });

        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSelector(AutomationExecutor.TooManyTasks.selector, 50));
        executor.addTask(overflow);
    }

    function test_removeTask_succeeds() public {
        _installTwoTasks();

        vm.prank(address(account));
        executor.removeTask(TASK_ID_1);

        bytes32[] memory ids = executor.getTaskIds(address(account));
        assertEq(ids.length, 1);
        assertEq(ids[0], TASK_ID_2);

        (address caller,,,,,,,) = executor.tasks(address(account), TASK_ID_1);
        assertEq(caller, address(0));
    }

    function test_removeTask_revertsForNonexistent() public {
        _installDefault();

        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSelector(AutomationExecutor.TaskNotFound.selector, TASK_ID_2));
        executor.removeTask(TASK_ID_2);
    }

    function test_removeTask_emitsEvent() public {
        _installDefault();

        vm.expectEmit(true, true, false, false);
        emit AutomationExecutor.TaskRemoved(address(account), TASK_ID_1);

        vm.prank(address(account));
        executor.removeTask(TASK_ID_1);
    }

    // ─── View Function Tests ──────────────────────────────────────

    function test_canExecute_trueWhenReady() public {
        _installDefault();
        assertTrue(executor.canExecute(address(account), TASK_ID_1));
    }

    function test_canExecute_falseWhenCooldownActive() public {
        _installDefault();

        vm.prank(automationService);
        executor.executeTask(address(account), TASK_ID_1);

        assertFalse(executor.canExecute(address(account), TASK_ID_1));
    }

    function test_canExecute_falseWhenMaxReached() public {
        AutomationExecutor.TaskInit[] memory inits = new AutomationExecutor.TaskInit[](1);
        inits[0] = AutomationExecutor.TaskInit({
            taskId: TASK_ID_1,
            caller: automationService,
            target: address(target),
            value: 0,
            callData: "",
            cooldown: 0,
            maxExecutions: 1
        });

        vm.prank(address(account));
        executor.onInstall(abi.encode(inits));

        vm.prank(automationService);
        executor.executeTask(address(account), TASK_ID_1);

        assertFalse(executor.canExecute(address(account), TASK_ID_1));
    }

    function test_canExecute_falseForUnknownTask() public {
        _installDefault();
        assertFalse(executor.canExecute(address(account), keccak256("unknown")));
    }

    function test_getTaskIds_empty() public view {
        bytes32[] memory ids = executor.getTaskIds(address(account));
        assertEq(ids.length, 0);
    }

    // ─── Fuzz Tests ─────────────────────────────────────────────

    function testFuzz_cooldown(uint48 cooldown) public {
        vm.assume(cooldown > 0 && cooldown < 365 days);

        AutomationExecutor.TaskInit[] memory inits = new AutomationExecutor.TaskInit[](1);
        inits[0] = AutomationExecutor.TaskInit({
            taskId: TASK_ID_1,
            caller: automationService,
            target: address(target),
            value: 0,
            callData: "",
            cooldown: cooldown,
            maxExecutions: 0
        });

        vm.prank(address(account));
        executor.onInstall(abi.encode(inits));

        // First execution succeeds
        vm.prank(automationService);
        executor.executeTask(address(account), TASK_ID_1);

        // Before cooldown: fails
        if (cooldown > 1) {
            vm.warp(block.timestamp + cooldown - 1);
            vm.prank(automationService);
            vm.expectRevert();
            executor.executeTask(address(account), TASK_ID_1);
        }

        // After cooldown: succeeds
        vm.warp(block.timestamp + cooldown + 1);
        vm.prank(automationService);
        executor.executeTask(address(account), TASK_ID_1);
    }

    function testFuzz_maxExecutions(uint32 maxExec) public {
        vm.assume(maxExec > 0 && maxExec <= 20);

        AutomationExecutor.TaskInit[] memory inits = new AutomationExecutor.TaskInit[](1);
        inits[0] = AutomationExecutor.TaskInit({
            taskId: TASK_ID_1,
            caller: automationService,
            target: address(target),
            value: 0,
            callData: "",
            cooldown: 0,
            maxExecutions: maxExec
        });

        vm.prank(address(account));
        executor.onInstall(abi.encode(inits));

        // Execute maxExec times
        for (uint256 i = 0; i < maxExec; i++) {
            vm.prank(automationService);
            executor.executeTask(address(account), TASK_ID_1);
        }

        // Next should fail
        vm.prank(automationService);
        vm.expectRevert();
        executor.executeTask(address(account), TASK_ID_1);
    }

    // ─── Init Check Tests ────────────────────────────────────────

    function test_addTask_revertsIfNotInitialized() public {
        AutomationExecutor.TaskInit memory init = _defaultTaskInit();

        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", address(account)));
        executor.addTask(init);
    }

    function test_removeTask_revertsIfNotInitialized() public {
        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", address(account)));
        executor.removeTask(TASK_ID_1);
    }

    // ─── name() and version() Tests ─────────────────────────────

    function test_name() public view {
        assertEq(executor.name(), "AutomationExecutor");
    }

    function test_version() public view {
        assertEq(executor.version(), "1.0.0");
    }

    // ─── H-3: Reentrancy Guard Tests ────────────────────────────

    function test_executeTask_reentrancy_reverts() public {
        ReentrantMockAccount reentrantAccount = new ReentrantMockAccount(address(executor));

        // Install with cooldown=0, maxExecutions=0 (allows re-entry path)
        AutomationExecutor.TaskInit[] memory inits = new AutomationExecutor.TaskInit[](1);
        inits[0] = AutomationExecutor.TaskInit({
            taskId: TASK_ID_1,
            caller: automationService,
            target: address(target),
            value: 0,
            callData: "",
            cooldown: 0,
            maxExecutions: 0
        });

        vm.prank(address(reentrantAccount));
        executor.onInstall(abi.encode(inits));

        // Set the reentrant task to call back
        reentrantAccount.setReentrantTaskId(TASK_ID_1);

        // Execute — the mock account will call back executeTask during execution
        vm.prank(automationService);
        vm.expectRevert(AutomationExecutor.ReentrantCall.selector);
        executor.executeTask(address(reentrantAccount), TASK_ID_1);
    }

    // ─── L-4: Uninstall Guard ───────────────────────────────────

    function test_onUninstall_notInitialized_reverts() public {
        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", address(account)));
        executor.onUninstall("");
    }

    // ─── L-7: TaskNotFound for non-existent task ────────────────

    function test_executeTask_nonExistent_revertsTaskNotFound() public {
        _installDefault();

        bytes32 nonExistent = keccak256("does-not-exist");
        vm.prank(automationService);
        vm.expectRevert(
            abi.encodeWithSelector(AutomationExecutor.TaskNotFound.selector, nonExistent)
        );
        executor.executeTask(address(account), nonExistent);
    }
}
