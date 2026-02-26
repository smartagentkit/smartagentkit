// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ERC7579HookDestruct } from "modulekit/module-bases/ERC7579HookDestruct.sol";
import { Execution } from "modulekit/accounts/common/interfaces/IERC7579Account.sol";

/**
 * @title SpendingLimitHook
 * @notice ERC-7579 Hook module that enforces per-token spending limits
 *         on agent wallets over configurable rolling time windows.
 *
 * @dev Registered as a sub-hook within the HookMultiPlexer.
 *      Extends ERC7579HookDestruct to receive destructured execution params.
 *
 *      OWNER RECONFIGURATION: Admin functions (setSpendingLimit, removeSpendingLimit)
 *      cannot be called through UserOps because the hook pipeline blocks self-calls.
 *      Owners must use Safe-native execTransaction to reconfigure module parameters.
 *
 *      CO-DEPLOYMENT: This hook should always be deployed alongside AllowlistHook
 *      with this hook's address in AllowlistHook's protectedAddresses to prevent
 *      agents from calling admin functions (setSpendingLimit, removeSpendingLimit)
 *      and inherited functions (setTrustedForwarder, clearTrustedForwarder).
 *
 *      Detects four types of value transfers:
 *      1. Native ETH via msg.value (target, value, "")
 *      2. ERC-20 transfer(to, amount) — selector 0xa9059cbb
 *      3. ERC-20 approve(spender, amount) — selector 0x095ea7b3
 *      4. ERC-20 transferFrom(from, to, amount) — selector 0x23b872dd
 *
 *      NOTE: approve() and transferFrom() are tracked independently.
 *      If the account approves and then the spender calls transferFrom
 *      through the account, the spend is counted twice. This is by
 *      design — approve grants spending power and is counted
 *      conservatively. Non-standard patterns (increaseAllowance,
 *      permit, multicall wrappers) are not tracked.
 *
 *      SECURITY — Phantom spending: Token wrapping/unwrapping (e.g. ETH → WETH)
 *      and swap paths that convert between tokens are NOT detected. An agent
 *      could wrap ETH to WETH to bypass ETH spending limits. Mitigate by
 *      configuring limits on both the native token and its wrapped variant,
 *      and by restricting callable targets via AllowlistHook.
 *
 *      SECURITY — uint48 range: Window durations and timestamps use uint48,
 *      which overflows in year 8,921,556. This is safe for any practical use.
 *
 *      Uses rolling time windows: if the current timestamp exceeds
 *      (windowStart + windowDuration), the counter resets.
 *
 *      NOTE: HookMultiPlexer executes sub-hooks in ascending address order.
 *      This hook's execution order relative to AllowlistHook and
 *      EmergencyPauseHook depends on their deployment addresses.
 */
