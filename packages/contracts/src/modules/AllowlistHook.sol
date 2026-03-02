// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ERC7579HookDestruct } from "modulekit/module-bases/ERC7579HookDestruct.sol";
import { Execution } from "modulekit/accounts/common/interfaces/IERC7579Account.sol";

/**
 * @title AllowlistHook
 * @notice ERC-7579 Hook that restricts agent transactions to approved
 *         target addresses and function selectors.
 *
 * @dev Registered as a sub-hook within the HookMultiPlexer.
 *      Supports two modes:
 *      - ALLOWLIST: Only permitted targets/selectors can be called
 *      - BLOCKLIST: Everything allowed except listed targets/selectors
 *
 *      Wildcard: WILDCARD_SELECTOR (0x431e2cf5) means "all functions on this target".
 *      bytes4(0) is treated as a regular selector (e.g. for ETH transfers with empty calldata).
 *
 *      OWNER RECONFIGURATION: Admin functions (addPermission, removePermission, setMode)
 *      cannot be called through UserOps because the hook pipeline blocks self-calls.
 *      Owners must use Safe-native execTransaction to reconfigure module parameters.
 *
 *      NOTE: HookMultiPlexer executes sub-hooks in ascending address order.
 *      This hook's execution order relative to SpendingLimitHook and
 *      EmergencyPauseHook depends on their deployment addresses.
 */
