// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { IERC7579Account } from "modulekit/accounts/common/interfaces/IERC7579Account.sol";
import { IModule } from "modulekit/accounts/common/interfaces/IERC7579Module.sol";

/**
 * @title ModuleSetupHelper
 * @notice Helper contract that provides calldata for atomic initialization
 *         of all SmartAgentKit sub-hooks + HookMultiPlexer in a single batch UserOp.
 *
 * @dev This contract does NOT execute transactions itself. It generates the
 *      correct calldata arrays for the account to execute via a batch UserOp.
 *      The typical flow is:
 *
 *      1. SDK calls `buildSetupCalls()` to get the batch of calls
 *      2. SDK sends a single batch UserOp with these calls
 *      3. Account executes each call atomically — all succeed or all fail
 *
 *      Steps per sub-hook:
 *      a. Direct call to hookAddress.onInstall(initData) — NOT installModule,
 *         because ERC-7579 accounts only support one hook slot, and that slot
 *         is reserved for the HookMultiPlexer.
 *
 *      Then for the HookMultiPlexer:
 *      b. installModule(TYPE_HOOK, multiplexerAddress, multiplexerInitData)
 *
 *      IMPORTANT — Atomicity: The caller MUST execute these calls using
 *      EXECTYPE_DEFAULT (revert-on-failure). Using EXECTYPE_TRY would allow
 *      partial installation, leaving the account in an inconsistent state
 *      (e.g. multiplexer installed but sub-hooks not initialized).
 *
 *      NOTE: The sub-hooks accept the trustedForwarder (multiplexer address) in their
 *      onInstall data, so setTrustedForwarder calls are not needed.
 */
contract ModuleSetupHelper {
    /// @dev ERC-7579 module type for hooks
    uint256 internal constant MODULE_TYPE_HOOK = 4;

    struct SubHookConfig {
        address hookAddress;  // The sub-hook contract address
        bytes initData;       // ABI-encoded init data for the sub-hook's onInstall
    }

    /**
     * @notice Build the array of calls needed to atomically initialize all
     *         sub-hooks and install the HookMultiPlexer.
     *
     * @param subHooks Array of sub-hook configurations (SpendingLimit, Allowlist, EmergencyPause)
     * @param multiplexerAddress The HookMultiPlexer contract address
     * @param multiplexerInitData The init data for the HookMultiPlexer (includes sorted hook arrays)
     * @return targets Array of target addresses (sub-hook addresses for direct onInstall, address(0) for multiplexer)
     * @return values Array of ETH values (all 0)
     * @return calldatas Array of encoded calldata (onInstall for sub-hooks, installModule for multiplexer)
     */
    function buildSetupCalls(
        SubHookConfig[] calldata subHooks,
        address multiplexerAddress,
        bytes calldata multiplexerInitData
    ) external pure returns (
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas
    ) {
        uint256 totalCalls = subHooks.length + 1; // sub-hooks + multiplexer
        targets = new address[](totalCalls);
        values = new uint256[](totalCalls);
        calldatas = new bytes[](totalCalls);

        // Initialize each sub-hook directly (NOT installModule — only one hook slot)
        for (uint256 i; i < subHooks.length; i++) {
            targets[i] = subHooks[i].hookAddress;
            values[i] = 0;
            calldatas[i] = abi.encodeCall(
                IModule.onInstall,
                (subHooks[i].initData)
            );
        }

        // Install HookMultiPlexer last (this occupies the single hook slot)
        uint256 muxIdx = subHooks.length;
        targets[muxIdx] = address(0);
        values[muxIdx] = 0;
        calldatas[muxIdx] = abi.encodeCall(
            IERC7579Account.installModule,
            (MODULE_TYPE_HOOK, multiplexerAddress, multiplexerInitData)
        );
    }
}
