// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ERC7579HookDestruct } from "modulekit/module-bases/ERC7579HookDestruct.sol";
import { Execution } from "modulekit/accounts/common/interfaces/IERC7579Account.sol";

/**
 * @title EmergencyPauseHook
 * @notice ERC-7579 Hook providing emergency pause capability for agent wallets.
 *         When paused, ALL agent transactions are blocked.
 *
 * @dev Uses ERC7579HookDestruct to inspect execution targets and enforce
 *      self-call protection. This prevents agents from calling admin functions
 *      (setGuardian, setAutoUnpauseTimeout) or inherited functions
 *      (setTrustedForwarder, clearTrustedForwarder) via UserOps.
 *
 *      Registered as a sub-hook within the HookMultiPlexer.
 *
 *      Features:
 *      - Guardian-controlled pause/unpause
 *      - Optional auto-unpause after configurable timeout
 *      - Guardian rotation (works even while paused)
 *      - Pause cooldown to prevent griefing
 *      - Self-call, delegatecall, and module management blocking
 *
 *      OWNER RECONFIGURATION: Admin functions (setGuardian, setAutoUnpauseTimeout)
 *      cannot be called through UserOps because self-call blocking prevents calls
 *      to this hook's address. Owners must use Safe-native execTransaction to
 *      reconfigure module parameters.
 *
 *      NOTE: HookMultiPlexer executes sub-hooks in ascending address order.
 *      This hook's execution order relative to SpendingLimitHook and
 *      AllowlistHook depends on their deployment addresses.
 */