contract AllowlistHook is ERC7579HookDestruct {
    // ─── Types ───────────────────────────────────────────────────

    enum Mode {
        ALLOWLIST, // 0 — whitelist: only listed targets are allowed
        BLOCKLIST  // 1 — blacklist: listed targets are blocked
    }

    struct TargetPermission {
        address target;    // Contract address
        bytes4 selector;   // Function selector (WILDCARD_SELECTOR = all functions)
    }

    struct AllowlistConfig {
        Mode mode;
        bool initialized;
    }

    // ─── Storage ─────────────────────────────────────────────────

    /// @dev account => allowlist configuration
    mapping(address account => AllowlistConfig) public accountConfigs;

    /// @dev account => target => selector => permission
    mapping(address account => mapping(address target => mapping(bytes4 selector => bool))) public permissions;

    /// @dev Track targets for cleanup
    mapping(address account => TargetPermission[]) internal _trackedPermissions;

    /// @dev Dedup: account => target => selector => tracked
    mapping(address => mapping(address => mapping(bytes4 => bool))) internal _isPermissionTracked;

    /// @dev Protected infrastructure addresses that can never be called as targets
    mapping(address account => mapping(address => bool)) internal _protectedTargets;
    mapping(address account => address[]) internal _protectedTargetList;

    // ─── Constants ───────────────────────────────────────────────

    /// @dev Wildcard selector — means "all functions on this target"
    ///      Uses a non-zero sentinel to avoid conflation with empty calldata (ETH transfers).
    ///      WARNING: If a target contract happens to have a function with selector 0x431e2cf5,
    ///      it cannot be individually allow/block-listed because it collides with WILDCARD_SELECTOR.
    ///      The probability of collision is ~1/2^32 per function. If you encounter a collision,
    ///      use per-selector permissions for the affected target instead of wildcard.
    bytes4 internal constant WILDCARD_SELECTOR = bytes4(keccak256("WILDCARD")); // 0x431e2cf5

    /// @dev Maximum number of tracked permissions per account (DoS protection)
    uint256 internal constant MAX_PERMISSIONS = 100;

    /// @dev Maximum number of protected addresses per account (DoS protection for onUninstall)
    uint256 internal constant MAX_PROTECTED_ADDRESSES = 20;

    // ─── Errors ──────────────────────────────────────────────────

    error TargetNotAllowed(address target, bytes4 selector);
    error TargetBlocked(address target, bytes4 selector);
    error InvalidMode(uint8 mode);
    error DelegateCallNotAllowed();
    error TooManyPermissions(uint256 max);
    error ModuleManagementBlocked();
    error UnknownFunctionBlocked();
    error SelfCallBlocked();
    error ProtectedTargetBlocked(address target);
    error TooManyProtectedAddresses(uint256 max);
    error AlreadyInMode();

    // ─── Events ──────────────────────────────────────────────────

    event AllowlistConfigured(address indexed account, Mode mode, uint256 permissionCount);
    event ProtectedAddressesConfigured(address indexed account, uint256 count);
    event PermissionAdded(address indexed account, address indexed target, bytes4 selector);
    event PermissionRemoved(address indexed account, address indexed target, bytes4 selector);
    event ModeChanged(address indexed account, Mode newMode);

    // ─── Module Lifecycle ────────────────────────────────────────

    /**
     * @notice Initialize the module for an account.
     * @param data ABI-encoded: (address trustedForwarder, uint8 mode, TargetPermission[] permissions, address[] protectedAddresses)
     *
     * The trustedForwarder should be the HookMultiPlexer address when used
     * as a sub-hook, or address(0) for direct usage.
     *
     * protectedAddresses should include all infrastructure contract addresses
     * (other hooks, HookMultiPlexer, AutomationExecutor) that must never be
     * callable as execution targets, regardless of mode.
     */
    function onInstall(bytes calldata data) external override {
        address account = msg.sender;
        if (accountConfigs[account].initialized) revert ModuleAlreadyInitialized(account);

        (
            address _trustedForwarder,
            uint8 mode,
            TargetPermission[] memory perms,
            address[] memory protectedAddresses
        ) = abi.decode(data, (address, uint8, TargetPermission[], address[]));
        if (mode > 1) revert InvalidMode(mode);

        // Set trusted forwarder for HookMultiPlexer integration
        if (_trustedForwarder != address(0)) {
            trustedForwarder[account] = _trustedForwarder;
        }

        accountConfigs[account] = AllowlistConfig({
            mode: Mode(mode),
            initialized: true
        });

        // Store protected infrastructure addresses first so permissions can be validated
        if (protectedAddresses.length > MAX_PROTECTED_ADDRESSES) {
            revert TooManyProtectedAddresses(MAX_PROTECTED_ADDRESSES);
        }
        for (uint256 i; i < protectedAddresses.length; i++) {
            if (protectedAddresses[i] == address(0)) continue;
            if (!_protectedTargets[account][protectedAddresses[i]]) {
                _protectedTargets[account][protectedAddresses[i]] = true;
                _protectedTargetList[account].push(protectedAddresses[i]);
            }
        }

        // Store permissions, skipping any that target protected or self addresses
        uint256 storedCount;
        for (uint256 i; i < perms.length; i++) {
            if (perms[i].target == address(this) || _protectedTargets[account][perms[i].target]) continue;
            if (_trackedPermissions[account].length >= MAX_PERMISSIONS) {
                revert TooManyPermissions(MAX_PERMISSIONS);
            }
            permissions[account][perms[i].target][perms[i].selector] = true;
            if (!_isPermissionTracked[account][perms[i].target][perms[i].selector]) {
                _trackedPermissions[account].push(perms[i]);
                _isPermissionTracked[account][perms[i].target][perms[i].selector] = true;
            }
            storedCount++;
        }

        emit AllowlistConfigured(account, Mode(mode), storedCount);
        if (protectedAddresses.length > 0) {
            emit ProtectedAddressesConfigured(account, _protectedTargetList[account].length);
        }
    }

    /**
     * @notice Clean up module state for an account.
     */
    function onUninstall(bytes calldata) external override {
        address account = msg.sender;
        if (!accountConfigs[account].initialized) revert NotInitialized(account);

        TargetPermission[] storage tracked = _trackedPermissions[account];
        for (uint256 i; i < tracked.length; i++) {
            delete permissions[account][tracked[i].target][tracked[i].selector];
            delete _isPermissionTracked[account][tracked[i].target][tracked[i].selector];
        }
        delete _trackedPermissions[account];

        // Clear protected addresses
        address[] storage protectedList = _protectedTargetList[account];
        for (uint256 i; i < protectedList.length; i++) {
            delete _protectedTargets[account][protectedList[i]];
        }
        delete _protectedTargetList[account];

        delete accountConfigs[account];
        delete trustedForwarder[account];
    }

    function isInitialized(address account) external view returns (bool) {
        return accountConfigs[account].initialized;
    }

    function isModuleType(uint256 moduleTypeId) external pure returns (bool) {
        return moduleTypeId == TYPE_HOOK;
    }

    // ─── Owner Configuration ─────────────────────────────────────

    /**
     * @notice Add a target/selector permission.
     * @dev No-op if the permission already exists (no duplicate event emitted).
     */
    function addPermission(address target, bytes4 selector) external {
        address account = msg.sender;
        if (!accountConfigs[account].initialized) revert NotInitialized(msg.sender);
        if (target == address(this) || _protectedTargets[account][target]) {
            revert ProtectedTargetBlocked(target);
        }

        if (permissions[account][target][selector]) return;

        permissions[account][target][selector] = true;
        if (!_isPermissionTracked[account][target][selector]) {
            if (_trackedPermissions[account].length >= MAX_PERMISSIONS) {
                revert TooManyPermissions(MAX_PERMISSIONS);
            }
            _trackedPermissions[account].push(TargetPermission(target, selector));
            _isPermissionTracked[account][target][selector] = true;
        }

        emit PermissionAdded(account, target, selector);
    }

    /**
     * @notice Remove a target/selector permission.
     */
    function removePermission(address target, bytes4 selector) external {
        address account = msg.sender;
        if (!accountConfigs[account].initialized) revert NotInitialized(msg.sender);
        if (!_isPermissionTracked[account][target][selector]) return;

        permissions[account][target][selector] = false;

        // Remove from tracked
        TargetPermission[] storage tracked = _trackedPermissions[account];
        for (uint256 i; i < tracked.length; i++) {
            if (tracked[i].target == target && tracked[i].selector == selector) {
                tracked[i] = tracked[tracked.length - 1];
                tracked.pop();
                break;
            }
        }
        _isPermissionTracked[account][target][selector] = false;

        emit PermissionRemoved(account, target, selector);
    }

    /**
     * @notice Change the mode (ALLOWLIST <-> BLOCKLIST).
     * @dev Clears ALL existing permissions before switching mode.
     *      This prevents semantic inversion (allow entries becoming block entries).
     *      Re-add permissions after switching mode.
     *
     *      WARNING: After setMode completes, the permission list is empty. In BLOCKLIST mode
     *      this means everything is allowed (except protected addresses). Use setModeWithPermissions
     *      for atomic mode switch + permission setup.
     */
    function setMode(Mode mode) external {
        address account = msg.sender;
        if (!accountConfigs[account].initialized) revert NotInitialized(msg.sender);
        if (accountConfigs[account].mode == mode) revert AlreadyInMode();

        _clearPermissions(account);

        accountConfigs[account].mode = mode;
        emit ModeChanged(account, mode);
    }

    /**
     * @notice Atomically switch mode and set new permissions.
     * @dev Clears existing permissions, switches mode, and adds new permissions
     *      in a single transaction. This prevents the intermediate state where
     *      permissions are empty after setMode (which in BLOCKLIST mode would
     *      allow everything except protected addresses).
     * @param mode The new mode (ALLOWLIST or BLOCKLIST).
     * @param newPermissions The permissions to apply after the mode switch.
     */
    function setModeWithPermissions(Mode mode, TargetPermission[] calldata newPermissions) external {
        address account = msg.sender;
        if (!accountConfigs[account].initialized) revert NotInitialized(msg.sender);
        if (accountConfigs[account].mode == mode) revert AlreadyInMode();

        // 1. Clear existing permissions
        _clearPermissions(account);

        // 2. Switch mode
        accountConfigs[account].mode = mode;

        // 3. Add new permissions atomically
        for (uint256 i; i < newPermissions.length; i++) {
            if (newPermissions[i].target == address(this) || _protectedTargets[account][newPermissions[i].target]) {
                continue; // Skip protected/self targets
            }
            if (_trackedPermissions[account].length >= MAX_PERMISSIONS) {
                revert TooManyPermissions(MAX_PERMISSIONS);
            }
            permissions[account][newPermissions[i].target][newPermissions[i].selector] = true;
            if (!_isPermissionTracked[account][newPermissions[i].target][newPermissions[i].selector]) {
                _trackedPermissions[account].push(newPermissions[i]);
                _isPermissionTracked[account][newPermissions[i].target][newPermissions[i].selector] = true;
            }
        }

        emit ModeChanged(account, mode);
    }

    // ─── Hook Logic ──────────────────────────────────────────────

    function onExecute(
        address account,
        address, /* msgSender */
        address target,
        uint256, /* value */
        bytes calldata callData
    ) internal override returns (bytes memory) {
        _checkTarget(account, target, callData);
        return "";
    }

    function onExecuteBatch(
        address account,
        address, /* msgSender */
        Execution[] calldata executions
    ) internal override returns (bytes memory) {
        for (uint256 i; i < executions.length; i++) {
            _checkTarget(account, executions[i].target, executions[i].callData);
        }
        return "";
    }

    function onExecuteFromExecutor(
        address account,
        address, /* msgSender */
        address target,
        uint256, /* value */
        bytes calldata callData
    ) internal override returns (bytes memory) {
        _checkTarget(account, target, callData);
        return "";
    }

    function onExecuteBatchFromExecutor(
        address account,
        address, /* msgSender */
        Execution[] calldata executions
    ) internal override returns (bytes memory) {
        for (uint256 i; i < executions.length; i++) {
            _checkTarget(account, executions[i].target, executions[i].callData);
        }
        return "";
    }

    // ─── Delegatecall Blocking ───────────────────────────────────

    /**
     * @dev Delegatecall bypasses allowlist checks since target code runs
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
     *
     *      NOTE: This blocks module management via the ERC-7579 installModule/uninstallModule
     *      interface. Direct calls to the HookMultiPlexer's management functions (addHook,
     *      removeHook) are blocked by the protected addresses mechanism in _checkTarget.
     *
     *      UPSTREAM NOTE (L-1): HookMultiPlexer.removeHook does not check whether the
     *      caller account has initialized the multiplexer. This is a third-party issue
     *      in Rhinestone's core-modules; it does not affect security because _checkTarget
     *      blocks all calls to the multiplexer address via protected addresses.
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

    // ─── Query Functions ─────────────────────────────────────────

    /**
     * @notice Check if a target/selector combination is permitted.
     * @dev Returns false for self-calls and protected targets regardless of mode/permissions.
     */
    function isTargetAllowed(
        address account,
        address target,
        bytes4 selector
    ) external view returns (bool) {
        AllowlistConfig storage cfg = accountConfigs[account];
        if (!cfg.initialized) return false;
        if (target == address(this)) return false;
        if (_protectedTargets[account][target]) return false;

        bool hasPermission = permissions[account][target][selector]
            || permissions[account][target][WILDCARD_SELECTOR];

        if (cfg.mode == Mode.ALLOWLIST) {
            return hasPermission;
        } else {
            return !hasPermission;
        }
    }

    /**
     * @notice Check if a target is protected (cannot be called regardless of mode).
     * @param account The smart account to check.
     * @param target The target address to check.
     * @return True if the target is this hook's address or a registered protected address.
     */
    function isProtectedTarget(address account, address target) external view returns (bool) {
        return target == address(this) || _protectedTargets[account][target];
    }

    // ─── Internal Logic ──────────────────────────────────────────

    /**
     * @dev Clear all tracked permissions for an account.
     */
    function _clearPermissions(address account) internal {
        TargetPermission[] storage tracked = _trackedPermissions[account];
        for (uint256 i; i < tracked.length; i++) {
            delete permissions[account][tracked[i].target][tracked[i].selector];
            delete _isPermissionTracked[account][tracked[i].target][tracked[i].selector];
        }
        delete _trackedPermissions[account];
    }

    /**
     * @dev Validates target/selector against the allowlist or blocklist.
     *
     *      SECURITY — Three blocking layers applied before mode checks:
     *      1. SelfCallBlocked: target == address(this) — blocks admin function calls
     *      2. ProtectedTargetBlocked: target in protectedAddresses — blocks calls to
     *         other infrastructure contracts (hooks, multiplexer, executor)
     *      3. Mode-based checks: ALLOWLIST requires permission, BLOCKLIST blocks permission
     */
    function _checkTarget(
        address account,
        address target,
        bytes calldata callData
    ) internal view {
        AllowlistConfig storage cfg = accountConfigs[account];
        if (!cfg.initialized) revert NotInitialized(account);
        if (target == address(this)) revert SelfCallBlocked();
        if (_protectedTargets[account][target]) revert ProtectedTargetBlocked(target);

        bytes4 selector;
        if (callData.length == 0) {
            selector = bytes4(0);
        } else if (callData.length < 4) {
            selector = bytes4(0); // Treat short calldata same as empty
        } else {
            selector = bytes4(callData[:4]);
        }

        // Check specific selector OR wildcard
        bool hasPermission = permissions[account][target][selector]
            || permissions[account][target][WILDCARD_SELECTOR];

        if (cfg.mode == Mode.ALLOWLIST) {
            if (!hasPermission) {
                revert TargetNotAllowed(target, selector);
            }
        } else {
            // BLOCKLIST mode: revert if target IS in the blocklist
            if (hasPermission) {
                revert TargetBlocked(target, selector);
            }
        }
    }

    function name() external pure returns (string memory) {
        return "AllowlistHook";
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
