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

---

## Session Key Security

- Session private keys are **not stored or returned** by the SDK.
- `createSession()` returns only the session key address and permission ID.
- Callers must manage key material externally via a secure key management
  system.
- Session state in the SDK is in-memory only and is lost on process restart.
  On-chain session state persists independently.

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