contract EmergencyPauseHook is ERC7579HookDestruct {
    // ─── Types ───────────────────────────────────────────────────

    struct PauseConfig {
        address guardian;           // Address authorized to pause/unpause
        uint48 autoUnpauseAfter;   // Seconds until auto-unpause (0 = manual only)
        bool paused;               // Current pause state
        uint48 pausedAt;           // Timestamp when paused
        bool initialized;          // Module initialization flag
        uint48 lastUnpausedAt;     // Timestamp of last unpause (for cooldown)
    }

    // ─── Storage ─────────────────────────────────────────────────

    mapping(address account => PauseConfig) public pauseConfigs;

    // ─── Constants ───────────────────────────────────────────────

    /// @dev Minimum time between unpause and next pause (anti-griefing)
    uint48 internal constant PAUSE_COOLDOWN = 1 hours;

    /// @dev Maximum auto-unpause timeout (365 days)
    uint48 internal constant MAX_AUTO_UNPAUSE = 365 days;

    // ─── Errors ──────────────────────────────────────────────────

    error WalletPaused(address account);
    error OnlyGuardian(address caller, address guardian);
    error NotPaused(address account);
    error AlreadyPaused(address account);
    error GuardianCannotBeZero();
    error PauseCooldownActive(uint48 availableAt);
    error AutoUnpauseTooLong(uint48 provided, uint48 maximum);
    error SelfCallBlocked();
    error DelegateCallNotAllowed();
    error ModuleManagementBlocked();
    error UnknownFunctionBlocked();

    // ─── Events ──────────────────────────────────────────────────

    event Paused(address indexed account, address indexed guardian, uint48 timestamp);
    event Unpaused(address indexed account, address indexed guardian, uint48 timestamp);
    event AutoUnpaused(address indexed account, uint48 timestamp);
    event GuardianChanged(address indexed account, address indexed newGuardian);
    event AutoUnpauseTimeoutChanged(address indexed account, uint48 newTimeout);
    event ModuleInstalled(address indexed account, address indexed guardian, uint48 autoUnpauseAfter);
    event ModuleUninstalled(address indexed account);

    // ─── Module Lifecycle ────────────────────────────────────────

    /**
     * @notice Initialize the module for an account.
     * @param data ABI-encoded: (address trustedForwarder, address guardian, uint48 autoUnpauseAfter)
     *
     * The trustedForwarder should be the HookMultiPlexer address when used
     * as a sub-hook, or address(0) for direct usage.
     */
    function onInstall(bytes calldata data) external override {
        address account = msg.sender;
        if (pauseConfigs[account].initialized) revert ModuleAlreadyInitialized(account);

        (address _trustedForwarder, address guardian, uint48 autoUnpauseAfter) =
            abi.decode(data, (address, address, uint48));
        if (guardian == address(0)) revert GuardianCannotBeZero();
        if (autoUnpauseAfter > MAX_AUTO_UNPAUSE) {
            revert AutoUnpauseTooLong(autoUnpauseAfter, MAX_AUTO_UNPAUSE);
        }

        // Set trusted forwarder for HookMultiPlexer integration
        if (_trustedForwarder != address(0)) {
            trustedForwarder[account] = _trustedForwarder;
        }

        pauseConfigs[account] = PauseConfig({
            guardian: guardian,
            autoUnpauseAfter: autoUnpauseAfter,
            paused: false,
            pausedAt: 0,
            initialized: true,
            lastUnpausedAt: 0
        });

        emit ModuleInstalled(account, guardian, autoUnpauseAfter);
    }

    /**
     * @notice Clean up module state for an account.
     */
    function onUninstall(bytes calldata) external override {
        address account = msg.sender;
        if (!pauseConfigs[account].initialized) revert NotInitialized(account);
        delete pauseConfigs[account];
        delete trustedForwarder[account];
        emit ModuleUninstalled(account);
    }

    function isInitialized(address account) external view returns (bool) {
        return pauseConfigs[account].initialized;
    }

    function isModuleType(uint256 moduleTypeId) external pure returns (bool) {
        return moduleTypeId == TYPE_HOOK;
    }

    // ─── Guardian Actions ────────────────────────────────────────

    /**
     * @notice Pause the wallet. Only callable by the guardian.
     * @param account The smart account to pause.
     * @dev Subject to cooldown: cannot re-pause within PAUSE_COOLDOWN after unpause.
     */
    function pause(address account) external {
        PauseConfig storage cfg = pauseConfigs[account];
        if (!cfg.initialized) revert NotInitialized(account);
        if (msg.sender != cfg.guardian) revert OnlyGuardian(msg.sender, cfg.guardian);

        // Clear stale auto-unpause state before checking AlreadyPaused
        if (cfg.paused && cfg.autoUnpauseAfter > 0) {
            if (block.timestamp >= cfg.pausedAt + cfg.autoUnpauseAfter) {
                cfg.paused = false;
                cfg.pausedAt = 0;
                cfg.lastUnpausedAt = uint48(block.timestamp);
                emit AutoUnpaused(account, uint48(block.timestamp));
            }
        }

        if (cfg.paused) revert AlreadyPaused(account);

        // Check cooldown after unpause
        if (cfg.lastUnpausedAt > 0) {
            uint48 availableAt = cfg.lastUnpausedAt + PAUSE_COOLDOWN;
            if (block.timestamp < availableAt) {
                revert PauseCooldownActive(availableAt);
            }
        }

        cfg.paused = true;
        cfg.pausedAt = uint48(block.timestamp);

        emit Paused(account, msg.sender, uint48(block.timestamp));
    }

    /**
     * @notice Unpause the wallet. Only callable by the guardian.
     * @param account The smart account to unpause.
     */
    function unpause(address account) external {
        PauseConfig storage cfg = pauseConfigs[account];
        if (!cfg.initialized) revert NotInitialized(account);
        if (msg.sender != cfg.guardian) revert OnlyGuardian(msg.sender, cfg.guardian);

        // Clear stale auto-unpause state before checking NotPaused
        if (cfg.paused && cfg.autoUnpauseAfter > 0) {
            if (block.timestamp >= cfg.pausedAt + cfg.autoUnpauseAfter) {
                cfg.paused = false;
                cfg.pausedAt = 0;
                cfg.lastUnpausedAt = uint48(block.timestamp);
                emit AutoUnpaused(account, uint48(block.timestamp));
            }
        }

        if (!cfg.paused) revert NotPaused(account);

        cfg.paused = false;
        cfg.pausedAt = 0;
        cfg.lastUnpausedAt = uint48(block.timestamp);

        emit Unpaused(account, msg.sender, uint48(block.timestamp));
    }

    // ─── Guardian Rotation ───────────────────────────────────────

    /**
     * @notice Rotate the guardian. Callable by the CURRENT guardian, NOT the account.
     * @dev Works even while the wallet is paused, allowing guardian key rotation
     *      in case of guardian compromise without waiting for unpause.
     * @param account The smart account whose guardian to rotate.
     * @param newGuardian The new guardian address.
     */
    function rotateGuardian(address account, address newGuardian) external {
        PauseConfig storage cfg = pauseConfigs[account];
        if (!cfg.initialized) revert NotInitialized(account);
        if (msg.sender != cfg.guardian) revert OnlyGuardian(msg.sender, cfg.guardian);
        if (newGuardian == address(0)) revert GuardianCannotBeZero();

        cfg.guardian = newGuardian;
        emit GuardianChanged(account, newGuardian);
    }

    // ─── Owner Configuration ─────────────────────────────────────

    /**
     * @notice Change the guardian address. Only callable by the account.
     * @dev Blocked while paused to prevent agent abuse. If guardian key rotation is needed
     *      during pause, use rotateGuardian() which is callable by the current guardian only.
     */
    function setGuardian(address newGuardian) external {
        address account = msg.sender;
        PauseConfig storage cfg = pauseConfigs[account];
        if (!cfg.initialized) revert NotInitialized(account);
        // Clear stale auto-unpause state before checking paused
        if (cfg.paused && cfg.autoUnpauseAfter > 0) {
            if (block.timestamp >= cfg.pausedAt + cfg.autoUnpauseAfter) {
                cfg.paused = false;
                cfg.pausedAt = 0;
                cfg.lastUnpausedAt = uint48(block.timestamp);
                emit AutoUnpaused(account, uint48(block.timestamp));
            }
        }
        if (cfg.paused) revert WalletPaused(account);
        if (newGuardian == address(0)) revert GuardianCannotBeZero();

        pauseConfigs[account].guardian = newGuardian;
        emit GuardianChanged(account, newGuardian);
    }

    /**
     * @notice Change the auto-unpause timeout. Only callable by the account.
     */
    function setAutoUnpauseTimeout(uint48 timeout) external {
        address account = msg.sender;
        PauseConfig storage cfg = pauseConfigs[account];
        if (!cfg.initialized) revert NotInitialized(account);
        // Clear stale auto-unpause state before checking paused
        if (cfg.paused && cfg.autoUnpauseAfter > 0) {
            if (block.timestamp >= cfg.pausedAt + cfg.autoUnpauseAfter) {
                cfg.paused = false;
                cfg.pausedAt = 0;
                cfg.lastUnpausedAt = uint48(block.timestamp);
                emit AutoUnpaused(account, uint48(block.timestamp));
            }
        }
        if (cfg.paused) revert WalletPaused(account);
        if (timeout > MAX_AUTO_UNPAUSE) revert AutoUnpauseTooLong(timeout, MAX_AUTO_UNPAUSE);

        pauseConfigs[account].autoUnpauseAfter = timeout;
        emit AutoUnpauseTimeoutChanged(account, timeout);
    }

    // ─── Hook Logic (ERC7579HookDestruct) ────────────────────────

    /**
     * @dev Single execution: block self-calls, then check pause state.
     */
    function onExecute(
        address account,
        address, /* msgSender */
        address target,
        uint256, /* value */
        bytes calldata /* callData */
    ) internal override returns (bytes memory) {
        if (target == address(this)) revert SelfCallBlocked();
        _checkPauseState(account);
        return "";
    }

    /**
     * @dev Batch execution: block self-calls for each target, then check pause state.
     */
    function onExecuteBatch(
        address account,
        address, /* msgSender */
        Execution[] calldata executions
    ) internal override returns (bytes memory) {
        for (uint256 i; i < executions.length; i++) {
            if (executions[i].target == address(this)) revert SelfCallBlocked();
        }
        _checkPauseState(account);
        return "";
    }

    /**
     * @dev Single execution from executor: block self-calls, then check pause state.
     */
    function onExecuteFromExecutor(
        address account,
        address, /* msgSender */
        address target,
        uint256, /* value */
        bytes calldata /* callData */
    ) internal override returns (bytes memory) {
        if (target == address(this)) revert SelfCallBlocked();
        _checkPauseState(account);
        return "";
    }

    /**
     * @dev Batch execution from executor: block self-calls, then check pause state.
     */
    function onExecuteBatchFromExecutor(
        address account,
        address, /* msgSender */
        Execution[] calldata executions
    ) internal override returns (bytes memory) {
        for (uint256 i; i < executions.length; i++) {
            if (executions[i].target == address(this)) revert SelfCallBlocked();
        }
        _checkPauseState(account);
        return "";
    }

    // ─── Delegatecall Blocking ───────────────────────────────────

    /**
     * @dev Delegatecall bypasses hook checks since target code runs
     *      in the account's context. Always revert to prevent bypass.
     */
    function onExecuteDelegateCall(
        address, /* account */
        address, /* msgSender */
        address, /* target */
        bytes calldata /* callData */
    ) internal pure override returns (bytes memory) {
        revert DelegateCallNotAllowed();
    }

    function onExecuteDelegateCallFromExecutor(
        address, /* account */
        address, /* msgSender */
        address, /* target */
        bytes calldata /* callData */
    ) internal pure override returns (bytes memory) {
        revert DelegateCallNotAllowed();
    }

    // ─── Module Management Blocking ──────────────────────────────

    /**
     * @dev Block module installation/uninstallation through the hook to prevent
     *      agents from modifying the security policy.
     */
    function onInstallModule(
        address, /* account */
        address, /* msgSender */
        uint256, /* moduleType */
        address, /* module */
        bytes calldata /* initData */
    ) internal pure override returns (bytes memory) {
        revert ModuleManagementBlocked();
    }

    function onUninstallModule(
        address, /* account */
        address, /* msgSender */
        uint256, /* moduleType */
        address, /* module */
        bytes calldata /* deInitData */
    ) internal pure override returns (bytes memory) {
        revert ModuleManagementBlocked();
    }

    function onUnknownFunction(
        address, /* account */
        address, /* msgSender */
        uint256, /* msgValue */
        bytes calldata /* msgData */
    ) internal pure override returns (bytes memory) {
        revert UnknownFunctionBlocked();
    }

    // ─── Pause State Check ───────────────────────────────────────

    /**
     * @dev Shared pause check for all execution callbacks.
     *      If auto-unpause is configured and the timeout has elapsed, unpauses automatically.
     */
    function _checkPauseState(address account) internal {
        PauseConfig storage cfg = pauseConfigs[account];
        if (!cfg.initialized) revert NotInitialized(account);
        if (!cfg.paused) return; // Not paused — allow

        // Check auto-unpause
        if (cfg.autoUnpauseAfter > 0) {
            if (block.timestamp >= cfg.pausedAt + cfg.autoUnpauseAfter) {
                cfg.paused = false;
                cfg.pausedAt = 0;
                cfg.lastUnpausedAt = uint48(block.timestamp);
                emit AutoUnpaused(account, uint48(block.timestamp));
                return; // Auto-unpaused — allow
            }
        }

        revert WalletPaused(account);
    }

    // ─── Query Functions ─────────────────────────────────────────

    /**
     * @notice Check if an account is currently paused.
     * @dev Also accounts for auto-unpause timeout.
     */
    function isPaused(address account) external view returns (bool) {
        PauseConfig storage cfg = pauseConfigs[account];
        if (!cfg.paused) return false;

        // Check if auto-unpause has elapsed
        if (cfg.autoUnpauseAfter > 0 && block.timestamp >= cfg.pausedAt + cfg.autoUnpauseAfter) {
            return false;
        }

        return true;
    }

    function name() external pure returns (string memory) {
        return "EmergencyPauseHook";
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