contract SpendingLimitHook is ERC7579HookDestruct {
    // ─── Types ───────────────────────────────────────────────────

    struct SpendingConfig {
        uint256 limit;         // Maximum spend per window (in token's smallest unit)
        uint256 spent;         // Amount spent in current window
        uint48 windowDuration; // Window duration in seconds
        uint48 windowStart;    // Timestamp when the current window began
    }

    struct TokenLimitInit {
        address token;         // Token address (address(0) = native ETH)
        uint256 limit;         // Max spend per window
        uint48 windowDuration; // Window size in seconds
    }

    // ─── Storage ─────────────────────────────────────────────────

    /// @dev account => token => spending configuration
    mapping(address account => mapping(address token => SpendingConfig)) public configs;

    /// @dev Tracks which tokens have limits set per account (for cleanup on uninstall)
    mapping(address account => address[]) internal _trackedTokens;

    /// @dev Dedup: whether token is already tracked for account
    mapping(address account => mapping(address token => bool)) internal _isTracked;

    /// @dev Whether the module is initialized for a given account
    mapping(address account => bool) internal _initialized;

    // ─── Constants ───────────────────────────────────────────────

    /// @dev Native ETH sentinel value
    address internal constant NATIVE_TOKEN = address(0);

    /// @dev ERC-20 transfer(address,uint256)
    bytes4 internal constant TRANSFER_SELECTOR = 0xa9059cbb;

    /// @dev ERC-20 approve(address,uint256)
    bytes4 internal constant APPROVE_SELECTOR = 0x095ea7b3;

    /// @dev ERC-20 transferFrom(address,address,uint256) selector
    bytes4 internal constant TRANSFER_FROM_SELECTOR = 0x23b872dd;

    /// @dev Minimum window duration: 1 minute
    uint48 internal constant MIN_WINDOW_DURATION = 60;

    /// @dev Maximum number of tracked tokens per account (DoS protection)
    uint256 internal constant MAX_TRACKED_TOKENS = 50;

    // ─── Errors ──────────────────────────────────────────────────

    error SpendingLimitExceeded(address token, uint256 attempted, uint256 remaining);
    error WindowDurationTooShort(uint48 provided, uint48 minimum);
    error LimitCannotBeZero();
    error DelegateCallNotAllowed();
    error NoLimitsProvided();
    error TooManyTokens(uint256 max);
    error ModuleManagementBlocked();
    error UnknownFunctionBlocked();
    error SelfCallBlocked();

    // ─── Events ──────────────────────────────────────────────────

    event SpendingLimitSet(address indexed account, address indexed token, uint256 limit, uint48 windowDuration);
    event SpendingLimitRemoved(address indexed account, address indexed token);
    event SpendingRecorded(address indexed account, address indexed token, uint256 amount, uint256 totalSpent);
    event SpendingWindowReset(address indexed account, address indexed token, uint48 newWindowStart);

    // ─── Module Lifecycle ────────────────────────────────────────

    /**
     * @notice Initialize the module for an account.
     * @param data ABI-encoded: (address trustedForwarder, TokenLimitInit[]).
     *
     * Encoding: abi.encode(address, TokenLimitInit[])
     *
     * The trustedForwarder should be the HookMultiPlexer address when used
     * as a sub-hook, or address(0) for direct usage.
     */
    function onInstall(bytes calldata data) external override {
        address account = msg.sender;
        if (_initialized[account]) revert ModuleAlreadyInitialized(account);

        (address _trustedForwarder, TokenLimitInit[] memory limits) =
            abi.decode(data, (address, TokenLimitInit[]));

        if (limits.length == 0) revert NoLimitsProvided();
        if (limits.length > MAX_TRACKED_TOKENS) revert TooManyTokens(MAX_TRACKED_TOKENS);

        // Set trusted forwarder for HookMultiPlexer integration
        if (_trustedForwarder != address(0)) {
            trustedForwarder[account] = _trustedForwarder;
        }

        for (uint256 i; i < limits.length; i++) {
            _setSpendingLimit(account, limits[i].token, limits[i].limit, limits[i].windowDuration);
        }

        _initialized[account] = true;
    }

    /**
     * @notice Clean up module state for an account.
     */
    function onUninstall(bytes calldata) external override {
        address account = msg.sender;
        if (!_initialized[account]) revert NotInitialized(account);

        address[] storage tokens = _trackedTokens[account];
        for (uint256 i; i < tokens.length; i++) {
            delete configs[account][tokens[i]];
            delete _isTracked[account][tokens[i]];
        }
        delete _trackedTokens[account];
        delete trustedForwarder[account];
        _initialized[account] = false;
    }

    function isInitialized(address account) external view returns (bool) {
        return _initialized[account];
    }

    function isModuleType(uint256 moduleTypeId) external pure returns (bool) {
        return moduleTypeId == TYPE_HOOK;
    }

    // ─── Owner Configuration ─────────────────────────────────────

    /**
     * @notice Set or update a spending limit for a specific token.
     * @dev Can only be called by the account itself (through a UserOp).
     *      When updating an existing token's limit, the spent counter and
     *      window start are preserved. Only new tokens get fresh counters.
     */
    function setSpendingLimit(
        address token,
        uint256 limit,
        uint48 windowDuration
    ) external {
        address account = msg.sender;
        if (!_initialized[account]) revert NotInitialized(msg.sender);
        _setSpendingLimit(account, token, limit, windowDuration);
    }

    /**
     * @notice Remove a spending limit for a token.
     * @dev SECURITY: Removing a limit allows unlimited spending for that token until
     *      re-added. Ensure this function is not callable by the agent — use session key
     *      scoping or AllowlistHook to restrict which functions the agent can call.
     *      Re-adding a removed limit creates fresh counters (spent=0, new window).
     */
    function removeSpendingLimit(address token) external {
        address account = msg.sender;
        if (!_initialized[account]) revert NotInitialized(msg.sender);
        if (!_isTracked[account][token]) return;

        delete configs[account][token];

        // Remove from tracked tokens
        address[] storage tokens = _trackedTokens[account];
        for (uint256 i; i < tokens.length; i++) {
            if (tokens[i] == token) {
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
                break;
            }
        }
        _isTracked[account][token] = false;

        emit SpendingLimitRemoved(account, token);
    }

    // ─── Hook Logic ──────────────────────────────────────────────

    /**
     * @dev Called on single execution (execute).
     *      Checks native ETH value transfers and ERC-20 transfer/approve calls.
     */
    function onExecute(
        address account,
        address, /* msgSender */
        address target,
        uint256 value,
        bytes calldata callData
    ) internal override returns (bytes memory) {
        _checkExecution(account, target, value, callData);
        return "";
    }

    /**
     * @dev Called on batch execution (execute with batch mode).
     */
    function onExecuteBatch(
        address account,
        address, /* msgSender */
        Execution[] calldata executions
    ) internal override returns (bytes memory) {
        if (!_initialized[account]) revert NotInitialized(account);
        for (uint256 i; i < executions.length; i++) {
            _checkExecution(
                account,
                executions[i].target,
                executions[i].value,
                executions[i].callData
            );
        }
        return "";
    }

    /**
     * @dev Called on single execution from an executor module.
     */
    function onExecuteFromExecutor(
        address account,
        address, /* msgSender */
        address target,
        uint256 value,
        bytes calldata callData
    ) internal override returns (bytes memory) {
        _checkExecution(account, target, value, callData);
        return "";
    }

    /**
     * @dev Called on batch execution from an executor module.
     */
    function onExecuteBatchFromExecutor(
        address account,
        address, /* msgSender */
        Execution[] calldata executions
    ) internal override returns (bytes memory) {
        if (!_initialized[account]) revert NotInitialized(account);
        for (uint256 i; i < executions.length; i++) {
            _checkExecution(
                account,
                executions[i].target,
                executions[i].value,
                executions[i].callData
            );
        }
        return "";
    }

    // ─── Delegatecall Blocking ───────────────────────────────────

    /**
     * @dev Delegatecall spending cannot be reliably analyzed at the calldata
     *      level since the target code runs in the account's context.
     *      Always revert to prevent bypass.
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

    // ─── Query Functions ─────────────────────────────────────────

    /**
     * @notice Get the remaining allowance for a token in the current window.
     * @param account The smart account address.
     * @param token The token address (address(0) for native ETH).
     * @return remaining The amount still available in the current window.
     */
    function getRemainingAllowance(address account, address token) external view returns (uint256 remaining) {
        SpendingConfig storage cfg = configs[account][token];
        if (cfg.limit == 0) return 0;

        // If window expired, full limit is available
        if (block.timestamp >= cfg.windowStart + cfg.windowDuration) {
            return cfg.limit;
        }

        if (cfg.spent >= cfg.limit) return 0;
        return cfg.limit - cfg.spent;
    }

    // ─── Internal Logic ──────────────────────────────────────────

    function _setSpendingLimit(
        address account,
        address token,
        uint256 limit,
        uint48 windowDuration
    ) internal {
        if (limit == 0) revert LimitCannotBeZero();
        if (windowDuration < MIN_WINDOW_DURATION) {
            revert WindowDurationTooShort(windowDuration, MIN_WINDOW_DURATION);
        }

        SpendingConfig storage cfg = configs[account][token];

        // Track new token if first time
        if (!_isTracked[account][token]) {
            if (_trackedTokens[account].length >= MAX_TRACKED_TOKENS) {
                revert TooManyTokens(MAX_TRACKED_TOKENS);
            }
            _trackedTokens[account].push(token);
            _isTracked[account][token] = true;
            // Initialize fresh counters only for new tokens
            cfg.windowStart = uint48(block.timestamp);
            cfg.spent = 0;
        }
        // Only update limit and duration; do NOT reset counters for existing tokens
        cfg.limit = limit;
        cfg.windowDuration = windowDuration;

        emit SpendingLimitSet(account, token, limit, windowDuration);
    }

    /**
     * @dev Core spending check logic for a single execution.
     *
     *      SECURITY: Blocks calls where `target == address(this)` to prevent agents
     *      from invoking admin functions (setSpendingLimit, removeSpendingLimit) or
     *      inherited functions (setTrustedForwarder, clearTrustedForwarder) via UserOps.
     */
    function _checkExecution(
        address account,
        address target,
        uint256 value,
        bytes calldata callData
    ) internal {
        if (!_initialized[account]) revert NotInitialized(account);
        if (target == address(this)) revert SelfCallBlocked();

        // Check native ETH transfer
        if (value > 0) {
            _recordSpend(account, NATIVE_TOKEN, value);
        }

        // Check ERC-20 transfer/approve calls
        if (callData.length >= 68) {
            bytes4 selector = bytes4(callData[:4]);
            if (selector == TRANSFER_SELECTOR || selector == APPROVE_SELECTOR) {
                // Decode: transfer(address to, uint256 amount) or approve(address spender, uint256 amount)
                uint256 amount = abi.decode(callData[36:68], (uint256));
                if (amount > 0) {
                    _recordSpend(account, target, amount);
                }
            } else if (selector == TRANSFER_FROM_SELECTOR && callData.length >= 100) {
                // transferFrom(address from, address to, uint256 amount) — amount is 3rd param
                uint256 amount = abi.decode(callData[68:100], (uint256));
                if (amount > 0) {
                    _recordSpend(account, target, amount);
                }
            }
        }
    }

    /**
     * @dev Record a spend against the rolling window. Reverts if limit exceeded.
     *
     *      NOTE — Window reset drift: When the window resets, `windowStart` is set
     *      to `block.timestamp`, not `windowStart + windowDuration`. This means
     *      successive windows may drift forward. This is acceptable because it is
     *      conservative (never grants more than `limit` per `windowDuration`).
     *
     *      NOTE — approve(0) not refunded: If an agent revokes an approval by calling
     *      approve(spender, 0), the original approve amount is NOT credited back.
     *      Tracking approvals conservatively prevents double-spend accounting.
     *
     *      SECURITY — EXECTYPE_TRY phantom drain: When the EntryPoint uses EXECTYPE_TRY,
     *      inner call failures are caught but preCheck state changes (including spending
     *      counter updates here) still persist. This means a failing transfer still counts
     *      against the spending limit. This is conservative by design — it prevents retry
     *      attacks where an agent repeatedly submits failing transactions to probe limits.
     *      The window reset mechanism provides natural recovery.
     */
    function _recordSpend(
        address account,
        address token,
        uint256 amount
    ) internal {
        SpendingConfig storage cfg = configs[account][token];

        // No limit configured for this token — allow
        if (cfg.limit == 0) return;

        // Reset window if expired
        if (block.timestamp >= cfg.windowStart + cfg.windowDuration) {
            cfg.windowStart = uint48(block.timestamp);
            cfg.spent = 0;
            emit SpendingWindowReset(account, token, cfg.windowStart);
        }

        uint256 remaining = cfg.spent >= cfg.limit ? 0 : cfg.limit - cfg.spent;
        if (amount > remaining) {
            revert SpendingLimitExceeded(token, amount, remaining);
        }

        cfg.spent += amount;
        emit SpendingRecorded(account, token, amount, cfg.spent);
    }

    function name() external pure returns (string memory) {
        return "SpendingLimitHook";
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
