// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "forge-std/Test.sol";
import { IERC7579Account } from "modulekit/accounts/common/interfaces/IERC7579Account.sol";
import {
    ModeLib,
    ModeCode,
    CALLTYPE_DELEGATECALL,
    EXECTYPE_DEFAULT,
    MODE_DEFAULT,
    ModePayload
} from "modulekit/accounts/common/lib/ModeLib.sol";
import { ExecutionLib } from "modulekit/accounts/erc7579/lib/ExecutionLib.sol";
import { EmergencyPauseHook } from "../../src/modules/EmergencyPauseHook.sol";

contract EmergencyPauseHookTest is Test {
    EmergencyPauseHook public hook;

    address public account = makeAddr("account");
    address public guardian = makeAddr("guardian");
    address public notGuardian = makeAddr("notGuardian");
    address public sender = makeAddr("sender");
    address public recipient = makeAddr("recipient");

    function setUp() public {
        hook = new EmergencyPauseHook();
    }

    // ─── Helpers ──────────────────────────────────────────────────

    function _installDefault() internal {
        vm.prank(account);
        hook.onInstall(abi.encode(address(0), guardian, uint48(0))); // No auto-unpause
    }

    function _installWithAutoUnpause(uint48 timeout) internal {
        vm.prank(account);
        hook.onInstall(abi.encode(address(0), guardian, timeout));
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

    // ─── Installation Tests ──────────────────────────────────────

    function test_onInstall_setsConfig() public {
        _installDefault();

        assertTrue(hook.isInitialized(account));

        (
            address storedGuardian,
            uint48 autoUnpauseAfter,
            bool paused,
            uint48 pausedAt,
            bool initialized,
            uint48 lastUnpausedAt
        ) = hook.pauseConfigs(account);

        assertEq(storedGuardian, guardian);
        assertEq(autoUnpauseAfter, 0);
        assertFalse(paused);
        assertEq(pausedAt, 0);
        assertTrue(initialized);
        assertEq(lastUnpausedAt, 0);
    }

    function test_onInstall_revertsIfAlreadyInitialized() public {
        _installDefault();

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("ModuleAlreadyInitialized(address)", account));
        hook.onInstall(abi.encode(address(0), guardian, uint48(0)));
    }

    function test_onInstall_revertsIfGuardianIsZero() public {
        vm.prank(account);
        vm.expectRevert(EmergencyPauseHook.GuardianCannotBeZero.selector);
        hook.onInstall(abi.encode(address(0), address(0), uint48(0)));
    }

    function test_onInstall_setsTrustedForwarder() public {
        address multiplexer = makeAddr("multiplexer");

        vm.prank(account);
        hook.onInstall(abi.encode(multiplexer, guardian, uint48(0)));

        assertEq(hook.trustedForwarder(account), multiplexer);
    }

    function test_onUninstall_clearsState() public {
        _installDefault();
        assertTrue(hook.isInitialized(account));

        vm.prank(account);
        hook.onUninstall("");

        assertFalse(hook.isInitialized(account));
    }

    function test_onUninstall_clearsTrustedForwarder() public {
        address multiplexer = makeAddr("multiplexer");

        vm.prank(account);
        hook.onInstall(abi.encode(multiplexer, guardian, uint48(0)));
        assertEq(hook.trustedForwarder(account), multiplexer);

        vm.prank(account);
        hook.onUninstall("");
        assertEq(hook.trustedForwarder(account), address(0));
    }

    function test_onUninstall_emitsEvent() public {
        _installDefault();

        vm.expectEmit(true, false, false, false);
        emit EmergencyPauseHook.ModuleUninstalled(account);

        vm.prank(account);
        hook.onUninstall("");
    }

    function test_isModuleType() public view {
        assertTrue(hook.isModuleType(4)); // TYPE_HOOK
        assertFalse(hook.isModuleType(1));
    }

    // ─── Pause / Unpause Tests ───────────────────────────────────

    function test_pause_setsState() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        assertTrue(hook.isPaused(account));
    }

    function test_pause_onlyGuardian() public {
        _installDefault();

        vm.prank(notGuardian);
        vm.expectRevert(
            abi.encodeWithSelector(EmergencyPauseHook.OnlyGuardian.selector, notGuardian, guardian)
        );
        hook.pause(account);
    }

    function test_pause_revertsIfAlreadyPaused() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPauseHook.AlreadyPaused.selector, account));
        hook.pause(account);
    }

    function test_pause_revertsIfNotInitialized() public {
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", account));
        hook.pause(account);
    }

    function test_unpause_clearsState() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        vm.prank(guardian);
        hook.unpause(account);

        assertFalse(hook.isPaused(account));
    }

    function test_unpause_onlyGuardian() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        vm.prank(notGuardian);
        vm.expectRevert(
            abi.encodeWithSelector(EmergencyPauseHook.OnlyGuardian.selector, notGuardian, guardian)
        );
        hook.unpause(account);
    }

    function test_unpause_revertsIfNotPaused() public {
        _installDefault();

        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPauseHook.NotPaused.selector, account));
        hook.unpause(account);
    }

    // ─── Hook Logic Tests ────────────────────────────────────────

    function test_preCheck_notPaused_succeeds() public {
        _installDefault();

        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    function test_preCheck_paused_reverts() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPauseHook.WalletPaused.selector, account));
        hook.preCheck(sender, 0, msgData);
    }

    function test_preCheck_pausedThenUnpaused_succeeds() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        vm.prank(guardian);
        hook.unpause(account);

        // Need to wait for cooldown before re-testing (but we're testing unpause path here)
        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    function test_preCheck_notInitialized_reverts() public {
        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", account));
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Auto-Unpause Tests ──────────────────────────────────────

    function test_autoUnpause_beforeTimeout_stillPaused() public {
        _installWithAutoUnpause(1 hours);

        vm.prank(guardian);
        hook.pause(account);

        // 30 minutes later — still paused
        vm.warp(block.timestamp + 30 minutes);

        assertTrue(hook.isPaused(account));

        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPauseHook.WalletPaused.selector, account));
        hook.preCheck(sender, 0, msgData);
    }

    function test_autoUnpause_afterTimeout_unpauses() public {
        _installWithAutoUnpause(1 hours);

        vm.prank(guardian);
        hook.pause(account);

        // 1 hour + 1 second later
        vm.warp(block.timestamp + 1 hours + 1);

        assertFalse(hook.isPaused(account));

        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    function test_autoUnpause_exactTimeout_unpauses() public {
        _installWithAutoUnpause(1 hours);

        uint256 pauseTime = block.timestamp;
        vm.prank(guardian);
        hook.pause(account);

        // Exactly at timeout
        vm.warp(pauseTime + 1 hours);

        assertFalse(hook.isPaused(account));
    }

    function test_autoUnpause_disabledWhenZero() public {
        _installDefault(); // autoUnpauseAfter = 0

        vm.prank(guardian);
        hook.pause(account);

        // Even after a very long time, still paused
        vm.warp(block.timestamp + 365 days);

        assertTrue(hook.isPaused(account));
    }

    // ─── Pause Cooldown Tests ────────────────────────────────────

    function test_pause_afterUnpause_withinCooldown_reverts() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        vm.prank(guardian);
        hook.unpause(account);

        // Try to re-pause immediately — should fail due to cooldown
        vm.prank(guardian);
        vm.expectRevert(); // PauseCooldownActive
        hook.pause(account);
    }

    function test_pause_afterUnpause_afterCooldown_succeeds() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        vm.prank(guardian);
        hook.unpause(account);

        // Wait past cooldown (1 hour)
        vm.warp(block.timestamp + 1 hours + 1);

        // Re-pause should succeed
        vm.prank(guardian);
        hook.pause(account);

        assertTrue(hook.isPaused(account));
    }

    function test_pause_afterAutoUnpause_withinCooldown_reverts() public {
        _installWithAutoUnpause(1 hours);

        vm.prank(guardian);
        hook.pause(account);

        // Wait for auto-unpause
        vm.warp(block.timestamp + 1 hours);

        // Try to re-pause immediately — auto-unpause sets lastUnpausedAt,
        // so pause() will clear stale state and then check cooldown
        vm.prank(guardian);
        vm.expectRevert(); // PauseCooldownActive
        hook.pause(account);
    }

    function test_pause_afterAutoUnpauseExpired_succeeds() public {
        _installWithAutoUnpause(30 minutes);

        vm.prank(guardian);
        hook.pause(account);

        // Wait for auto-unpause to expire
        vm.warp(block.timestamp + 30 minutes);

        // Trigger auto-unpause via preCheck (sets lastUnpausedAt)
        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        assertFalse(hook.isPaused(account));

        // Wait for cooldown to elapse
        vm.warp(block.timestamp + 1 hours + 1);

        // Re-pause should succeed now
        vm.prank(guardian);
        hook.pause(account);

        assertTrue(hook.isPaused(account));
    }

    // ─── Guardian Rotation Tests ────────────────────────────────

    function test_rotateGuardian_byGuardian_succeeds() public {
        _installDefault();

        address newGuardian = makeAddr("newGuardian");
        vm.prank(guardian);
        hook.rotateGuardian(account, newGuardian);

        (address storedGuardian,,,,,) = hook.pauseConfigs(account);
        assertEq(storedGuardian, newGuardian);
    }

    function test_rotateGuardian_byNonGuardian_reverts() public {
        _installDefault();

        vm.prank(notGuardian);
        vm.expectRevert(
            abi.encodeWithSelector(EmergencyPauseHook.OnlyGuardian.selector, notGuardian, guardian)
        );
        hook.rotateGuardian(account, makeAddr("newGuardian"));
    }

    function test_rotateGuardian_whilePaused_succeeds() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        assertTrue(hook.isPaused(account));

        address newGuardian = makeAddr("newGuardian");
        vm.prank(guardian);
        hook.rotateGuardian(account, newGuardian);

        (address storedGuardian,,,,,) = hook.pauseConfigs(account);
        assertEq(storedGuardian, newGuardian);
    }

    function test_rotateGuardian_zeroAddress_reverts() public {
        _installDefault();

        vm.prank(guardian);
        vm.expectRevert(EmergencyPauseHook.GuardianCannotBeZero.selector);
        hook.rotateGuardian(account, address(0));
    }

    function test_rotateGuardian_newGuardianCanUnpause() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        address newGuardian = makeAddr("newGuardian");
        vm.prank(guardian);
        hook.rotateGuardian(account, newGuardian);

        // Old guardian cannot unpause
        vm.prank(guardian);
        vm.expectRevert();
        hook.unpause(account);

        // New guardian can unpause
        vm.prank(newGuardian);
        hook.unpause(account);

        assertFalse(hook.isPaused(account));
    }

    // ─── Configuration Tests ─────────────────────────────────────

    function test_setGuardian_updatesGuardian() public {
        _installDefault();

        address newGuardian = makeAddr("newGuardian");
        vm.prank(account);
        hook.setGuardian(newGuardian);

        (address storedGuardian,,,,,) = hook.pauseConfigs(account);
        assertEq(storedGuardian, newGuardian);
    }

    function test_setGuardian_revertsOnZero() public {
        _installDefault();

        vm.prank(account);
        vm.expectRevert(EmergencyPauseHook.GuardianCannotBeZero.selector);
        hook.setGuardian(address(0));
    }

    function test_setGuardian_revertsIfNotInitialized() public {
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", account));
        hook.setGuardian(makeAddr("newGuardian"));
    }

    function test_setAutoUnpauseTimeout_updatesTimeout() public {
        _installDefault();

        vm.prank(account);
        hook.setAutoUnpauseTimeout(2 hours);

        (, uint48 autoUnpauseAfter,,,,) = hook.pauseConfigs(account);
        assertEq(autoUnpauseAfter, 2 hours);
    }

    function test_newGuardian_canPause() public {
        _installDefault();

        address newGuardian = makeAddr("newGuardian");
        vm.prank(account);
        hook.setGuardian(newGuardian);

        // Old guardian can no longer pause
        vm.prank(guardian);
        vm.expectRevert();
        hook.pause(account);

        // New guardian can pause
        vm.prank(newGuardian);
        hook.pause(account);

        assertTrue(hook.isPaused(account));
    }

    // ─── Fuzz Tests ──────────────────────────────────────────────

    function testFuzz_autoUnpause_timeout(uint48 timeout) public {
        vm.assume(timeout > 0 && timeout < 365 days);

        _installWithAutoUnpause(timeout);

        uint256 pauseTime = block.timestamp;
        vm.prank(guardian);
        hook.pause(account);

        // Before timeout — still paused
        vm.warp(pauseTime + timeout - 1);
        assertTrue(hook.isPaused(account));

        // At timeout — unpaused
        vm.warp(pauseTime + timeout);
        assertFalse(hook.isPaused(account));
    }

    function testFuzz_onlyGuardian_canPause(address caller) public {
        vm.assume(caller != guardian);
        _installDefault();

        vm.prank(caller);
        vm.expectRevert();
        hook.pause(account);
    }

    function testFuzz_onlyGuardian_canUnpause(address caller) public {
        vm.assume(caller != guardian);
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        vm.prank(caller);
        vm.expectRevert();
        hook.unpause(account);
    }

    function testFuzz_pauseBlocks_anyTransaction(
        address target,
        uint256 value,
        bytes calldata data
    ) public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        bytes memory msgData = _buildSingleExecMsgData(target, value, data);
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPauseHook.WalletPaused.selector, account));
        hook.preCheck(sender, 0, msgData);
    }

    // ─── name() and version() Tests ─────────────────────────────

    function test_name() public view {
        assertEq(hook.name(), "EmergencyPauseHook");
    }

    function test_version() public view {
        assertEq(hook.version(), "1.0.0");
    }

    // ─── H-1: Block Admin Functions While Paused ────────────────

    function test_setGuardian_whilePaused_reverts() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPauseHook.WalletPaused.selector, account));
        hook.setGuardian(makeAddr("newGuardian"));
    }

    function test_setAutoUnpauseTimeout_whilePaused_reverts() public {
        _installDefault();

        vm.prank(guardian);
        hook.pause(account);

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPauseHook.WalletPaused.selector, account));
        hook.setAutoUnpauseTimeout(2 hours);
    }

    // ─── M-6: Stale Auto-Unpause in unpause() ──────────────────

    function test_unpause_staleAutoUnpause_revertsNotPaused() public {
        _installWithAutoUnpause(1 hours);

        vm.prank(guardian);
        hook.pause(account);

        // Warp past auto-unpause timeout
        vm.warp(block.timestamp + 1 hours + 1);

        // Guardian calls unpause — should clear stale state, then revert NotPaused
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPauseHook.NotPaused.selector, account));
        hook.unpause(account);
    }

    // ─── L-4: Uninstall Guard ───────────────────────────────────

    function test_onUninstall_notInitialized_reverts() public {
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", account));
        hook.onUninstall("");
    }

    // ─── L-5: ModuleInstalled Event ─────────────────────────────

    function test_onInstall_emitsModuleInstalledEvent() public {
        vm.expectEmit(true, true, false, true);
        emit EmergencyPauseHook.ModuleInstalled(account, guardian, 0);

        vm.prank(account);
        hook.onInstall(abi.encode(address(0), guardian, uint48(0)));
    }

    // ─── L-6: Auto-Unpause Cap ──────────────────────────────────

    function test_setAutoUnpauseTimeout_exceedsMax_reverts() public {
        _installDefault();

        uint48 tooLong = uint48(366 days);
        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(EmergencyPauseHook.AutoUnpauseTooLong.selector, tooLong, uint48(365 days))
        );
        hook.setAutoUnpauseTimeout(tooLong);
    }

    function test_onInstall_autoUnpauseExceedsMax_reverts() public {
        uint48 tooLong = uint48(366 days);
        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(EmergencyPauseHook.AutoUnpauseTooLong.selector, tooLong, uint48(365 days))
        );
        hook.onInstall(abi.encode(address(0), guardian, tooLong));
    }

    // ─── L-1: Stale Auto-Unpause in setGuardian/setAutoUnpauseTimeout ──

    function test_setGuardian_afterAutoUnpauseExpired_succeeds() public {
        _installWithAutoUnpause(1 hours);

        vm.prank(guardian);
        hook.pause(account);

        // Warp past auto-unpause timeout
        vm.warp(block.timestamp + 1 hours + 1);

        // setGuardian should lazily clear the stale pause and succeed
        address newGuardian = makeAddr("newGuardian2");
        vm.prank(account);
        hook.setGuardian(newGuardian);

        // Verify guardian was changed
        (address storedGuardian,,,,,) = hook.pauseConfigs(account);
        assertEq(storedGuardian, newGuardian);
        // Verify account is no longer paused
        assertFalse(hook.isPaused(account));
    }

    function test_setAutoUnpauseTimeout_afterAutoUnpauseExpired_succeeds() public {
        _installWithAutoUnpause(1 hours);

        vm.prank(guardian);
        hook.pause(account);

        // Warp past auto-unpause timeout
        vm.warp(block.timestamp + 1 hours + 1);

        // setAutoUnpauseTimeout should lazily clear and succeed
        vm.prank(account);
        hook.setAutoUnpauseTimeout(2 hours);

        // Verify timeout was changed
        (, uint48 autoUnpause,,,,) = hook.pauseConfigs(account);
        assertEq(autoUnpause, uint48(2 hours));
        assertFalse(hook.isPaused(account));
    }

    function test_setGuardian_stillPaused_beforeAutoUnpause_reverts() public {
        _installWithAutoUnpause(2 hours);

        vm.prank(guardian);
        hook.pause(account);

        // Warp to 1 hour — still within the 2-hour auto-unpause window
        vm.warp(block.timestamp + 1 hours);

        // Should still revert because pause is active
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPauseHook.WalletPaused.selector, account));
        hook.setGuardian(makeAddr("newGuardian3"));
    }

    // ─── SC-2: Self-Call Blocking (HookDestruct) ────────────────

    function test_selfCall_setGuardian_blocked() public {
        _installDefault();

        // Agent tries to call EmergencyPauseHook.setGuardian via UserOp
        bytes memory callData = abi.encodeWithSelector(
            EmergencyPauseHook.setGuardian.selector,
            makeAddr("maliciousGuardian")
        );
        bytes memory msgData = _buildSingleExecMsgData(address(hook), 0, callData);

        vm.prank(account);
        vm.expectRevert(EmergencyPauseHook.SelfCallBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_selfCall_setAutoUnpauseTimeout_blocked() public {
        _installDefault();

        bytes memory callData = abi.encodeWithSelector(
            EmergencyPauseHook.setAutoUnpauseTimeout.selector,
            uint48(0)
        );
        bytes memory msgData = _buildSingleExecMsgData(address(hook), 0, callData);

        vm.prank(account);
        vm.expectRevert(EmergencyPauseHook.SelfCallBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_selfCall_setTrustedForwarder_blocked() public {
        _installDefault();

        bytes memory callData = abi.encodeWithSelector(
            bytes4(keccak256("setTrustedForwarder(address)")),
            address(0)
        );
        bytes memory msgData = _buildSingleExecMsgData(address(hook), 0, callData);

        vm.prank(account);
        vm.expectRevert(EmergencyPauseHook.SelfCallBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_selfCall_clearTrustedForwarder_blocked() public {
        _installDefault();

        bytes memory callData = abi.encodeWithSelector(
            bytes4(keccak256("clearTrustedForwarder()"))
        );
        bytes memory msgData = _buildSingleExecMsgData(address(hook), 0, callData);

        vm.prank(account);
        vm.expectRevert(EmergencyPauseHook.SelfCallBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── SC-2: Delegatecall Blocking ────────────────────────────

    function test_delegatecall_blocked() public {
        _installDefault();

        // Build delegatecall mode msgData
        ModeCode mode = ModeLib.encode({
            callType: CALLTYPE_DELEGATECALL,
            execType: EXECTYPE_DEFAULT,
            mode: MODE_DEFAULT,
            payload: ModePayload.wrap(bytes22(0))
        });
        bytes memory execCalldata = ExecutionLib.encodeSingle(recipient, 0, "");
        bytes memory msgData = abi.encodeCall(IERC7579Account.execute, (mode, execCalldata));

        vm.prank(account);
        vm.expectRevert(EmergencyPauseHook.DelegateCallNotAllowed.selector);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── SC-2: Module Management Blocking ───────────────────────

    function test_moduleInstall_blocked() public {
        _installDefault();

        // Build installModule msgData
        bytes memory msgData = abi.encodeCall(
            IERC7579Account.installModule,
            (1, makeAddr("maliciousModule"), "")
        );

        vm.prank(account);
        vm.expectRevert(EmergencyPauseHook.ModuleManagementBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_moduleUninstall_blocked() public {
        _installDefault();

        bytes memory msgData = abi.encodeCall(
            IERC7579Account.uninstallModule,
            (1, makeAddr("someModule"), "")
        );

        vm.prank(account);
        vm.expectRevert(EmergencyPauseHook.ModuleManagementBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }
}
