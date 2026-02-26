// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "forge-std/Test.sol";
import { IERC7579Account } from "modulekit/accounts/common/interfaces/IERC7579Account.sol";
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
import { SpendingLimitHook } from "../../src/modules/SpendingLimitHook.sol";

contract SpendingLimitHookTest is Test {
    SpendingLimitHook public hook;

    address public account = makeAddr("account");
    address public sender = makeAddr("sender");
    address public tokenA = makeAddr("tokenA");
    address public tokenB = makeAddr("tokenB");
    address public recipient = makeAddr("recipient");
    address constant NATIVE_TOKEN = address(0);

    // ERC-20 selectors
    bytes4 constant TRANSFER_SELECTOR = 0xa9059cbb;
    bytes4 constant APPROVE_SELECTOR = 0x095ea7b3;

    function setUp() public {
        hook = new SpendingLimitHook();
    }

    // ─── Helpers ──────────────────────────────────────────────────

    function _installDefault() internal {
        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](2);
        limits[0] = SpendingLimitHook.TokenLimitInit({
            token: NATIVE_TOKEN,
            limit: 1 ether,
            windowDuration: 1 days
        });
        limits[1] = SpendingLimitHook.TokenLimitInit({
            token: tokenA,
            limit: 1000e18,
            windowDuration: 1 hours
        });

        vm.prank(account);
        hook.onInstall(abi.encode(address(0), limits));
    }

    /// @dev Build the msgData that the account sends for a single execution
    function _buildSingleExecMsgData(
        address target,
        uint256 value,
        bytes memory callData
    ) internal pure returns (bytes memory) {
        ModeCode mode = ModeLib.encodeSimpleSingle();
        bytes memory execCalldata = ExecutionLib.encodeSingle(target, value, callData);
        return abi.encodeCall(IERC7579Account.execute, (mode, execCalldata));
    }

    /// @dev Build the msgData for a batch execution
    function _buildBatchExecMsgData(
        Execution[] memory execs
    ) internal pure returns (bytes memory) {
        ModeCode mode = ModeLib.encodeSimpleBatch();
        bytes memory execCalldata = ExecutionLib.encodeBatch(execs);
        return abi.encodeCall(IERC7579Account.execute, (mode, execCalldata));
    }

    /// @dev Build the msgData for a delegatecall execution
    function _buildDelegateCallMsgData(
        address target,
        bytes memory callData
    ) internal pure returns (bytes memory) {
        ModeCode mode = ModeLib.encode(
            CALLTYPE_DELEGATECALL, EXECTYPE_DEFAULT, MODE_DEFAULT, ModePayload.wrap(bytes22(0))
        );
        bytes memory execCalldata = abi.encodePacked(target, callData);
        return abi.encodeCall(IERC7579Account.execute, (mode, execCalldata));
    }

    /// @dev Build ERC-20 transfer calldata
    function _buildTransferCalldata(address to, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(TRANSFER_SELECTOR, to, amount);
    }

    /// @dev Build ERC-20 approve calldata
    function _buildApproveCalldata(address spender, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(APPROVE_SELECTOR, spender, amount);
    }

    // ─── Installation Tests ──────────────────────────────────────

    function test_onInstall_setsConfig() public {
        _installDefault();

        assertTrue(hook.isInitialized(account));

        (uint256 limit, uint256 spent, uint48 windowDuration, uint48 windowStart) =
            hook.configs(account, NATIVE_TOKEN);
        assertEq(limit, 1 ether);
        assertEq(spent, 0);
        assertEq(windowDuration, 1 days);
        assertGt(windowStart, 0);
    }

    function test_onInstall_revertsIfAlreadyInitialized() public {
        _installDefault();

        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](1);
        limits[0] = SpendingLimitHook.TokenLimitInit({ token: NATIVE_TOKEN, limit: 1 ether, windowDuration: 1 hours });
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("ModuleAlreadyInitialized(address)", account));
        hook.onInstall(abi.encode(address(0), limits));
    }

    function test_onInstall_revertsOnZeroLimit() public {
        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](1);
        limits[0] = SpendingLimitHook.TokenLimitInit({
            token: NATIVE_TOKEN,
            limit: 0,
            windowDuration: 1 hours
        });

        vm.prank(account);
        vm.expectRevert(SpendingLimitHook.LimitCannotBeZero.selector);
        hook.onInstall(abi.encode(address(0), limits));
    }

    function test_onInstall_revertsOnShortWindow() public {
        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](1);
        limits[0] = SpendingLimitHook.TokenLimitInit({
            token: NATIVE_TOKEN,
            limit: 1 ether,
            windowDuration: 30 // Less than 60s minimum
        });

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(SpendingLimitHook.WindowDurationTooShort.selector, 30, 60));
        hook.onInstall(abi.encode(address(0), limits));
    }

    function test_onInstall_emptyLimits_reverts() public {
        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](0);

        vm.prank(account);
        vm.expectRevert(SpendingLimitHook.NoLimitsProvided.selector);
        hook.onInstall(abi.encode(address(0), limits));
    }

    function test_onInstall_setsTrustedForwarder() public {
        address multiplexer = makeAddr("multiplexer");
        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](1);
        limits[0] = SpendingLimitHook.TokenLimitInit({ token: NATIVE_TOKEN, limit: 1 ether, windowDuration: 1 hours });

        vm.prank(account);
        hook.onInstall(abi.encode(multiplexer, limits));

        assertEq(hook.trustedForwarder(account), multiplexer);
    }

    function test_onUninstall_clearsState() public {
        _installDefault();
        assertTrue(hook.isInitialized(account));

        vm.prank(account);
        hook.onUninstall("");

        assertFalse(hook.isInitialized(account));
        (uint256 limit,,,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(limit, 0);
    }

    function test_onUninstall_clearsTrustedForwarder() public {
        address multiplexer = makeAddr("multiplexer");
        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](1);
        limits[0] = SpendingLimitHook.TokenLimitInit({ token: NATIVE_TOKEN, limit: 1 ether, windowDuration: 1 hours });

        vm.prank(account);
        hook.onInstall(abi.encode(multiplexer, limits));
        assertEq(hook.trustedForwarder(account), multiplexer);

        vm.prank(account);
        hook.onUninstall("");
        assertEq(hook.trustedForwarder(account), address(0));
    }

    function test_isModuleType() public view {
        assertTrue(hook.isModuleType(4)); // TYPE_HOOK = 4
        assertFalse(hook.isModuleType(1)); // Not a validator
    }

    // ─── Native ETH Transfer Tests ──────────────────────────────

    function test_nativeTransfer_withinLimit_succeeds() public {
        _installDefault();

        bytes memory msgData = _buildSingleExecMsgData(recipient, 0.5 ether, "");

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        // Check spent amount
        (, uint256 spent,,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(spent, 0.5 ether);
    }

    function test_nativeTransfer_exactLimit_succeeds() public {
        _installDefault();

        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        (, uint256 spent,,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(spent, 1 ether);
    }

    function test_nativeTransfer_exceedsLimit_reverts() public {
        _installDefault();

        bytes memory msgData = _buildSingleExecMsgData(recipient, 1.5 ether, "");

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendingLimitHook.SpendingLimitExceeded.selector,
                NATIVE_TOKEN,
                1.5 ether,
                1 ether
            )
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_nativeTransfer_cumulativeExceedsLimit_reverts() public {
        _installDefault();

        // First transfer: 0.6 ETH
        bytes memory msgData1 = _buildSingleExecMsgData(recipient, 0.6 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData1);

        // Second transfer: 0.5 ETH (cumulative 1.1 ETH > 1 ETH limit)
        bytes memory msgData2 = _buildSingleExecMsgData(recipient, 0.5 ether, "");
        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendingLimitHook.SpendingLimitExceeded.selector,
                NATIVE_TOKEN,
                0.5 ether,
                0.4 ether
            )
        );
        hook.preCheck(sender, 0, msgData2);
    }

    // ─── ERC-20 Transfer Tests ───────────────────────────────────

    function test_erc20Transfer_withinLimit_succeeds() public {
        _installDefault();

        bytes memory transferData = _buildTransferCalldata(recipient, 500e18);
        bytes memory msgData = _buildSingleExecMsgData(tokenA, 0, transferData);

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        (, uint256 spent,,) = hook.configs(account, tokenA);
        assertEq(spent, 500e18);
    }

    function test_erc20Transfer_exceedsLimit_reverts() public {
        _installDefault();

        bytes memory transferData = _buildTransferCalldata(recipient, 1500e18);
        bytes memory msgData = _buildSingleExecMsgData(tokenA, 0, transferData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendingLimitHook.SpendingLimitExceeded.selector,
                tokenA,
                1500e18,
                1000e18
            )
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_erc20Approve_tracksSpend() public {
        _installDefault();

        bytes memory approveData = _buildApproveCalldata(recipient, 800e18);
        bytes memory msgData = _buildSingleExecMsgData(tokenA, 0, approveData);

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        (, uint256 spent,,) = hook.configs(account, tokenA);
        assertEq(spent, 800e18);
    }

    // ─── Rolling Window Tests ────────────────────────────────────

    function test_windowExpiry_resetsCounter() public {
        _installDefault();

        // Spend the full limit
        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        // Verify at limit
        assertEq(hook.getRemainingAllowance(account, NATIVE_TOKEN), 0);

        // Fast-forward past the window
        vm.warp(block.timestamp + 1 days + 1);

        // Should be able to spend again
        assertEq(hook.getRemainingAllowance(account, NATIVE_TOKEN), 1 ether);

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        (, uint256 spent,,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(spent, 1 ether);
    }

    function test_windowNotExpired_maintainsCounter() public {
        _installDefault();

        bytes memory msgData = _buildSingleExecMsgData(recipient, 0.5 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        // Fast-forward but NOT past window
        vm.warp(block.timestamp + 12 hours);

        // Counter should still be 0.5 ETH
        assertEq(hook.getRemainingAllowance(account, NATIVE_TOKEN), 0.5 ether);
    }

    // ─── Multiple Token Tests ────────────────────────────────────

    function test_multipleTokens_independentLimits() public {
        _installDefault();

        // Spend ETH
        bytes memory ethMsgData = _buildSingleExecMsgData(recipient, 0.9 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, ethMsgData);

        // Spend token A — should be independent
        bytes memory transferData = _buildTransferCalldata(recipient, 900e18);
        bytes memory tokenMsgData = _buildSingleExecMsgData(tokenA, 0, transferData);
        vm.prank(account);
        hook.preCheck(sender, 0, tokenMsgData);

        assertEq(hook.getRemainingAllowance(account, NATIVE_TOKEN), 0.1 ether);
        assertEq(hook.getRemainingAllowance(account, tokenA), 100e18);
    }

    function test_unconfiguredToken_allowsUnlimited() public {
        _installDefault();

        // Token B has no limit configured — should pass
        bytes memory transferData = _buildTransferCalldata(recipient, 1_000_000e18);
        bytes memory msgData = _buildSingleExecMsgData(tokenB, 0, transferData);

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Batch Execution Tests ───────────────────────────────────

    function test_batchExecution_checksAllExecutions() public {
        _installDefault();

        Execution[] memory execs = new Execution[](2);
        execs[0] = Execution({ target: recipient, value: 0.3 ether, callData: "" });
        execs[1] = Execution({ target: recipient, value: 0.4 ether, callData: "" });

        bytes memory msgData = _buildBatchExecMsgData(execs);

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        (, uint256 spent,,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(spent, 0.7 ether);
    }

    function test_batchExecution_reverts_ifCumulativeExceedsLimit() public {
        _installDefault();

        Execution[] memory execs = new Execution[](2);
        execs[0] = Execution({ target: recipient, value: 0.6 ether, callData: "" });
        execs[1] = Execution({ target: recipient, value: 0.6 ether, callData: "" });

        bytes memory msgData = _buildBatchExecMsgData(execs);

        vm.prank(account);
        vm.expectRevert(); // Second execution will fail
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Configuration Update Tests ──────────────────────────────

    function test_setSpendingLimit_updatesExisting() public {
        _installDefault();

        vm.prank(account);
        hook.setSpendingLimit(NATIVE_TOKEN, 2 ether, 2 days);

        (uint256 limit,, uint48 windowDuration,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(limit, 2 ether);
        assertEq(windowDuration, 2 days);
    }

    function test_setSpendingLimit_addsNewToken() public {
        _installDefault();

        vm.prank(account);
        hook.setSpendingLimit(tokenB, 5000e18, 1 hours);

        (uint256 limit,,,) = hook.configs(account, tokenB);
        assertEq(limit, 5000e18);
    }

    function test_setSpendingLimit_revertsIfNotInitialized() public {
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", account));
        hook.setSpendingLimit(NATIVE_TOKEN, 1 ether, 1 days);
    }

    function test_setSpendingLimit_update_preservesSpentCounter() public {
        _installDefault();

        // Spend 0.5 ETH
        bytes memory msgData = _buildSingleExecMsgData(recipient, 0.5 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        (, uint256 spentBefore,,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(spentBefore, 0.5 ether);

        // Update limit to 2 ETH — spent should be preserved
        vm.prank(account);
        hook.setSpendingLimit(NATIVE_TOKEN, 2 ether, 1 days);

        (, uint256 spentAfter,,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(spentAfter, 0.5 ether);
    }

    function test_setSpendingLimit_update_preservesWindowStart() public {
        _installDefault();

        (,,, uint48 windowStartBefore) = hook.configs(account, NATIVE_TOKEN);

        // Warp forward a bit
        vm.warp(block.timestamp + 1 hours);

        // Update limit — windowStart should NOT change
        vm.prank(account);
        hook.setSpendingLimit(NATIVE_TOKEN, 2 ether, 1 days);

        (,,, uint48 windowStartAfter) = hook.configs(account, NATIVE_TOKEN);
        assertEq(windowStartAfter, windowStartBefore);
    }

    function test_setSpendingLimit_newToken_initializesFresh() public {
        _installDefault();

        // Warp forward so timestamp differs from install time
        vm.warp(block.timestamp + 1 hours);

        vm.prank(account);
        hook.setSpendingLimit(tokenB, 5000e18, 1 hours);

        (, uint256 spent,, uint48 windowStart) = hook.configs(account, tokenB);
        assertEq(spent, 0);
        assertEq(windowStart, uint48(block.timestamp));
    }

    function test_setSpendingLimit_exceedsMaxTokens_reverts() public {
        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](1);
        limits[0] = SpendingLimitHook.TokenLimitInit({ token: NATIVE_TOKEN, limit: 1 ether, windowDuration: 1 hours });

        vm.prank(account);
        hook.onInstall(abi.encode(address(0), limits));

        // Add 49 more tokens (total = 50 = MAX)
        for (uint256 i = 1; i < 50; i++) {
            vm.prank(account);
            hook.setSpendingLimit(address(uint160(i)), 1 ether, 1 hours);
        }

        // 51st should fail
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(SpendingLimitHook.TooManyTokens.selector, 50));
        hook.setSpendingLimit(address(uint160(9999)), 1 ether, 1 hours);
    }

    function test_removeSpendingLimit_clearsConfig() public {
        _installDefault();

        vm.prank(account);
        hook.removeSpendingLimit(NATIVE_TOKEN);

        (uint256 limit,,,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(limit, 0);
    }

    // ─── getRemainingAllowance Tests ─────────────────────────────

    function test_getRemainingAllowance_noConfig_returnsZero() public view {
        assertEq(hook.getRemainingAllowance(account, NATIVE_TOKEN), 0);
    }

    function test_getRemainingAllowance_expiredWindow_returnsFull() public {
        _installDefault();

        // Spend some
        bytes memory msgData = _buildSingleExecMsgData(recipient, 0.8 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        // Warp past window
        vm.warp(block.timestamp + 1 days + 1);

        assertEq(hook.getRemainingAllowance(account, NATIVE_TOKEN), 1 ether);
    }

    // ─── Delegatecall Blocking Tests ────────────────────────────

    function test_delegateCall_reverts() public {
        _installDefault();

        bytes memory msgData = _buildDelegateCallMsgData(recipient, "");

        vm.prank(account);
        vm.expectRevert(SpendingLimitHook.DelegateCallNotAllowed.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_delegateCallFromExecutor_reverts() public {
        _installDefault();

        // Build executeFromExecutor with CALLTYPE_DELEGATECALL
        ModeCode mode = ModeLib.encode(
            CALLTYPE_DELEGATECALL, EXECTYPE_DEFAULT, MODE_DEFAULT, ModePayload.wrap(bytes22(0))
        );
        bytes memory execCalldata = abi.encodePacked(recipient, hex"");
        bytes memory msgData = abi.encodeCall(IERC7579Account.executeFromExecutor, (mode, execCalldata));

        vm.prank(account);
        vm.expectRevert(SpendingLimitHook.DelegateCallNotAllowed.selector);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Module Management Blocking Tests ────────────────────────

    function test_onInstallModule_reverts() public {
        _installDefault();

        bytes memory msgData = abi.encodeCall(
            IERC7579Account.installModule,
            (4, makeAddr("module"), "")
        );

        vm.prank(account);
        vm.expectRevert(SpendingLimitHook.ModuleManagementBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_onUninstallModule_reverts() public {
        _installDefault();

        bytes memory msgData = abi.encodeCall(
            IERC7579Account.uninstallModule,
            (4, makeAddr("module"), "")
        );

        vm.prank(account);
        vm.expectRevert(SpendingLimitHook.ModuleManagementBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_onUnknownFunction_reverts() public {
        _installDefault();

        // Use a random 4-byte selector that doesn't match execute/installModule/etc.
        bytes memory msgData = abi.encodeWithSelector(bytes4(0xdeadbeef), uint256(1), uint256(2));

        vm.prank(account);
        vm.expectRevert(SpendingLimitHook.UnknownFunctionBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Fail-Closed Tests ──────────────────────────────────────

    function test_preCheck_notInitialized_reverts() public {
        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", account));
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Fuzz Tests ──────────────────────────────────────────────

    function testFuzz_nativeTransfer_withinLimit(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 1 ether);
        _installDefault();

        bytes memory msgData = _buildSingleExecMsgData(recipient, amount, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        (, uint256 spent,,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(spent, amount);
    }

    function testFuzz_nativeTransfer_exceedsLimit(uint256 amount) public {
        vm.assume(amount > 1 ether && amount < type(uint128).max);
        _installDefault();

        bytes memory msgData = _buildSingleExecMsgData(recipient, amount, "");
        vm.prank(account);
        vm.expectRevert();
        hook.preCheck(sender, 0, msgData);
    }

    function testFuzz_windowExpiry(uint256 warpTime) public {
        vm.assume(warpTime > 1 days && warpTime < 365 days);
        _installDefault();

        // Spend full limit
        bytes memory msgData = _buildSingleExecMsgData(recipient, 1 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        // Warp past window
        vm.warp(block.timestamp + warpTime);

        // Should succeed — window expired
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    function testFuzz_erc20Transfer_withinLimit(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 1000e18);
        _installDefault();

        bytes memory transferData = _buildTransferCalldata(recipient, amount);
        bytes memory msgData = _buildSingleExecMsgData(tokenA, 0, transferData);

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        (, uint256 spent,,) = hook.configs(account, tokenA);
        assertEq(spent, amount);
    }

    function testFuzz_configLimits(uint256 limit, uint48 window) public {
        vm.assume(limit > 0 && limit < type(uint128).max);
        vm.assume(window >= 60 && window < 365 days);

        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](1);
        limits[0] = SpendingLimitHook.TokenLimitInit({
            token: NATIVE_TOKEN,
            limit: limit,
            windowDuration: window
        });

        vm.prank(account);
        hook.onInstall(abi.encode(address(0), limits));

        (uint256 storedLimit,, uint48 storedWindow,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(storedLimit, limit);
        assertEq(storedWindow, window);
    }

    // ─── transferFrom Tracking Tests ─────────────────────────────

    bytes4 constant TRANSFER_FROM_SELECTOR = 0x23b872dd;

    /// @dev Build ERC-20 transferFrom calldata
    function _buildTransferFromCalldata(address from, address to, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(TRANSFER_FROM_SELECTOR, from, to, amount);
    }

    function test_erc20TransferFrom_tracksSpend() public {
        _installDefault();

        bytes memory transferFromData = _buildTransferFromCalldata(sender, recipient, 500e18);
        bytes memory msgData = _buildSingleExecMsgData(tokenA, 0, transferFromData);

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        (, uint256 spent,,) = hook.configs(account, tokenA);
        assertEq(spent, 500e18);
    }

    function test_erc20TransferFrom_exceedsLimit_reverts() public {
        _installDefault();

        bytes memory transferFromData = _buildTransferFromCalldata(sender, recipient, 1500e18);
        bytes memory msgData = _buildSingleExecMsgData(tokenA, 0, transferFromData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendingLimitHook.SpendingLimitExceeded.selector,
                tokenA,
                1500e18,
                1000e18
            )
        );
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Dedup Tracking Tests ────────────────────────────────────

    function test_setSpendingLimit_removeAndReAdd_noDuplicate() public {
        _installDefault();

        // Remove tokenA limit
        vm.prank(account);
        hook.removeSpendingLimit(tokenA);

        // Re-add tokenA limit
        vm.prank(account);
        hook.setSpendingLimit(tokenA, 2000e18, 2 hours);

        // Uninstall should succeed without issues (no duplicate in tracked tokens)
        vm.prank(account);
        hook.onUninstall("");

        assertFalse(hook.isInitialized(account));
        (uint256 limit,,,) = hook.configs(account, tokenA);
        assertEq(limit, 0);
        (uint256 nativeLimit,,,) = hook.configs(account, NATIVE_TOKEN);
        assertEq(nativeLimit, 0);
    }

    // ─── name() and version() Tests ─────────────────────────────

    function test_name() public view {
        assertEq(hook.name(), "SpendingLimitHook");
    }

    function test_version() public view {
        assertEq(hook.version(), "1.0.0");
    }

    // ─── C-1: Self-Call Blocking Tests ──────────────────────────

    function test_selfCall_setSpendingLimit_reverts() public {
        _installDefault();

        // Agent tries to call hook.setSpendingLimit via a UserOp targeting the hook
        bytes memory callData = abi.encodeWithSelector(
            SpendingLimitHook.setSpendingLimit.selector, NATIVE_TOKEN, 999 ether, uint48(60)
        );
        bytes memory msgData = _buildSingleExecMsgData(address(hook), 0, callData);

        vm.prank(account);
        vm.expectRevert(SpendingLimitHook.SelfCallBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_selfCall_removeSpendingLimit_reverts() public {
        _installDefault();

        bytes memory callData = abi.encodeWithSelector(
            SpendingLimitHook.removeSpendingLimit.selector, NATIVE_TOKEN
        );
        bytes memory msgData = _buildSingleExecMsgData(address(hook), 0, callData);

        vm.prank(account);
        vm.expectRevert(SpendingLimitHook.SelfCallBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_selfCall_setTrustedForwarder_reverts() public {
        _installDefault();

        // Try to call the inherited setTrustedForwarder through a UserOp
        bytes memory callData = abi.encodeWithSignature("setTrustedForwarder(address)", makeAddr("attacker"));
        bytes memory msgData = _buildSingleExecMsgData(address(hook), 0, callData);

        vm.prank(account);
        vm.expectRevert(SpendingLimitHook.SelfCallBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── C-2: Underflow Fix Tests ───────────────────────────────

    function test_limitReduction_belowSpent_handledGracefully() public {
        _installDefault();

        // Spend 0.8 ETH
        bytes memory msgData = _buildSingleExecMsgData(recipient, 0.8 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        // Owner reduces limit to 0.5 ETH (below current spent of 0.8 ETH)
        vm.prank(account);
        hook.setSpendingLimit(NATIVE_TOKEN, 0.5 ether, 1 days);

        // Attempt to spend 0.1 ETH — should revert with SpendingLimitExceeded, not Panic
        bytes memory msgData2 = _buildSingleExecMsgData(recipient, 0.1 ether, "");
        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(SpendingLimitHook.SpendingLimitExceeded.selector, NATIVE_TOKEN, 0.1 ether, 0)
        );
        hook.preCheck(sender, 0, msgData2);
    }

    function test_limitReduction_belowSpent_zeroRemaining() public {
        _installDefault();

        // Spend 0.8 ETH
        bytes memory msgData = _buildSingleExecMsgData(recipient, 0.8 ether, "");
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);

        // Reduce limit below spent
        vm.prank(account);
        hook.setSpendingLimit(NATIVE_TOKEN, 0.5 ether, 1 days);

        // Remaining should be 0
        assertEq(hook.getRemainingAllowance(account, NATIVE_TOKEN), 0);
    }

    // ─── M-1: Upfront Array Length Check ────────────────────────

    function test_onInstall_tooManyLimits_revertsEarly() public {
        SpendingLimitHook.TokenLimitInit[] memory limits = new SpendingLimitHook.TokenLimitInit[](51);
        for (uint256 i = 0; i < 51; i++) {
            limits[i] = SpendingLimitHook.TokenLimitInit({
                token: address(uint160(i + 1)),
                limit: 1 ether,
                windowDuration: 1 hours
            });
        }

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(SpendingLimitHook.TooManyTokens.selector, 50));
        hook.onInstall(abi.encode(address(0), limits));
    }

    // ─── M-2: Early Return for Untracked Token ─────────────────

    function test_removeSpendingLimit_untracked_noOp() public {
        _installDefault();

        // Remove a token that was never tracked — should be a no-op
        vm.prank(account);
        hook.removeSpendingLimit(tokenB);

        // Verify original tokens are still tracked
        (uint256 limit,,,) = hook.configs(account, NATIVE_TOKEN);
        assertGt(limit, 0);
    }

    // ─── L-3: SpendingLimitRemoved Event ────────────────────────

    function test_removeSpendingLimit_emitsEvent() public {
        _installDefault();

        vm.expectEmit(true, true, false, false);
        emit SpendingLimitHook.SpendingLimitRemoved(account, NATIVE_TOKEN);

        vm.prank(account);
        hook.removeSpendingLimit(NATIVE_TOKEN);
    }

    // ─── L-4: Uninstall Guard ───────────────────────────────────

    function test_onUninstall_notInitialized_reverts() public {
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", account));
        hook.onUninstall("");
    }
}
