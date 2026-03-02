# SmartAgentKit — Security Considerations

This document describes known security properties, limitations, and best
practices for deploying SmartAgentKit-governed agent wallets.

---

## Architecture: Defense-in-Depth

SmartAgentKit uses multiple layers of protection:

1. **SDK-side transaction validation** — The SDK blocks calls to all known
   infrastructure contracts (hooks, HookMultiPlexer, EntryPoint, Safe7579)
   before submitting UserOperations.

2. **On-chain AllowlistHook `protectedAddresses`** — Infrastructure contract
   addresses are automatically added to the AllowlistHook's protected addresses
   list during wallet creation. This prevents agents from calling hook admin
   functions even if the SDK-side check is bypassed.

3. **On-chain policy hooks** — SpendingLimitHook, AllowlistHook, and
   EmergencyPauseHook each enforce independent constraints via the
   HookMultiPlexer.

---

## Known Limitations

### H-1: SpendingLimitHook Does Not Track Non-Standard ERC-20 Patterns

The SpendingLimitHook only tracks these spending patterns:
- Native ETH transfers (via `msg.value`)
- `transfer(address,uint256)`
- `approve(address,uint256)`
- `transferFrom(address,address,uint256)`

It does **not** track:
- `increaseAllowance()` (OpenZeppelin)
- `permit()` (EIP-2612)
- DEX swap functions (`swap()`, `exactInput()`, etc.)
- WETH `deposit()`/`withdraw()`
- `multicall()` wrappers
- `safeTransfer()` / `safeTransferFrom()`

**Mitigation:** Always pair SpendingLimitHook with AllowlistHook to restrict
which contracts the agent can interact with. When setting ETH spending limits,
also set limits on WETH. Be aware that DeFi interactions through allowlisted
DEX routers may move value without being tracked by the spending limit.

### H-2: HookMultiPlexer `removeHook` Has No Initialization Check (Upstream)

The Rhinestone HookMultiPlexer's `removeHook` function does not verify
`isInitialized(msg.sender)`, unlike `addHook`. This is an upstream issue in
`rhinestonewtf/core-modules`.

**Mitigation:** The SDK automatically adds the HookMultiPlexer address to
AllowlistHook's `protectedAddresses`, blocking agent-initiated calls to
`removeHook`. This has been reported upstream.

### H-3: AllowlistHook Mode Switch Clears All Permissions

Calling `setMode()` on AllowlistHook clears all existing permissions before
changing the mode. If switching from ALLOWLIST to BLOCKLIST mode:
- The blocklist starts empty, meaning **all targets are allowed**
- New block entries must be added in the same transaction batch

**Mitigation:** Always switch modes and add new permissions in a single
batched UserOperation. Never switch to BLOCKLIST mode without simultaneously
adding block entries.

### H-4: AutomationExecutor Tasks Can Target Any Address

