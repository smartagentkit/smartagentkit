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
import { AllowlistHook } from "../../src/modules/AllowlistHook.sol";

contract AllowlistHookTest is Test {
    AllowlistHook public hook;

    address public account = makeAddr("account");
    address public sender = makeAddr("sender");
    address public targetA = makeAddr("targetA");
    address public targetB = makeAddr("targetB");
    address public targetC = makeAddr("targetC");

    // Infrastructure addresses for protected target tests
    address public protectedHookA = makeAddr("protectedHookA");
    address public protectedHookB = makeAddr("protectedHookB");
    address public protectedMultiplexer = makeAddr("protectedMultiplexer");

    bytes4 constant TRANSFER_SELECTOR = 0xa9059cbb;
    bytes4 constant APPROVE_SELECTOR = 0x095ea7b3;
    bytes4 constant WILDCARD = bytes4(keccak256("WILDCARD")); // 0x431e2cf5

    function setUp() public {
        hook = new AllowlistHook();
    }

    // ─── Helpers ──────────────────────────────────────────────────

    function _emptyProtected() internal pure returns (address[] memory) {
        return new address[](0);
    }

    function _installAllowlist(AllowlistHook.TargetPermission[] memory perms) internal {
        vm.prank(account);
        hook.onInstall(abi.encode(address(0), uint8(0), perms, _emptyProtected())); // Mode 0 = ALLOWLIST
    }

    function _installBlocklist(AllowlistHook.TargetPermission[] memory perms) internal {
        vm.prank(account);
        hook.onInstall(abi.encode(address(0), uint8(1), perms, _emptyProtected())); // Mode 1 = BLOCKLIST
    }

    function _installAllowlistWithProtected(
        AllowlistHook.TargetPermission[] memory perms,
        address[] memory protectedAddresses
    ) internal {
        vm.prank(account);
        hook.onInstall(abi.encode(address(0), uint8(0), perms, protectedAddresses));
    }

    function _installBlocklistWithProtected(
        AllowlistHook.TargetPermission[] memory perms,
        address[] memory protectedAddresses
    ) internal {
        vm.prank(account);
        hook.onInstall(abi.encode(address(0), uint8(1), perms, protectedAddresses));
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

    function _buildBatchExecMsgData(
        Execution[] memory execs
    ) internal pure returns (bytes memory) {
        ModeCode mode = ModeLib.encodeSimpleBatch();
        bytes memory execCalldata = ExecutionLib.encodeBatch(execs);
        return abi.encodeCall(IERC7579Account.execute, (mode, execCalldata));
    }

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

    // ─── Installation Tests ──────────────────────────────────────

    function test_onInstall_setsAllowlistMode() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });

        _installAllowlist(perms);

        assertTrue(hook.isInitialized(account));
        (AllowlistHook.Mode mode, bool initialized) = hook.accountConfigs(account);
        assertEq(uint8(mode), 0); // ALLOWLIST
        assertTrue(initialized);
    }

    function test_onInstall_setsBlocklistMode() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });

        _installBlocklist(perms);

        (AllowlistHook.Mode mode,) = hook.accountConfigs(account);
        assertEq(uint8(mode), 1); // BLOCKLIST
    }

    function test_onInstall_revertsIfAlreadyInitialized() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installAllowlist(perms);

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("ModuleAlreadyInitialized(address)", account));
        hook.onInstall(abi.encode(address(0), uint8(0), perms, _emptyProtected()));
    }

    function test_onInstall_setsTrustedForwarder() public {
        address multiplexer = makeAddr("multiplexer");
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);

        vm.prank(account);
        hook.onInstall(abi.encode(multiplexer, uint8(0), perms, _emptyProtected()));

        assertEq(hook.trustedForwarder(account), multiplexer);
    }

    function test_onUninstall_clearsState() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });

        _installAllowlist(perms);
        assertTrue(hook.isInitialized(account));

        vm.prank(account);
        hook.onUninstall("");

        assertFalse(hook.isInitialized(account));
        assertFalse(hook.permissions(account, targetA, TRANSFER_SELECTOR));
    }

    function test_onUninstall_clearsTrustedForwarder() public {
        address multiplexer = makeAddr("multiplexer");
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);

        vm.prank(account);
        hook.onInstall(abi.encode(multiplexer, uint8(0), perms, _emptyProtected()));
        assertEq(hook.trustedForwarder(account), multiplexer);

        vm.prank(account);
        hook.onUninstall("");
        assertEq(hook.trustedForwarder(account), address(0));
    }

    function test_isModuleType() public view {
        assertTrue(hook.isModuleType(4)); // TYPE_HOOK
        assertFalse(hook.isModuleType(1));
    }

    // ─── Allowlist Mode Tests ────────────────────────────────────

    function test_allowlist_permittedTarget_succeeds() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });

        _installAllowlist(perms);

        bytes memory callData = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(targetA, 0, callData);

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    function test_allowlist_unpermittedTarget_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });

        _installAllowlist(perms);

        // Call targetB which is NOT in the allowlist
        bytes memory callData = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(targetB, 0, callData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.TargetNotAllowed.selector, targetB, TRANSFER_SELECTOR)
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_allowlist_wrongSelector_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });

        _installAllowlist(perms);

        // Call targetA with APPROVE selector (not allowed)
        bytes memory callData = abi.encodeWithSelector(APPROVE_SELECTOR, makeAddr("spender"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(targetA, 0, callData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.TargetNotAllowed.selector, targetA, APPROVE_SELECTOR)
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_allowlist_wildcardSelector_allowsAllFunctions() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });

        _installAllowlist(perms);

        // TRANSFER should pass
        bytes memory callData1 = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData1 = _buildSingleExecMsgData(targetA, 0, callData1);
        vm.prank(account);
        hook.preCheck(sender, 0, msgData1);

        // APPROVE should also pass
        bytes memory callData2 = abi.encodeWithSelector(APPROVE_SELECTOR, makeAddr("spender"), 100e18);
        bytes memory msgData2 = _buildSingleExecMsgData(targetA, 0, callData2);
        vm.prank(account);
        hook.preCheck(sender, 0, msgData2);
    }

    // ─── Wildcard Selector Tests ─────────────────────────────────

    function test_wildcardSelector_isNotZero() public pure {
        assertNotEq(WILDCARD, bytes4(0));
        assertEq(WILDCARD, bytes4(keccak256("WILDCARD")));
    }

    function test_ethTransfer_emptyCalldata_matchedByWildcard() public {
        // Set up allowlist with wildcard for targetA
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlist(perms);

        // ETH transfer with empty calldata → selector = bytes4(0).
        // The wildcard matches ALL selectors (including bytes4(0)), so this should pass.
        bytes memory msgData = _buildSingleExecMsgData(targetA, 1 ether, "");

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    function test_ethTransfer_emptyCalldata_withoutWildcard_reverts() public {
        // Set up allowlist with only TRANSFER_SELECTOR for targetA (no wildcard)
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        _installAllowlist(perms);

        // ETH transfer with empty calldata → selector = bytes4(0), NOT in allowlist
        bytes memory msgData = _buildSingleExecMsgData(targetA, 1 ether, "");

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.TargetNotAllowed.selector, targetA, bytes4(0))
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_ethTransfer_withExplicitZeroSelector_allowed() public {
        // Add explicit bytes4(0) permission for targetA
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: bytes4(0) });
        _installAllowlist(perms);

        // ETH transfer with empty calldata → selector = bytes4(0) → matches explicit permission
        bytes memory msgData = _buildSingleExecMsgData(targetA, 1 ether, "");

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Short Calldata Tests ────────────────────────────────────

    function test_shortCalldata_1byte_allowlist_wildcard_succeeds() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlist(perms);

        // 1-byte calldata — treated as bytes4(0), wildcard matches
        bytes memory msgData = _buildSingleExecMsgData(targetA, 0, hex"ab");

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    function test_shortCalldata_3bytes_allowlist_wildcard_succeeds() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlist(perms);

        // 3-byte calldata — treated as bytes4(0), wildcard matches
        bytes memory msgData = _buildSingleExecMsgData(targetA, 0, hex"abcdef");

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Blocklist Mode Tests ────────────────────────────────────

    function test_blocklist_unlistedTarget_succeeds() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });

        _installBlocklist(perms);

        // targetB is NOT in blocklist — should pass
        bytes memory callData = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(targetB, 0, callData);

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    function test_blocklist_listedTarget_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });

        _installBlocklist(perms);

        // targetA IS in blocklist — should revert
        bytes memory callData = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(targetA, 0, callData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.TargetBlocked.selector, targetA, TRANSFER_SELECTOR)
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_blocklist_wildcardSelector_blocksAllFunctions() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });

        _installBlocklist(perms);

        // Any function on targetA should be blocked
        bytes memory callData = abi.encodeWithSelector(APPROVE_SELECTOR, makeAddr("spender"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(targetA, 0, callData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.TargetBlocked.selector, targetA, APPROVE_SELECTOR)
        );
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Batch Execution Tests ───────────────────────────────────

    function test_batch_allowlist_allPermitted_succeeds() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](2);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        perms[1] = AllowlistHook.TargetPermission({ target: targetB, selector: TRANSFER_SELECTOR });

        _installAllowlist(perms);

        Execution[] memory execs = new Execution[](2);
        execs[0] = Execution({
            target: targetA,
            value: 0,
            callData: abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18)
        });
        execs[1] = Execution({
            target: targetB,
            value: 0,
            callData: abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 200e18)
        });

        bytes memory msgData = _buildBatchExecMsgData(execs);
        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    function test_batch_allowlist_oneNotPermitted_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });

        _installAllowlist(perms);

        Execution[] memory execs = new Execution[](2);
        execs[0] = Execution({
            target: targetA,
            value: 0,
            callData: abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18)
        });
        execs[1] = Execution({
            target: targetB, // NOT allowed
            value: 0,
            callData: abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 200e18)
        });

        bytes memory msgData = _buildBatchExecMsgData(execs);
        vm.prank(account);
        vm.expectRevert();
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Configuration Update Tests ──────────────────────────────

    function test_addPermission_addsNewTarget() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installAllowlist(perms);

        vm.prank(account);
        hook.addPermission(targetA, TRANSFER_SELECTOR);

        assertTrue(hook.permissions(account, targetA, TRANSFER_SELECTOR));
    }

    function test_addPermission_exceedsMaxPermissions_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installAllowlist(perms);

        // Add 100 permissions (the max)
        for (uint256 i; i < 100; i++) {
            vm.prank(account);
            hook.addPermission(address(uint160(i + 1)), TRANSFER_SELECTOR);
        }

        // 101st should fail
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(AllowlistHook.TooManyPermissions.selector, 100));
        hook.addPermission(address(uint160(9999)), APPROVE_SELECTOR);
    }

    function test_removePermission_removesTarget() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        _installAllowlist(perms);

        assertTrue(hook.permissions(account, targetA, TRANSFER_SELECTOR));

        vm.prank(account);
        hook.removePermission(targetA, TRANSFER_SELECTOR);

        assertFalse(hook.permissions(account, targetA, TRANSFER_SELECTOR));
    }

    function test_setMode_changesToBlocklist() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installAllowlist(perms);

        vm.prank(account);
        hook.setMode(AllowlistHook.Mode.BLOCKLIST);

        (AllowlistHook.Mode mode,) = hook.accountConfigs(account);
        assertEq(uint8(mode), 1);
    }

    function test_setMode_clearsAllPermissions() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](2);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        perms[1] = AllowlistHook.TargetPermission({ target: targetB, selector: APPROVE_SELECTOR });
        _installAllowlist(perms);

        // Verify permissions exist
        assertTrue(hook.permissions(account, targetA, TRANSFER_SELECTOR));
        assertTrue(hook.permissions(account, targetB, APPROVE_SELECTOR));

        // Switch mode
        vm.prank(account);
        hook.setMode(AllowlistHook.Mode.BLOCKLIST);

        // All permissions should be cleared
        assertFalse(hook.permissions(account, targetA, TRANSFER_SELECTOR));
        assertFalse(hook.permissions(account, targetB, APPROVE_SELECTOR));
    }

    function test_setMode_thenAddPermission_worksInNewMode() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        _installAllowlist(perms);

        // Switch to blocklist
        vm.prank(account);
        hook.setMode(AllowlistHook.Mode.BLOCKLIST);

        // Add a new permission in blocklist mode
        vm.prank(account);
        hook.addPermission(targetB, TRANSFER_SELECTOR);

        // targetB should now be blocked
        bytes memory callData = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(targetB, 0, callData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.TargetBlocked.selector, targetB, TRANSFER_SELECTOR)
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_addPermission_revertsIfNotInitialized() public {
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", account));
        hook.addPermission(targetA, TRANSFER_SELECTOR);
    }

    // ─── Delegatecall Blocking Tests ────────────────────────────

    function test_delegateCall_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlist(perms);

        bytes memory msgData = _buildDelegateCallMsgData(targetA, "");

        vm.prank(account);
        vm.expectRevert(AllowlistHook.DelegateCallNotAllowed.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_delegateCallFromExecutor_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlist(perms);

        ModeCode mode = ModeLib.encode(
            CALLTYPE_DELEGATECALL, EXECTYPE_DEFAULT, MODE_DEFAULT, ModePayload.wrap(bytes22(0))
        );
        bytes memory execCalldata = abi.encodePacked(targetA, hex"");
        bytes memory msgData = abi.encodeCall(IERC7579Account.executeFromExecutor, (mode, execCalldata));

        vm.prank(account);
        vm.expectRevert(AllowlistHook.DelegateCallNotAllowed.selector);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Module Management Blocking Tests ────────────────────────

    function test_onInstallModule_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installAllowlist(perms);

        bytes memory msgData = abi.encodeCall(
            IERC7579Account.installModule,
            (4, makeAddr("module"), "")
        );

        vm.prank(account);
        vm.expectRevert(AllowlistHook.ModuleManagementBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_onUninstallModule_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installAllowlist(perms);

        bytes memory msgData = abi.encodeCall(
            IERC7579Account.uninstallModule,
            (4, makeAddr("module"), "")
        );

        vm.prank(account);
        vm.expectRevert(AllowlistHook.ModuleManagementBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_onUnknownFunction_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installAllowlist(perms);

        bytes memory msgData = abi.encodeWithSelector(bytes4(0xdeadbeef), uint256(1), uint256(2));

        vm.prank(account);
        vm.expectRevert(AllowlistHook.UnknownFunctionBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Fail-Closed Tests ──────────────────────────────────────

    function test_preCheck_notInitialized_reverts() public {
        bytes memory callData = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(targetA, 0, callData);

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", account));
        hook.preCheck(sender, 0, msgData);
    }

    // ─── Query Tests ─────────────────────────────────────────────

    function test_isTargetAllowed_allowlistMode() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        _installAllowlist(perms);

        assertTrue(hook.isTargetAllowed(account, targetA, TRANSFER_SELECTOR));
        assertFalse(hook.isTargetAllowed(account, targetA, APPROVE_SELECTOR));
        assertFalse(hook.isTargetAllowed(account, targetB, TRANSFER_SELECTOR));
    }

    function test_isTargetAllowed_blocklistMode() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        _installBlocklist(perms);

        assertFalse(hook.isTargetAllowed(account, targetA, TRANSFER_SELECTOR)); // Blocked
        assertTrue(hook.isTargetAllowed(account, targetA, APPROVE_SELECTOR));  // Not blocked
        assertTrue(hook.isTargetAllowed(account, targetB, TRANSFER_SELECTOR)); // Not blocked
    }

    // ─── Fuzz Tests ──────────────────────────────────────────────

    function testFuzz_allowlist_randomTarget(address target) public {
        vm.assume(target != targetA && target != address(hook));
        vm.assume(target != protectedHookA && target != protectedHookB && target != protectedMultiplexer);

        address[] memory protected = new address[](3);
        protected[0] = protectedHookA;
        protected[1] = protectedHookB;
        protected[2] = protectedMultiplexer;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlistWithProtected(perms, protected);

        bytes memory callData = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(target, 0, callData);

        vm.prank(account);
        vm.expectRevert(); // Any target != targetA should be blocked
        hook.preCheck(sender, 0, msgData);
    }

    function testFuzz_blocklist_randomTarget(address target) public {
        vm.assume(target != targetA && target != address(hook));
        vm.assume(target != protectedHookA && target != protectedHookB && target != protectedMultiplexer);

        address[] memory protected = new address[](3);
        protected[0] = protectedHookA;
        protected[1] = protectedHookB;
        protected[2] = protectedMultiplexer;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installBlocklistWithProtected(perms, protected);

        bytes memory callData = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(target, 0, callData);

        vm.prank(account);
        hook.preCheck(sender, 0, msgData); // Any target != targetA should pass
    }

    // ─── Dedup Tracking Tests ────────────────────────────────────

    function test_addPermission_dedup_noDuplicate() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installAllowlist(perms);

        // Add the same permission twice
        vm.prank(account);
        hook.addPermission(targetA, TRANSFER_SELECTOR);

        vm.prank(account);
        hook.addPermission(targetA, TRANSFER_SELECTOR);

        // Permission should still be set
        assertTrue(hook.permissions(account, targetA, TRANSFER_SELECTOR));

        // Uninstall should succeed without issues (no duplicate in tracking)
        vm.prank(account);
        hook.onUninstall("");

        assertFalse(hook.isInitialized(account));
        assertFalse(hook.permissions(account, targetA, TRANSFER_SELECTOR));
    }

    // ─── name() and version() Tests ─────────────────────────────

    function test_name() public view {
        assertEq(hook.name(), "AllowlistHook");
    }

    function test_version() public view {
        assertEq(hook.version(), "1.0.0");
    }

    // ─── C-1: Self-Call Blocking Tests ──────────────────────────

    function test_selfCall_addPermission_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlist(perms);

        // Agent tries to call hook.addPermission via UserOp
        bytes memory callData = abi.encodeWithSelector(
            AllowlistHook.addPermission.selector, targetB, TRANSFER_SELECTOR
        );
        bytes memory msgData = _buildSingleExecMsgData(address(hook), 0, callData);

        vm.prank(account);
        vm.expectRevert(AllowlistHook.SelfCallBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_selfCall_setMode_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlist(perms);

        bytes memory callData = abi.encodeWithSelector(
            AllowlistHook.setMode.selector, uint8(1) // BLOCKLIST
        );
        bytes memory msgData = _buildSingleExecMsgData(address(hook), 0, callData);

        vm.prank(account);
        vm.expectRevert(AllowlistHook.SelfCallBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    function test_selfCall_blocklist_reverts() public {
        // Even in BLOCKLIST mode, self-calls are blocked
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installBlocklist(perms);

        bytes memory callData = abi.encodeWithSelector(
            AllowlistHook.addPermission.selector, targetA, TRANSFER_SELECTOR
        );
        bytes memory msgData = _buildSingleExecMsgData(address(hook), 0, callData);

        vm.prank(account);
        vm.expectRevert(AllowlistHook.SelfCallBlocked.selector);
        hook.preCheck(sender, 0, msgData);
    }

    // ─── H-2: Short Calldata Blocklist/Allowlist Tests ──────────

    function test_shortCalldata_blocklist_allowed() public {
        // BLOCKLIST, unlisted target, 2-byte calldata → should pass
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        _installBlocklist(perms);

        bytes memory msgData = _buildSingleExecMsgData(targetB, 0, hex"aabb");

        vm.prank(account);
        hook.preCheck(sender, 0, msgData);
    }

    function test_shortCalldata_blocklist_blocked() public {
        // BLOCKLIST, target has bytes4(0) blocked, 2-byte calldata → reverts
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: bytes4(0) });
        _installBlocklist(perms);

        bytes memory msgData = _buildSingleExecMsgData(targetA, 0, hex"aabb");

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.TargetBlocked.selector, targetA, bytes4(0))
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_shortCalldata_allowlist_noWildcard_reverts() public {
        // ALLOWLIST, no wildcard/bytes4(0) permission, short calldata → reverts
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        _installAllowlist(perms);

        bytes memory msgData = _buildSingleExecMsgData(targetA, 0, hex"ab");

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.TargetNotAllowed.selector, targetA, bytes4(0))
        );
        hook.preCheck(sender, 0, msgData);
    }

    // ─── M-3: Non-Existent Permission Removal ──────────────────

    function test_removePermission_nonExistent_noEvent() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        _installAllowlist(perms);

        // Remove a permission that doesn't exist — should be a silent no-op
        vm.recordLogs();

        vm.prank(account);
        hook.removePermission(targetB, APPROVE_SELECTOR);

        // Verify no PermissionRemoved event was emitted
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i = 0; i < entries.length; i++) {
            assertTrue(entries[i].topics[0] != AllowlistHook.PermissionRemoved.selector);
        }

        // Original permission still exists
        assertTrue(hook.permissions(account, targetA, TRANSFER_SELECTOR));
    }

    // ─── M-4: Same-Mode Revert ──────────────────────────────────

    function test_setMode_sameMode_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installAllowlist(perms);

        vm.prank(account);
        vm.expectRevert(AllowlistHook.AlreadyInMode.selector);
        hook.setMode(AllowlistHook.Mode.ALLOWLIST); // Already in ALLOWLIST
    }

    // ─── L-4: Uninstall Guard ───────────────────────────────────

    function test_onUninstall_notInitialized_reverts() public {
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSignature("NotInitialized(address)", account));
        hook.onUninstall("");
    }

    // ─── C-1: Protected Addresses Tests ─────────────────────────

    function test_protectedTarget_blocklist_reverts() public {
        address[] memory protected = new address[](2);
        protected[0] = protectedHookA;
        protected[1] = protectedMultiplexer;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installBlocklistWithProtected(perms, protected);

        // Agent tries to call a protected address in BLOCKLIST mode
        bytes memory callData = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(protectedHookA, 0, callData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.ProtectedTargetBlocked.selector, protectedHookA)
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_protectedTarget_allowlist_reverts() public {
        address[] memory protected = new address[](1);
        protected[0] = protectedHookA;

        // Even if the protected address is in the allowlist, it should still be blocked
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](2);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        perms[1] = AllowlistHook.TargetPermission({ target: protectedHookA, selector: WILDCARD });
        _installAllowlistWithProtected(perms, protected);

        bytes memory callData = abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18);
        bytes memory msgData = _buildSingleExecMsgData(protectedHookA, 0, callData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.ProtectedTargetBlocked.selector, protectedHookA)
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_protectedTarget_multiplexer_reverts() public {
        address[] memory protected = new address[](1);
        protected[0] = protectedMultiplexer;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installBlocklistWithProtected(perms, protected);

        // Agent tries to call multiplexer.removeHook
        bytes memory callData = abi.encodeWithSelector(bytes4(keccak256("removeHook(address,uint8)")), protectedHookA, uint8(0));
        bytes memory msgData = _buildSingleExecMsgData(protectedMultiplexer, 0, callData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.ProtectedTargetBlocked.selector, protectedMultiplexer)
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_protectedTarget_emergencyPause_setGuardian_reverts() public {
        address emergencyPauseAddr = makeAddr("emergencyPause");
        address[] memory protected = new address[](1);
        protected[0] = emergencyPauseAddr;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installBlocklistWithProtected(perms, protected);

        // Agent tries to call EmergencyPauseHook.setGuardian
        bytes memory callData = abi.encodeWithSelector(bytes4(keccak256("setGuardian(address)")), makeAddr("malicious"));
        bytes memory msgData = _buildSingleExecMsgData(emergencyPauseAddr, 0, callData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.ProtectedTargetBlocked.selector, emergencyPauseAddr)
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_protectedTarget_clearTrustedForwarder_reverts() public {
        address emergencyPauseAddr = makeAddr("emergencyPause");
        address[] memory protected = new address[](1);
        protected[0] = emergencyPauseAddr;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installBlocklistWithProtected(perms, protected);

        // Agent tries to call clearTrustedForwarder on EmergencyPauseHook
        bytes memory callData = abi.encodeWithSelector(bytes4(keccak256("clearTrustedForwarder()")));
        bytes memory msgData = _buildSingleExecMsgData(emergencyPauseAddr, 0, callData);

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.ProtectedTargetBlocked.selector, emergencyPauseAddr)
        );
        hook.preCheck(sender, 0, msgData);
    }

    function test_protectedTarget_batch_oneProtected_reverts() public {
        address[] memory protected = new address[](1);
        protected[0] = protectedHookA;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlistWithProtected(perms, protected);

        // Batch with one allowed target and one protected target
        Execution[] memory execs = new Execution[](2);
        execs[0] = Execution({
            target: targetA,
            value: 0,
            callData: abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18)
        });
        execs[1] = Execution({
            target: protectedHookA,
            value: 0,
            callData: abi.encodeWithSelector(TRANSFER_SELECTOR, makeAddr("to"), 100e18)
        });

        bytes memory msgData = _buildBatchExecMsgData(execs);
        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.ProtectedTargetBlocked.selector, protectedHookA)
        );
        hook.preCheck(sender, 0, msgData);
    }

    // ─── M-1: isTargetAllowed Consistency Tests ─────────────────

    function test_isTargetAllowed_selfCall_returnsFalse() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: address(hook), selector: WILDCARD });
        _installAllowlist(perms);

        // Even though hook address is in the allowlist, isTargetAllowed returns false
        assertFalse(hook.isTargetAllowed(account, address(hook), TRANSFER_SELECTOR));
    }

    function test_isTargetAllowed_protectedTarget_returnsFalse() public {
        address[] memory protected = new address[](1);
        protected[0] = protectedHookA;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: protectedHookA, selector: WILDCARD });
        _installAllowlistWithProtected(perms, protected);

        // Protected address returns false even if allowlisted
        assertFalse(hook.isTargetAllowed(account, protectedHookA, TRANSFER_SELECTOR));
    }

    // ─── isProtectedTarget Query Tests ──────────────────────────

    function test_isProtectedTarget_returnsCorrect() public {
        address[] memory protected = new address[](2);
        protected[0] = protectedHookA;
        protected[1] = protectedMultiplexer;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installBlocklistWithProtected(perms, protected);

        // Self (address(hook)) is always protected
        assertTrue(hook.isProtectedTarget(account, address(hook)));
        // Registered protected addresses
        assertTrue(hook.isProtectedTarget(account, protectedHookA));
        assertTrue(hook.isProtectedTarget(account, protectedMultiplexer));
        // Non-protected address
        assertFalse(hook.isProtectedTarget(account, targetA));
    }

    // ─── onUninstall Cleanup Tests ──────────────────────────────

    function test_onUninstall_clearsProtectedAddresses() public {
        address[] memory protected = new address[](2);
        protected[0] = protectedHookA;
        protected[1] = protectedMultiplexer;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);
        _installBlocklistWithProtected(perms, protected);

        // Verify protected addresses are set
        assertTrue(hook.isProtectedTarget(account, protectedHookA));
        assertTrue(hook.isProtectedTarget(account, protectedMultiplexer));

        vm.prank(account);
        hook.onUninstall("");

        // After uninstall, only self-call check remains (isProtectedTarget still returns true for address(hook))
        assertTrue(hook.isProtectedTarget(account, address(hook)));
        // Registered protected addresses should be cleared
        assertFalse(hook.isProtectedTarget(account, protectedHookA));
        assertFalse(hook.isProtectedTarget(account, protectedMultiplexer));
    }

    // ─── M-3: addPermission Duplicate No-Op Tests ───────────────

    function test_addPermission_duplicate_noOp() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: TRANSFER_SELECTOR });
        _installAllowlist(perms);

        // Try adding the same permission again — should be a no-op (no event)
        vm.recordLogs();

        vm.prank(account);
        hook.addPermission(targetA, TRANSFER_SELECTOR);

        // Verify no PermissionAdded event was emitted
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i = 0; i < entries.length; i++) {
            assertTrue(entries[i].topics[0] != AllowlistHook.PermissionAdded.selector);
        }

        // Permission still exists
        assertTrue(hook.permissions(account, targetA, TRANSFER_SELECTOR));
    }

    // ─── F-1: MAX_PROTECTED_ADDRESSES Limit Tests ───────────────

    function test_tooManyProtectedAddresses_reverts() public {
        // Create 21 protected addresses (limit is 20)
        address[] memory protected = new address[](21);
        for (uint256 i = 0; i < 21; i++) {
            protected[i] = address(uint160(0xF000 + i));
        }

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(AllowlistHook.TooManyProtectedAddresses.selector, 20));
        hook.onInstall(abi.encode(address(0), uint8(1), perms, protected));
    }

    function test_maxProtectedAddresses_succeeds() public {
        // Create exactly 20 protected addresses (at the limit)
        address[] memory protected = new address[](20);
        for (uint256 i = 0; i < 20; i++) {
            protected[i] = address(uint160(0xF000 + i));
        }

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);

        vm.prank(account);
        hook.onInstall(abi.encode(address(0), uint8(1), perms, protected));

        // Verify all are protected
        for (uint256 i = 0; i < 20; i++) {
            assertTrue(hook.isProtectedTarget(account, address(uint160(0xF000 + i))));
        }
    }

    // ─── F-5: ProtectedAddressesConfigured Event Tests ──────────

    function test_onInstall_emitsProtectedAddressesConfigured() public {
        address[] memory protected = new address[](2);
        protected[0] = protectedHookA;
        protected[1] = protectedMultiplexer;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);

        vm.recordLogs();

        vm.prank(account);
        hook.onInstall(abi.encode(address(0), uint8(1), perms, protected));

        Vm.Log[] memory entries = vm.getRecordedLogs();
        bool found = false;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics[0] == AllowlistHook.ProtectedAddressesConfigured.selector) {
                found = true;
                break;
            }
        }
        assertTrue(found, "ProtectedAddressesConfigured event not emitted");
    }

    function test_onInstall_noProtectedAddresses_noEvent() public {
        address[] memory protected = new address[](0);

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });

        vm.recordLogs();

        vm.prank(account);
        hook.onInstall(abi.encode(address(0), uint8(0), perms, protected));

        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i = 0; i < entries.length; i++) {
            assertTrue(
                entries[i].topics[0] != AllowlistHook.ProtectedAddressesConfigured.selector,
                "ProtectedAddressesConfigured should not be emitted with empty protected addresses"
            );
        }
    }

    // ─── F-6: addPermission Rejects Protected Targets ───────────

    function test_addPermission_protectedTarget_reverts() public {
        address[] memory protected = new address[](1);
        protected[0] = protectedHookA;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlistWithProtected(perms, protected);

        // Try to add a permission for a protected target — should revert
        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.ProtectedTargetBlocked.selector, protectedHookA)
        );
        hook.addPermission(protectedHookA, TRANSFER_SELECTOR);
    }

    function test_addPermission_selfTarget_reverts() public {
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](1);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        _installAllowlist(perms);

        // Try to add a permission for the hook itself — should revert
        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(AllowlistHook.ProtectedTargetBlocked.selector, address(hook))
        );
        hook.addPermission(address(hook), TRANSFER_SELECTOR);
    }

    // ─── F-8: Zero Address Skipped in Protected Addresses ───────

    // ─── L-2: onInstall Skips Permissions for Protected Targets ──

    function test_onInstall_skipsPermissionsForProtectedTargets() public {
        address[] memory protected = new address[](1);
        protected[0] = protectedHookA;

        // Include a permission for a protected target — it should be silently skipped
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](2);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        perms[1] = AllowlistHook.TargetPermission({ target: protectedHookA, selector: TRANSFER_SELECTOR });

        vm.prank(account);
        hook.onInstall(abi.encode(address(0), uint8(0), perms, protected));

        // targetA permission should exist
        assertTrue(hook.permissions(account, targetA, WILDCARD));
        // protectedHookA permission should NOT be stored
        assertFalse(hook.permissions(account, protectedHookA, TRANSFER_SELECTOR));
    }

    function test_onInstall_skipsPermissionsForSelfTarget() public {
        address[] memory protected = new address[](0);

        // Include a permission targeting the hook itself — should be skipped
        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](2);
        perms[0] = AllowlistHook.TargetPermission({ target: targetA, selector: WILDCARD });
        perms[1] = AllowlistHook.TargetPermission({ target: address(hook), selector: TRANSFER_SELECTOR });

        vm.prank(account);
        hook.onInstall(abi.encode(address(0), uint8(0), perms, protected));

        // targetA permission should exist
        assertTrue(hook.permissions(account, targetA, WILDCARD));
        // Self-target permission should NOT be stored
        assertFalse(hook.permissions(account, address(hook), TRANSFER_SELECTOR));
    }

    function test_onInstall_zeroAddressSkippedInProtected() public {
        address[] memory protected = new address[](3);
        protected[0] = protectedHookA;
        protected[1] = address(0); // Should be skipped
        protected[2] = protectedMultiplexer;

        AllowlistHook.TargetPermission[] memory perms = new AllowlistHook.TargetPermission[](0);

        vm.prank(account);
        hook.onInstall(abi.encode(address(0), uint8(1), perms, protected));

        // protectedHookA and protectedMultiplexer should be protected
        assertTrue(hook.isProtectedTarget(account, protectedHookA));
        assertTrue(hook.isProtectedTarget(account, protectedMultiplexer));
        // address(0) should NOT be registered as protected
        assertFalse(hook.isProtectedTarget(account, address(0)));
    }
}
