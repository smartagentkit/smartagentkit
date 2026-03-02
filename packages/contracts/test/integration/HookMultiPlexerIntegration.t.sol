// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "forge-std/Test.sol";
import { IERC7579Account } from "modulekit/accounts/common/interfaces/IERC7579Account.sol";
import { IERC7484 } from "modulekit/Interfaces.sol";
import {
    ModeLib,
    ModeCode,
    CALLTYPE_SINGLE,
    CALLTYPE_BATCH,
    CALLTYPE_DELEGATECALL,
    EXECTYPE_DEFAULT,
    MODE_DEFAULT,
    ModePayload
} from "modulekit/accounts/common/lib/ModeLib.sol";
import { ExecutionLib, Execution } from "modulekit/accounts/erc7579/lib/ExecutionLib.sol";
import { HookMultiPlexer } from "core-modules/HookMultiPlexer/HookMultiPlexer.sol";
import { SigHookInit, HookType } from "core-modules/HookMultiPlexer/DataTypes.sol";
import { SpendingLimitHook } from "../../src/modules/SpendingLimitHook.sol";
import { AllowlistHook } from "../../src/modules/AllowlistHook.sol";
import { EmergencyPauseHook } from "../../src/modules/EmergencyPauseHook.sol";
import { AutomationExecutor } from "../../src/modules/AutomationExecutor.sol";

/**
 * @title Mock registry that approves all modules (for testing)
 */
contract MockRegistry is IERC7484 {
    function check(address) external pure {}
    function checkForAccount(address, address) external pure {}
    function check(address, uint256) external pure {}
    function checkForAccount(address, address, uint256) external pure {}
    function check(address, address[] calldata, uint256) external pure {}
    function check(address, uint256, address[] calldata, uint256) external pure {}
    function trustAttesters(uint8, address[] calldata) external {}
}

/**
 * @title HookMultiPlexer Integration Test
 * @notice Tests all three hooks (SpendingLimit, Allowlist, EmergencyPause)
 *         working together through the HookMultiPlexer.
 *
 * @dev Since the HookMultiPlexer calls sub-hooks via low-level calls
 *      with TrustedForwarder appended data, this test verifies the
 *      hooks work correctly in that context.
 *
 *      We test the HookMultiPlexer directly (unit-level integration)
 *      rather than through the full account abstraction stack.
 *
 *      Trusted forwarder is set via onInstall init data (not separate calls).
 */
