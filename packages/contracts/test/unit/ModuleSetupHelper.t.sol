// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "forge-std/Test.sol";
import { IERC7579Account } from "modulekit/accounts/common/interfaces/IERC7579Account.sol";
import { IModule } from "modulekit/accounts/common/interfaces/IERC7579Module.sol";
import { ModuleSetupHelper } from "../../src/factory/ModuleSetupHelper.sol";

contract ModuleSetupHelperTest is Test {
    ModuleSetupHelper public helper;

    address public hookA = makeAddr("hookA");
    address public hookB = makeAddr("hookB");
    address public multiplexer = makeAddr("multiplexer");

    function setUp() public {
        helper = new ModuleSetupHelper();
    }

    // ─── H-4: Direct onInstall for sub-hooks ────────────────────

    function test_buildSetupCalls_directOnInstall() public view {
        ModuleSetupHelper.SubHookConfig[] memory subHooks = new ModuleSetupHelper.SubHookConfig[](2);
        subHooks[0] = ModuleSetupHelper.SubHookConfig({
            hookAddress: hookA,
            initData: abi.encode(address(0), "hookA-init")
        });
        subHooks[1] = ModuleSetupHelper.SubHookConfig({
            hookAddress: hookB,
            initData: abi.encode(address(0), "hookB-init")
        });

        bytes memory muxInitData = abi.encode("multiplexer-init");

        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            helper.buildSetupCalls(subHooks, multiplexer, muxInitData);

        // Should be 3 calls: 2 sub-hooks + 1 multiplexer
        assertEq(targets.length, 3);
        assertEq(values.length, 3);
        assertEq(calldatas.length, 3);

        // Sub-hook 0: targets the hook directly (NOT address(0))
        assertEq(targets[0], hookA);
        assertEq(values[0], 0);
        assertEq(
            calldatas[0],
            abi.encodeCall(IModule.onInstall, (subHooks[0].initData))
        );

        // Sub-hook 1: targets the hook directly
        assertEq(targets[1], hookB);
        assertEq(values[1], 0);
        assertEq(
            calldatas[1],
            abi.encodeCall(IModule.onInstall, (subHooks[1].initData))
        );

        // Multiplexer: installModule (self-call, address(0))
        assertEq(targets[2], address(0));
        assertEq(values[2], 0);
        assertEq(
            calldatas[2],
            abi.encodeCall(IERC7579Account.installModule, (4, multiplexer, muxInitData))
        );
    }

    function test_buildSetupCalls_emptySubHooks() public view {
        ModuleSetupHelper.SubHookConfig[] memory subHooks = new ModuleSetupHelper.SubHookConfig[](0);
        bytes memory muxInitData = abi.encode("mux-init");

        (address[] memory targets,, bytes[] memory calldatas) =
            helper.buildSetupCalls(subHooks, multiplexer, muxInitData);

        // Only 1 call: the multiplexer
        assertEq(targets.length, 1);
        assertEq(targets[0], address(0));
        assertEq(
            calldatas[0],
            abi.encodeCall(IERC7579Account.installModule, (4, multiplexer, muxInitData))
        );
    }
}
