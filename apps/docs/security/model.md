# Security Model

## What Policies Do — And Don't — Protect Against

**Policies protect against:**

- **Unrestricted spending.** SpendingLimitHook caps per-token amounts over configurable time windows.
- **Calling unauthorized contracts.** AllowlistHook restricts which addresses and function selectors the wallet can call.
- **Complete fund drain.** Policies are enforced on-chain — a compromised agent or modified SDK cannot bypass them.
- **Agent key compromise.** Session keys limit scope to specific contracts/selectors and expire automatically.
- **Runaway agents.** EmergencyPauseHook provides an instant circuit breaker to freeze all wallet activity.

**Policies do not protect against:**

- **Protocol-level exploits.** If a contract your agent interacts with has a vulnerability, policies cannot prevent exploitation through normal-looking calls.
- **All forms of value movement.** Token wrapping, flash loans, and delegate calls are not tracked by spending limits.
- **Price manipulation.** Spending limits are denominated in token amounts, not USD. A token's price can change within a window.
- **Owner key compromise.** The owner has full control by design. If the owner key is compromised, policies can be removed.
- **Replacing audits.** Custom hook contracts need their own security review. The SDK does not audit user-deployed hooks.

This is an honest accounting. SmartAgentKit significantly reduces the attack surface for AI agent wallets, but it is not a substitute for defense in depth, code audits, and operational security.

## Threat Model

SmartAgentKit is designed for a specific threat: **a compromised or malfunctioning AI agent** that has access to a wallet. The policy system limits what damage the agent can do.

### Threats Mitigated

- **Unlimited spending**: SpendingLimitHook caps per-token amounts over configurable time windows
- **Calling unauthorized contracts**: AllowlistHook restricts callable targets and function selectors
- **Complete fund drain**: Policies are enforced on-chain, not in the SDK -- the agent cannot bypass them
- **Agent key compromise**: Session keys limit scope to specific contracts/selectors and expire automatically

### Threats NOT Mitigated (Out of Scope)

- **Owner key compromise**: The owner has full control by design. Protect the owner key.
- **Smart contract bugs in Safe/Safe7579/EntryPoint**: We rely on their audits (Ackee Blockchain for Safe7579, OpenZeppelin for Safe)
- **Chain-level attacks**: Reorgs, censorship, and validator collusion are outside our scope
- **Social engineering**: If the wallet owner is tricked into removing policies, the system cannot help

## On-Chain Enforcement

All policies are ERC-7579 hooks executed during every UserOperation:

- **HookMultiPlexer** routes to ALL installed hooks -- you cannot skip individual hooks
- If **ANY** hook reverts, the entire UserOp fails
- Hooks execute **before** the target call (`preCheck`) and **after** it (`postCheck`)
- This enforcement happens at the EVM level, not in the SDK -- a malicious SDK fork cannot bypass it

### Hook Execution Flow

```
UserOp submitted
    |
EntryPoint validates
    |
Safe7579 adapter calls HookMultiPlexer.preCheck()
    |
HookMultiPlexer calls each sub-hook:
  |-- SpendingLimitHook.preCheck() -- checks spending within window
  |-- AllowlistHook.preCheck()     -- checks target + selector allowed
  |-- EmergencyPauseHook.preCheck() -- checks not paused
    |
If ALL pass --> execute the call
    |
HookMultiPlexer calls each sub-hook postCheck()
    |
UserOp succeeds
```

## Module Management Protection

The AllowlistHook's `protectedAddresses` feature prevents the account from calling module management functions on itself. This means:

- The agent cannot uninstall its own policy hooks
- The agent cannot modify the HookMultiPlexer configuration
- Only the owner (via a direct Safe transaction, not through the agent's UserOp path) can modify modules

## Self-Call Blocking

Accounts cannot call themselves through the hook system. This prevents an agent from bypassing policies by calling the account's own `execute()` function recursively.

## Guardian Model

The EmergencyPauseHook uses a separate guardian key:

- **Instant pause**: Guardian can pause the wallet with a direct contract call, not a UserOp
- **Cannot be blocked**: Since pause is a direct call, it is not subject to policy checks
- **Cooldown**: 1-hour cooldown between pauses prevents griefing by a compromised guardian
- **Auto-unpause**: Optionally configured timeout after which the wallet automatically unpauses

## Known Limitations

1. **Token wrapping**: SpendingLimitHook does not track WETH wrap/unwrap operations. An agent could wrap ETH to WETH (or vice versa) to partially circumvent token-specific limits.

2. **Flash loans**: Not detected by spending limits. An agent could use flash loans to amplify its effective spending within a single transaction.

3. **Delegate calls**: Hook checks do not cover delegate call patterns. ERC-7579 accounts should disable delegate call if this is a concern.

4. **Price manipulation**: Spending limits are denominated in token amounts, not USD value. A token's price could change significantly within a spending window.

5. **In-memory sessions**: Session metadata does not persist across SDK restarts. The on-chain session remains valid, but the SDK loses its local record of active sessions.

6. **ERC-20 detection**: SpendingLimitHook detects `transfer()` and `approve()` calls by selector matching. Non-standard ERC-20 implementations or calls through proxy patterns may not be detected.