contract HookMultiPlexerIntegrationTest is Test {
    MockRegistry public registry;
    HookMultiPlexer public multiplexer;
    SpendingLimitHook public spendingLimit;
    AllowlistHook public allowlist;
    EmergencyPauseHook public emergencyPause;
    AutomationExecutor public automationExecutor;

    address public account = makeAddr("account");
    address public guardian = makeAddr("guardian");
    address public sender = makeAddr("sender");
    address public allowedTarget = makeAddr("allowedTarget");
    address public blockedTarget = makeAddr("blockedTarget");

    bytes4 constant TRANSFER_SELECTOR = 0xa9059cbb;
    bytes4 constant WILDCARD = bytes4(keccak256("WILDCARD")); // Updated sentinel

    function setUp() public {
        // Deploy mock registry and all contracts
        registry = new MockRegistry();
        multiplexer = new HookMultiPlexer(IERC7484(address(registry)));
        spendingLimit = new SpendingLimitHook();
        allowlist = new AllowlistHook();
        emergencyPause = new EmergencyPauseHook();
        automationExecutor = new AutomationExecutor();

        // 1. Install all three sub-hooks (passing multiplexer as trusted forwarder)
        _installSpendingLimit();
        _installAllowlist();
        _installEmergencyPause();

        // 2. Install HookMultiPlexer with all three as GLOBAL sub-hooks
        _installMultiplexer();

        // NOTE: No separate setTrustedForwarder calls needed — forwarder is set via onInstall
    }

    // ─── Setup Helpers ───────────────────────────────────────────

    function _installSpendingLimit() internal {
        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](1);
        limits[0] = SpendingLimitHook.TokenLimitInit({
            token: address(0), // Native ETH
            limit: 1 ether,
            windowDuration: 1 days
        });

        vm.prank(account);
        spendingLimit.onInstall(abi.encode(address(multiplexer), limits));
    }

    function _installAllowlist() internal {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({
            target: allowedTarget,
            selector: WILDCARD // All functions on allowedTarget
        });

        // Protected addresses: all hooks + multiplexer + automation executor
        address[] memory protectedAddresses = new address[](4);
        protectedAddresses[0] = address(spendingLimit);
        protectedAddresses[1] = address(emergencyPause);
        protectedAddresses[2] = address(multiplexer);
        protectedAddresses[3] = address(automationExecutor);

        vm.prank(account);
        allowlist.onInstall(abi.encode(address(multiplexer), uint8(0), perms, protectedAddresses)); // ALLOWLIST mode
    }

    function _installEmergencyPause() internal {
        vm.prank(account);
        emergencyPause.onInstall(abi.encode(address(multiplexer), guardian, uint48(0)));
    }

    function _installMultiplexer() internal {
        // Sort hooks by address (HookMultiPlexer requires sorted arrays)
        address[] memory globalHooks = _sortAddresses(
            address(spendingLimit),
            address(allowlist),
            address(emergencyPause)
        );

        address[] memory emptyAddresses = new address[](0);
        SigHookInit[] memory emptySigHooks = new SigHookInit[](0);

        bytes memory initData = abi.encode(
            globalHooks,        // GLOBAL hooks
            emptyAddresses,     // VALUE hooks
            emptyAddresses,     // DELEGATECALL hooks
            emptySigHooks,      // SIG hooks
            emptySigHooks       // TARGET_SIG hooks
        );

        vm.prank(account);
        multiplexer.onInstall(initData);
    }

    function _sortAddresses(address a, address b, address c) internal pure returns (address[] memory sorted) {
        sorted = new address[](3);
        sorted[0] = a;
        sorted[1] = b;
        sorted[2] = c;
        // Simple bubble sort for 3 elements
        if (sorted[0] > sorted[1]) (sorted[0], sorted[1]) = (sorted[1], sorted[0]);
        if (sorted[1] > sorted[2]) (sorted[1], sorted[2]) = (sorted[2], sorted[1]);
        if (sorted[0] > sorted[1]) (sorted[0], sorted[1]) = (sorted[1], sorted[0]);
    }

    function _buildSingleExecMsgData(
        address target,
        uint256 value,
        bytes memory callData
    ) internal pure returns (bytes memory) {
        ModeCode mode = ModeLib.encodeSimpleSingle();
        bytes memory execCalldata = ExecutionLib.encodeSingle(target, value, callData);
        return abi.encodeCall(IERC7579Account.execute, (mode, execCalldata));
    }

    // ─── Integration Tests ───────────────────────────────────────

    function test_allHooksInstalled() public view {
        assertTrue(spendingLimit.isInitialized(account));
        assertTrue(allowlist.isInitialized(account));
        assertTrue(emergencyPause.isInitialized(account));
        assertTrue(multiplexer.isInitialized(account));
    }

    function test_trustedForwardersSetCorrectly() public view {
        assertEq(spendingLimit.trustedForwarder(account), address(multiplexer));
        assertEq(allowlist.trustedForwarder(account), address(multiplexer));
        assertEq(emergencyPause.trustedForwarder(account), address(multiplexer));
    }

    function test_allowedTransaction_passesAllHooks() public {
        // Transaction to allowed target, within spending limit, not paused
        bytes memory msgData = _buildSingleExecMsgData(allowedTarget, 0.5 ether, "");

        vm.prank(account);
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_spendingLimitExceeded_blockedByMultiplexer() public {
        // Transaction exceeding spending limit
        bytes memory msgData = _buildSingleExecMsgData(allowedTarget, 2 ether, "");

        vm.prank(account);
        vm.expectRevert(); // SpendingLimitHook reverts, multiplexer wraps in SubHookPreCheckError
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_disallowedTarget_blockedByMultiplexer() public {
        // Transaction to target NOT in the allowlist
        bytes memory msgData = _buildSingleExecMsgData(blockedTarget, 0.1 ether, "");

        vm.prank(account);
        vm.expectRevert(); // AllowlistHook reverts
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_paused_blockedByMultiplexer() public {
        // Pause the account
        vm.prank(guardian);
        emergencyPause.pause(account);

        // Any transaction should be blocked
        bytes memory msgData = _buildSingleExecMsgData(allowedTarget, 0.1 ether, "");

        vm.prank(account);
        vm.expectRevert(); // EmergencyPauseHook reverts
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_unpause_thenTransaction_succeeds() public {
        // Pause
        vm.prank(guardian);
        emergencyPause.pause(account);

        // Unpause
        vm.prank(guardian);
        emergencyPause.unpause(account);

        // Should now succeed
        bytes memory msgData = _buildSingleExecMsgData(allowedTarget, 0.5 ether, "");

        vm.prank(account);
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_multipleTx_cumulativeSpendingTracked() public {
        // Tx 1: 0.4 ETH
        bytes memory msgData1 = _buildSingleExecMsgData(allowedTarget, 0.4 ether, "");
        vm.prank(account);
        multiplexer.preCheck(sender, 0, msgData1);

        // Tx 2: 0.4 ETH (cumulative 0.8 ETH < 1 ETH limit)
        bytes memory msgData2 = _buildSingleExecMsgData(allowedTarget, 0.4 ether, "");
        vm.prank(account);
        multiplexer.preCheck(sender, 0, msgData2);

        // Tx 3: 0.3 ETH (cumulative 1.1 ETH > 1 ETH limit)
        bytes memory msgData3 = _buildSingleExecMsgData(allowedTarget, 0.3 ether, "");
        vm.prank(account);
        vm.expectRevert(); // SpendingLimit exceeded
        multiplexer.preCheck(sender, 0, msgData3);
    }

    function test_windowReset_allowsNewSpending() public {
        // Spend full limit
        bytes memory msgData = _buildSingleExecMsgData(allowedTarget, 1 ether, "");
        vm.prank(account);
        multiplexer.preCheck(sender, 0, msgData);

        // Fast-forward past window
        vm.warp(block.timestamp + 1 days + 1);

        // Should succeed — window reset
        vm.prank(account);
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_fullLifecycle() public {
        // 1. Normal transaction — succeeds
        bytes memory msgData = _buildSingleExecMsgData(allowedTarget, 0.5 ether, "");
        vm.prank(account);
        multiplexer.preCheck(sender, 0, msgData);

        // 2. Over-spend — blocked by SpendingLimit
        bytes memory overMsgData = _buildSingleExecMsgData(allowedTarget, 0.6 ether, "");
        vm.prank(account);
        vm.expectRevert();
        multiplexer.preCheck(sender, 0, overMsgData);

        // 3. Wrong target — blocked by Allowlist
        bytes memory wrongTargetMsgData = _buildSingleExecMsgData(blockedTarget, 0.1 ether, "");
        vm.prank(account);
        vm.expectRevert();
        multiplexer.preCheck(sender, 0, wrongTargetMsgData);

        // 4. Pause — all blocked
        vm.prank(guardian);
        emergencyPause.pause(account);

        bytes memory pausedMsgData = _buildSingleExecMsgData(allowedTarget, 0.1 ether, "");
        vm.prank(account);
        vm.expectRevert();
        multiplexer.preCheck(sender, 0, pausedMsgData);

        // 5. Unpause — can transact again (within limit)
        vm.prank(guardian);
        emergencyPause.unpause(account);

        bytes memory resumedMsgData = _buildSingleExecMsgData(allowedTarget, 0.3 ether, "");
        vm.prank(account);
        multiplexer.preCheck(sender, 0, resumedMsgData);
    }

    // ─── Cross-Module Protection Tests ──────────────────────────

    function test_crossModuleProtection_blocksEmergencyPauseAdmin() public {
        // Agent tries to call EmergencyPauseHook.setGuardian via a UserOp
        bytes memory callData = abi.encodeWithSelector(
            EmergencyPauseHook.setGuardian.selector,
            makeAddr("maliciousGuardian")
        );
        bytes memory msgData = _buildSingleExecMsgData(address(emergencyPause), 0, callData);

        vm.prank(account);
        vm.expectRevert(); // AllowlistHook blocks: ProtectedTargetBlocked
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_crossModuleProtection_blocksAutomationExecutorAdmin() public {
        // Agent tries to call AutomationExecutor.removeTask via a UserOp
        bytes memory callData = abi.encodeWithSelector(
            AutomationExecutor.removeTask.selector,
            bytes32(uint256(1))
        );
        bytes memory msgData = _buildSingleExecMsgData(address(automationExecutor), 0, callData);

        vm.prank(account);
        vm.expectRevert(); // AllowlistHook blocks: ProtectedTargetBlocked
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_crossModuleProtection_blocksMultiplexerManagement() public {
        // Agent tries to call multiplexer.removeHook to remove the allowlist itself
        // HookMultiPlexer.removeHook(address hook, HookType hookType)
        bytes memory callData = abi.encodeWithSelector(
            HookMultiPlexer.removeHook.selector,
            address(allowlist),
            HookType.GLOBAL
        );
        bytes memory msgData = _buildSingleExecMsgData(address(multiplexer), 0, callData);

        vm.prank(account);
        vm.expectRevert(); // AllowlistHook blocks: ProtectedTargetBlocked
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_crossModuleProtection_blocksSetTrustedForwarderOnEmergencyPause() public {
        // Agent tries to call setTrustedForwarder on EmergencyPauseHook
        bytes memory callData = abi.encodeWithSelector(
            bytes4(keccak256("setTrustedForwarder(address)")),
            address(0)
        );
        bytes memory msgData = _buildSingleExecMsgData(address(emergencyPause), 0, callData);

        vm.prank(account);
        vm.expectRevert(); // Blocked by AllowlistHook protectedTargets AND EmergencyPauseHook self-call blocking
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_emergencyPause_blocksDelegatecall() public {
        // Build a delegatecall mode execution
        ModeCode mode = ModeLib.encode({
            callType: CALLTYPE_DELEGATECALL,
            execType: EXECTYPE_DEFAULT,
            mode: MODE_DEFAULT,
            payload: ModePayload.wrap(bytes22(0))
        });
        bytes memory execCalldata = ExecutionLib.encodeSingle(allowedTarget, 0, "");
        bytes memory msgData = abi.encodeCall(IERC7579Account.execute, (mode, execCalldata));

        vm.prank(account);
        vm.expectRevert(); // At least one hook blocks delegatecall
        multiplexer.preCheck(sender, 0, msgData);
    }

    function test_emergencyPause_blocksModuleManagement() public {
        // Agent tries to install a malicious module
        bytes memory msgData = abi.encodeCall(
            IERC7579Account.installModule,
            (1, makeAddr("maliciousValidator"), "")
        );

        vm.prank(account);
        vm.expectRevert(); // Blocked by module management blocking in hooks
        multiplexer.preCheck(sender, 0, msgData);
    }
}