The AutomationExecutor validates that task targets are non-zero but does not
check whether they are infrastructure contracts. While the hook pipeline
(AllowlistHook's `protectedAddresses`) blocks execution at runtime, the task
is still stored and appears valid via `canExecute()`.

**Mitigation:** AllowlistHook's `protectedAddresses` provides runtime
protection. Ensure all hook and multiplexer addresses are included.

---

## EmergencyPauseHook: AllowlistHook Dependency

EmergencyPauseHook uses `ERC7579HookBase` (not `ERC7579HookDestruct`) and
does **not** inspect execution targets. Its admin functions (`setGuardian`,
`setAutoUnpauseTimeout`) and inherited functions (`setTrustedForwarder`,
`clearTrustedForwarder`) are protected **only** by:

1. The SDK-side transaction target blocklist
2. AllowlistHook's `protectedAddresses` mechanism

**The SDK automatically ensures both layers are active.** When creating a
wallet with any hooks but no explicit AllowlistHook, the SDK injects an
AllowlistHook in blocklist mode with all infrastructure addresses protected.

**NEVER deploy EmergencyPauseHook without AllowlistHook.**

### H-5: `EXECTYPE_TRY` Phantom Spending in SpendingLimitHook

When executing via `EXECTYPE_TRY` (try-mode), if the inner call reverts, the
spending counter is still incremented from `preCheck`. This means failed
transactions still consume spending allowance. An attacker could cause repeated
failed transactions to drain the spending limit without actual value leaving
the account (a DoS attack on the spending budget).

**Mitigation:** Use `EXECTYPE_DEFAULT` (revert mode) for value-transferring
calls. Monitor spending-limit consumption via events. Be aware that
`EXECTYPE_TRY` batch calls may consume budget for reverted sub-calls.

### H-6: No Post-Installation `addProtectedAddress()` in AllowlistHook

Protected addresses in AllowlistHook can only be set during `onInstall`. There
is no way to add new protected addresses after installation without
uninstalling and reinstalling the AllowlistHook entirely.

**Mitigation:** When adding new modules post-deployment, plan to reinstall
AllowlistHook with the updated protected addresses list in a single batch
transaction.

### H-7: EmergencyPauseHook Auto-Unpause Creates Predictable Timing

The auto-unpause timestamp is publicly visible on-chain. An attacker with a
compromised session key could pre-stage a UserOp to execute at the exact
moment the auto-unpause triggers.

**Mitigation:** Set `autoUnpauseAfter` to `0` (manual-only unpause) for
high-value wallets. If using auto-unpause, monitor the wallet for queued
UserOps approaching the unpause window.

### H-8: Front-Running Risk on Guardian Rotation

If a guardian key is compromised, an attacker can front-run `rotateGuardian()`
to seize guardian control before the legitimate rotation completes.

**Mitigation:** Use a time-locked guardian rotation pattern. Consider
implementing a two-phase rotation (propose → confirm) in future versions.

### H-9: AllowlistHook Blocklist Mode With No Entries Allows Everything

In BLOCKLIST mode with zero entries, all targets (except protected addresses)
are allowed. This is by design but potentially surprising.

**Mitigation:** When using BLOCKLIST mode, always include entries. The SDK
automatically adds infrastructure addresses as protected regardless of mode.

---

## On-Chain Design Considerations

### AutomationExecutor Task Target Validation

The AutomationExecutor validates that task targets are non-zero but does not
independently check whether targets are infrastructure contracts. The
AllowlistHook's `protectedAddresses` provides runtime protection at the hook
pipeline level.

### AllowlistHook `onInstall` Silently Skips Invalid Permissions

During installation, permissions targeting protected addresses or the hook's
own address are silently skipped without emitting an event or reverting. Check
the on-chain state after installation to verify expected permissions were
applied.

### Wildcard Selector Collision Risk

The `WILDCARD_SELECTOR = bytes4(keccak256("WILDCARD")) = 0x431e2cf5`. There is
a ~1 in 2^32 chance of collision with a real function selector. No known
collision exists in standard ERC-20/DeFi contracts.

### No `postCheck` Implementation

SpendingLimitHook and AllowlistHook do not override `onPostCheck`. There is no
post-execution verification of state changes. All validation occurs in
`preCheck`.

### Capacity Limits

- SpendingLimitHook: `MAX_TRACKED_TOKENS = 50`
- AllowlistHook: `MAX_PERMISSIONS = 100`
- AutomationExecutor: `MAX_TASKS = 50`

These DoS-protection limits may restrict complex DeFi agents with many token
interactions.

---

## Session Key Security

- Session private keys are **not stored or returned** by the SDK.
- `createSession()` returns only the session key address and permission ID.
- Callers must manage key material externally via a secure key management
  system.
- **Session state is ephemeral (in-memory only):** The SDK stores session
  metadata in a `Map` on the client instance. This state is **lost on process
  restart**. On-chain session state persists independently, but the SDK does
  not currently query on-chain Smart Sessions state. `getActiveSessions()`
  only returns sessions created in the current client instance.
- **Session on-chain enablement:** `createSession()` prepares the session
  configuration and owner signature but does not send a dummy transaction to
  enable the session on-chain via Smart Sessions' ENABLE mode. The session
  is enabled implicitly when the first UserOp using the session key signature
  is processed by the Smart Sessions validator.
- **`saltNonce` defaults to `0n`:** The same owner address always produces
  the same counterfactual wallet address. To create multiple wallets per
  owner, provide an explicit `salt` parameter to `createWallet()`.

---

## CLI Security

- **Prefer environment variables** (`SAK_OWNER_KEY`, `SAK_GUARDIAN_KEY`) over
  CLI arguments for passing private keys. CLI arguments are visible in process
  lists (`ps aux`).
- The CLI warns when key material is passed as a CLI argument.
- Config files are created with restricted permissions (`0o700` directory,
  `0o600` file).

---

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly.
Do **not** open a public GitHub issue. Instead, email security concerns to
the maintainers directly.
