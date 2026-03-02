# SmartAgentKit — Security Audit Report

**Date:** 2026-03-02
**Auditor:** Claude Opus 4.6 (Automated Senior Security Audit)
**Scope:** Full codebase — Solidity contracts, TypeScript SDK, CLI, LangChain integration, CI/CD, deployment
**Status:** Deployed on Base Sepolia, packages published to npm, docs site live

---

## Executive Summary

SmartAgentKit demonstrates a generally strong security posture for an MVP-stage project. The on-chain hook architecture is well-designed with defense-in-depth patterns (self-call blocking, delegatecall blocking, module management blocking, protected addresses). TypeScript strict mode is enforced, custom error classes are used throughout, and config file permissions are correctly set.

However, this audit identified **7 Critical**, **8 High**, **11 Medium**, **8 Low**, and **7 Informational** findings across the full stack. The most severe issues center around:

1. **The "guard guarding itself" problem** — an AI agent can potentially call hook contracts via `execute()` to remove its own policy constraints, with insufficient SDK-side guardrails
2. **Private key exposure** — session keys returned as raw hex, private keys visible in CLI process lists, session keys printed to stdout
3. **EmergencyPauseHook's dependency on AllowlistHook** — no self-call protection means a misconfigured deployment leaves emergency controls exposed
4. **Incomplete session management** — sessions not actually enabled on-chain, state only in-memory

**Overall Risk Rating: HIGH** — The project should NOT be deployed on mainnet without addressing all Critical and High findings. The on-chain contracts are architecturally sound but the SDK/CLI layer has insufficient guardrails for the AI agent use case.

---

## Findings Summary

| Severity | Count | On-Chain | SDK | CLI/Integration |
|----------|-------|----------|-----|-----------------|
| Critical | 7 | 2 | 3 | 2 |
| High | 8 | 3 | 3 | 2 |
| Medium | 11 | 4 | 3 | 4 |
| Low | 8 | 3 | 3 | 2 |
| Info | 7 | 3 | 2 | 2 |
| **Total** | **41** | **15** | **14** | **12** |

---

## CRITICAL FINDINGS (7)

### C-1: AI Agent Can Call Hook Contracts to Remove Its Own Policy Constraints

**Component:** SDK
**Files:** `packages/sdk/src/client.ts:496-547`, `packages/sdk/src/constants.ts`

The `execute()` and `executeBatch()` methods perform zero validation on transaction targets. The SDK exports ABIs for all hook management functions (`SPENDING_LIMIT_HOOK_ABI`, `ALLOWLIST_HOOK_ABI`, etc.). A compromised or jailbroken AI agent can construct calldata to call hook contracts directly to reconfigure or remove policies:

```
agent → execute(wallet, { target: spendingLimitHook, data: removeSpendingLimit(token) })
```

The AllowlistHook's `protectedAddresses` feature was designed for this, but it is **optional** and defaults to an empty array. Without it, nothing prevents the agent from disabling all its own guardrails.

**Remediation:**
1. The SDK's `execute()` method MUST maintain a blocklist of infrastructure addresses and reject any transaction targeting them
2. `protectedAddresses` in AllowlistHook MUST be mandatory (not optional) when policies are configured
3. `initializePolicies()` should auto-populate protected addresses with all hook + multiplexer addresses

---

### C-2: No SDK-Side Pre-Flight Transaction Validation

**Component:** SDK
**Files:** `packages/sdk/src/client.ts:496-547`

No validation is performed before submitting UserOperations:
- No check that `target` is a valid address (not zero address, not EntryPoint, not hook contracts)
- No check that `value` is non-negative (bigint can technically be negative via unsafe construction)
- No check that `data` is valid hex of even length
- No simulation before submission

This is the enabler for C-1 and other attack vectors.

**Remediation:** Add comprehensive pre-flight validation: address format, infrastructure blocklist, value bounds, calldata format validation.

---

### C-3: EmergencyPauseHook Has No Self-Call Protection

**Component:** Contracts
**File:** `packages/contracts/src/modules/EmergencyPauseHook.sol:231-248, 254-272, 280-302`

Unlike SpendingLimitHook and AllowlistHook (which use `ERC7579HookDestruct` with `SelfCallBlocked`), EmergencyPauseHook uses `ERC7579HookBase` and never inspects execution targets. It relies entirely on AllowlistHook's `protectedAddresses` to prevent an agent from calling `setGuardian()`, `setAutoUnpauseTimeout()`, or `clearTrustedForwarder()` on it.

If AllowlistHook is misconfigured or absent, an agent can seize guardian control and disable the emergency stop.

**Remediation:** Add self-call protection directly in EmergencyPauseHook (defense-in-depth). Parse msgData in `_preCheck` to extract the execution target and block calls to `address(this)`.

---

### C-4: TrustedForwarder Functions Are Externally Callable

**Component:** Contracts (inherited from ModuleKit)
**File:** `modulekit/src/module-bases/utils/TrustedForwarder.sol:13-22`

All hooks inherit `setTrustedForwarder()` and `clearTrustedForwarder()` from the `TrustedForwarder` base class. These are public functions keyed by `msg.sender`. If an agent can call `clearTrustedForwarder()` on a hook:

- **SpendingLimitHook:** All spending checks bypass to uninitialized storage → no limits enforced
- **AllowlistHook:** `_getAccount()` returns wrong address → all calls revert (DoS) or bypass
- **EmergencyPauseHook:** Pause state checked for wrong address → pause is ineffective

SpendingLimitHook and AllowlistHook block this via their self-call protection. EmergencyPauseHook does NOT (see C-3).

**Remediation:** Ensure all hook addresses are in AllowlistHook's `protectedAddresses`. Report upstream to ModuleKit that `setTrustedForwarder`/`clearTrustedForwarder` should have restricted access.

---

### C-5: Session Key Private Keys Stored In-Memory and Returned Unprotected

**Component:** SDK
**Files:** `packages/sdk/src/client.ts:130-136, 417-435`, `packages/sdk/src/types.ts:250`

`createSession()` generates a session key private key, stores it in a `Map<Address, SessionMetadata[]>` on the client instance, and returns it as raw hex to the caller:

```typescript
return { sessionKey, privateKey: sessionPrivateKey, permissionId };
```

For an AI agent SDK, this is dangerous — an LLM receiving this value could log it, include it in responses, or exfiltrate it via tool calls. The key persists in memory with no mechanism to zero it out.

**Remediation:** Do NOT return raw private keys. Return an opaque session handle with a `signWithSession(handle, data)` method. If the key must be returned, use `Uint8Array` (zeroable) instead of hex string.

---

### C-6: CLI Private Keys Visible in Process Lists

**Component:** CLI
**Files:** `packages/cli/src/commands/create.ts:12`, `packages/cli/src/commands/pause.ts:10`, `packages/cli/src/commands/session.ts:22`

Private keys and mnemonics are accepted as CLI arguments (`--owner-key <hex>`, `--guardian-key <hex>`, `--owner-mnemonic <phrase>`). On all OSes, CLI arguments are visible to any user via `ps aux` or `/proc/[pid]/cmdline`.

**Remediation:** Accept keys only via environment variables or encrypted keystore files, not as CLI arguments. If CLI args must be supported, overwrite `process.argv` entries after parsing and add prominent warnings.

---

### C-7: Foundry Broadcast File Committed to Repository

**Component:** Deployment
**File:** `packages/contracts/broadcast/Deploy.s.sol/84532/run-latest.json`

The broadcast file reveals the deployer address and nonce pattern. An attacker could monitor for future deployments and front-run them on other chains.

**Remediation:** Add `packages/contracts/broadcast/` to `.gitignore` and remove from Git history.

---

## HIGH FINDINGS (8)

### H-1: SpendingLimitHook Does Not Track Non-Standard ERC-20 Patterns

**Component:** Contracts
**File:** `packages/contracts/src/modules/SpendingLimitHook.sol:432-448`

Only recognizes `transfer()`, `approve()`, `transferFrom()`, and native ETH. Does not track: `increaseAllowance()`, `permit()`, DEX swaps, WETH `deposit()`/`withdraw()`, `multicall()`, `safeTransfer()`. Agents can drain funds through untracked DeFi interactions.

**Remediation:** Auto-configure WETH limits when ETH limits are set. Warn users when allowlisted targets include DEX routers. Consider treating ANY call to a token contract as a spend if limits are configured.

---

### H-2: HookMultiPlexer `removeHook` Has No Initialization Check

**Component:** Contracts (upstream)
**File:** `core-modules/src/HookMultiPlexer/HookMultiPlexer.sol:224-230`

Unlike `addHook`, the `removeHook` function does not check `isInitialized(msg.sender)`. If AllowlistHook's protected addresses are misconfigured, an agent could remove all security hooks from the multiplexer.

**Remediation:** Report upstream to Rhinestone. Ensure AllowlistHook always protects the multiplexer address.

---

### H-3: AllowlistHook Mode Switch Clears All Permissions

**Component:** Contracts
**File:** `packages/contracts/src/modules/AllowlistHook.sol:260-275`

Switching from ALLOWLIST to BLOCKLIST mode atomically clears all permissions. In BLOCKLIST mode with no entries, everything is allowed (except protected addresses). If the mode switch and new permission entries are in separate transactions, there's a window of vulnerability.

**Remediation:** Require `setMode()` to also accept initial permissions for the new mode atomically. Document that mode switches must be done in batch.

---

### H-4: AutomationExecutor Tasks Can Target Module Infrastructure

**Component:** Contracts
**File:** `packages/contracts/src/modules/AutomationExecutor.sol:247-272`

Task target validation only checks for zero address. Tasks could be configured to target hook contracts. While the hook pipeline should block execution, this relies entirely on correct AllowlistHook configuration.

**Remediation:** Add a `protectedTargets` mechanism directly in AutomationExecutor.

---

### H-5: Owner Address Mismatch Error Leaks Derived Address

**Component:** SDK
**File:** `packages/sdk/src/client.ts:194-198`

Error message includes the address derived from the private key: `"key derives ${ownerAccount.address}"`. This leaks correlation information in logged environments.

**Remediation:** Use generic error message without revealing the derived address.

---

### H-6: Preset Parameters Accept Untyped `Record<string, unknown>` + Wrong Wildcard Selector

**Component:** SDK
**Files:** `packages/sdk/src/presets.ts:21-132`, `packages/sdk/src/types.ts:85`

Preset params use `Record<string, unknown>` with unsafe `as` casts. No runtime type checking. Additionally, the `defi-trader` preset uses `"0x00000000"` as the DEX selector, which is NOT the wildcard — it only permits empty-calldata ETH transfers. The actual wildcard is `"0x431e2cf5"`. DEX swap calls would be blocked.

**Remediation:** Add runtime type checking. Fix wildcard selector. Create typed preset parameter interfaces.

---

### H-7: Session Key State Only In-Memory, Not Persisted or Synced

**Component:** SDK
**File:** `packages/sdk/src/client.ts:141-159, 476-487`

Session metadata stored only in `Map<Address, SessionMetadata[]>` on the client instance. Lost on process restart. Not synced with on-chain state. `getActiveSessions()` only checks local map, not actual on-chain Smart Sessions state.

**Remediation:** Implement on-chain session state queries. Add `syncSessions()`. Document ephemeral nature prominently.

---

### H-8: Session Key Printed to stdout by CLI

**Component:** CLI
**File:** `packages/cli/src/commands/session.ts:99-107`

The `session create` command prints the raw session private key to stdout via `printKeyValue`. Terminal scrollback, CI logs, or screen sharing would capture it.

**Remediation:** Write to a file with 0o600 permissions instead. Offer `--output <file>` flag. Mask by default, require `--show-key` to display.

---

## MEDIUM FINDINGS (11)

### M-1: EXECTYPE_TRY Phantom Spending in SpendingLimitHook

**Component:** Contracts
**File:** `packages/contracts/src/modules/SpendingLimitHook.sol:462-494`

With `EXECTYPE_TRY`, if inner execution fails, the spending counter is still incremented (preCheck state persists even when inner call reverts). A front-runner could cause repeated failed transactions that drain the spending limit without actual value leaving the account — a DoS.

---

### M-2: No `addProtectedAddress()` Post-Installation in AllowlistHook

**Component:** Contracts
**File:** `packages/contracts/src/modules/AllowlistHook.sol:115-168`

Protected addresses only settable during `onInstall`. No way to add new module addresses without uninstalling and reinstalling AllowlistHook.

---

### M-3: EmergencyPauseHook Auto-Unpause Creates Predictable Timing Window

**Component:** Contracts
**File:** `packages/contracts/src/modules/EmergencyPauseHook.sol:280-302`

Auto-unpause timestamp is publicly visible. Attacker with a compromised session key could pre-stage a UserOp to execute at the exact auto-unpause moment.

---

### M-4: Front-Running Risk on Guardian Rotation

**Component:** Contracts
**File:** `packages/contracts/src/modules/EmergencyPauseHook.sol:214-222`

If guardian key is compromised, attacker can front-run `rotateGuardian()` to seize guardian control.

---

### M-5: `createSession` Does Not Actually Enable Sessions On-Chain

**Component:** SDK
**File:** `packages/sdk/src/client.ts:411-416`

The comment reveals that step 8 (sending a dummy transaction to enable the session) is not implemented. Sessions are "created" only in local memory and may not work when used.

---

### M-6: Error Wrapping Propagates Sensitive Upstream Messages

**Component:** SDK
**File:** `packages/sdk/src/client.ts` (multiple catch blocks)

Upstream errors from permissionless.js/viem/bundler may contain RPC URLs with API keys, nonce values, or contract state. These propagate to end users and AI agents.

---

### M-7: `config set` Accepts Arbitrary Keys (Potential Prototype Pollution)

**Component:** CLI
**Files:** `packages/cli/src/commands/config.ts:29-51`, `packages/cli/src/utils/config.ts:59-63`

No key allowlist. Supports dot-notation object nesting. Could allow `__proto__` keys. Users might store secrets thinking it's a secure store.

---

### M-8: LangChain Tools Lack Confirmation/Rate Limiting for Transactions

**Component:** LangChain Integration
**File:** `packages/integrations/langchain/src/tools.ts:122-236`

`send_transaction` and `send_batch_transaction` execute immediately with no confirmation step, human-in-the-loop approval, or rate limiting. A prompt-injected LLM can drain the wallet up to spending limits.

---

### M-9: `send_batch_transaction` Lacks Calldata Hex Validation

**Component:** LangChain Integration
**File:** `packages/integrations/langchain/src/tools.ts:195-197`

Uses plain `z.string().optional()` instead of `calldataSchema` with hex validation regex. Inconsistent with `send_transaction` which validates properly.

---

### M-10: `Number(bigint) / 1e18` Precision Loss in LangChain Tools

**Component:** LangChain Integration
**File:** `packages/integrations/langchain/src/tools.ts:68, 105`

Converts bigint balances to `Number` before dividing, losing precision above ~9,007 ETH. Wrong for non-18-decimal tokens (e.g., USDC with 6 decimals shows as ~0).

---

### M-11: CI Pipeline Lacks Permissions Restriction

**Component:** CI/CD
**File:** `.github/workflows/ci.yml`

No top-level `permissions:` block. Runs on `pull_request` from any contributor.

---

## LOW FINDINGS (8)

### L-1: AllowlistHook Blocklist Mode With No Entries Allows Everything

**Component:** Contracts
**File:** `packages/contracts/src/modules/AllowlistHook.sol:461-470`

In BLOCKLIST mode with zero permissions, all targets (except protected) are allowed. By design, but potentially surprising.

### L-2: Deploy Script Uses Non-Deterministic Addresses

**Component:** Contracts
**File:** `packages/contracts/script/Deploy.s.sol:51-67`

Uses `new` (CREATE) instead of CREATE2. Addresses differ across chains.

### L-3: AllowlistHook `onInstall` Silently Skips Invalid Permissions

**Component:** Contracts
**File:** `packages/contracts/src/modules/AllowlistHook.sol:149-162`

Permissions targeting protected or self addresses are silently skipped. No event or revert.

### L-4: `resolveAccount` Casts String to Hex Without Validation

**Component:** SDK
**File:** `packages/sdk/src/client.ts:93-100`

No regex validation that the key is a valid 32-byte hex private key before passing to `privateKeyToAccount`.

### L-5: `saltNonce` Defaults to `0n` Making Addresses Predictable

**Component:** SDK
**File:** `packages/sdk/src/client.ts:230`

Same owner always gets same counterfactual address. Only one wallet per owner without explicit salt.

### L-6: Mock Client Does Not Enforce Guardian Authorization

**Component:** Testing
**File:** `packages/testing/src/mock-client.ts:198-212`

`pause()` and `unpause()` accept any key without verifying it matches the configured guardian. Tests pass with wrong guardian.

### L-7: Hardcoded Test Private Key Pattern in Examples

**Component:** Examples
**Files:** All example `src/` files

Well-known Foundry test key `0xac09...` hardcoded in mock-mode paths. Pattern invites copy-paste to production.

### L-8: Session Keys Logged Without Truncation in Real-Mode Examples

**Component:** Examples
**Files:** `apps/examples/defi-trading-agent/src/agent.ts:173`, `apps/examples/arbitrage-agent/src/bot.ts:230`

Session keys logged to stdout in full in real-mode code paths.

---

## INFORMATIONAL FINDINGS (7)

### I-1: Wildcard Selector Collision Risk
`WILDCARD_SELECTOR = bytes4(keccak256("WILDCARD")) = 0x431e2cf5`. ~1/2^32 chance of collision with real function selectors.

### I-2: No `postCheck` Implementation
SpendingLimitHook and AllowlistHook don't override `onPostCheck`. No post-execution verification.

### I-3: `MAX_TRACKED_TOKENS=50`, `MAX_PERMISSIONS=100` May Be Limiting
DoS protection limits may restrict complex DeFi agents.

### I-4: Source Maps Published in npm Package
`tsup.config.ts` has `sourcemap: true`. Exposes original TypeScript source.

### I-5: `as unknown as` Type Assertions on SmartAccountClient
Complex generics from permissionless.js worked around with unsafe casts.

### I-6: `.env.example` Uses Short Placeholders
`0x...` is technically valid hex. Could use `0xYOUR_PRIVATE_KEY_HERE` for clarity.

### I-7: Missing Test Cases
- No test for `setTrustedForwarder()` / `clearTrustedForwarder()` called directly
- No test for mode switch from BLOCKLIST to ALLOWLIST
- No test for AutomationExecutor with `value > 0`
- No test for `_getAccount()` resolution through HookMultiPlexer

---

## Prioritized Remediation Roadmap

### Phase 1: MUST FIX Before Mainnet (Critical + High)

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | C-1 + C-2: SDK transaction target blocklist | Medium | Prevents agent self-escalation |
| 2 | C-3 + C-4: EmergencyPauseHook self-call protection | Low | Defense-in-depth |
| 3 | C-5: Session key handling redesign | High | Prevents key exfiltration |
| 4 | C-6: CLI key input via env vars only | Low | Prevents key leakage |
| 5 | C-7: Remove broadcast file, update .gitignore | Low | Prevents deployer tracking |
| 6 | H-6: Fix wildcard selector in defi-trader preset | Low | Critical functional bug |
| 7 | H-5: Sanitize error messages | Low | Prevents information leakage |
| 8 | H-1: Document/mitigate untracked spending patterns | Medium | Prevents silent limit bypass |
| 9 | H-3: Atomic mode switch with permissions | Medium | Prevents permission gap |
| 10 | H-8: Mask session key in CLI output | Low | Prevents key exposure |
| 11 | H-7: Document/implement session persistence | High | Prevents lost sessions |
| 12 | H-2 + H-4: Report upstream + add target validation | Medium | Defense-in-depth |

### Phase 2: Should Fix (Medium)

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | M-5: Complete session on-chain enablement | High |
| 2 | M-8: Add confirmation callback to LangChain tools | Medium |
| 3 | M-7: Config key allowlist + prototype pollution fix | Low |
| 4 | M-9: Fix batch calldata validation | Low |
| 5 | M-10: Fix precision loss with formatUnits | Low |
| 6 | M-2: Add `addProtectedAddress()` | Medium |
| 7 | M-6: Sanitize upstream error messages | Medium |
| 8 | M-11: Add CI permissions block | Low |
| 9 | M-1: Document phantom spending | Low |
| 10 | M-3: Add auto-unpause grace period | Medium |
| 11 | M-4: Consider two-phase guardian rotation | High |

### Phase 3: Nice to Have (Low + Informational)

All Low and Informational findings — address as part of regular development.

---

## Architecture Assessment

### What's Working Well

1. **Defense-in-depth on-chain:** Multiple independent policy hooks with fail-closed design
2. **Self-call blocking:** SpendingLimitHook and AllowlistHook correctly prevent agents from reconfiguring themselves
3. **DelegateCall blocking:** All hooks prevent context-switching attacks
4. **Module management blocking:** Agents cannot install/uninstall modules
5. **Protected addresses:** Cross-module protection mechanism is well-designed
6. **Reentrancy guard:** AutomationExecutor properly prevents re-entrancy
7. **DoS protection:** All hooks have capacity limits (MAX_TRACKED_TOKENS, MAX_PERMISSIONS, MAX_TASKS)
8. **Pause cooldown:** Prevents griefing via rapid pause/unpause
9. **Config file permissions:** CLI correctly uses 0o700/0o600
10. **Zod validation:** LangChain tools validate inputs at the boundary
11. **Frozen lockfiles in CI:** Prevents supply chain attacks via lockfile manipulation
12. **`files` field:** All npm packages restrict published content to `dist/` only

### Fundamental Risk: The "Guard Guarding Itself" Problem

The architecture's central challenge is that policy hooks are installed ON the smart account, and the smart account itself executes UserOperations. This means the agent (which controls what UserOps are submitted) can potentially call the hooks to reconfigure or remove them. The AllowlistHook's `protectedAddresses` feature is the primary mitigation, but:

1. It is currently **optional** — the SDK should make it mandatory
2. It is **set only at installation** — no `addProtectedAddress()` for new modules
3. The SDK provides **no independent guardrails** — all protection depends on on-chain configuration

The SDK MUST add an independent transaction target blocklist as a client-side defense layer. On-chain protection should be the last resort, not the only resort.

---

*This report was generated by an automated security audit. Manual expert review is recommended before mainnet deployment. Smart contract audits by specialized firms (Trail of Bits, OpenZeppelin, Consensys Diligence) should be obtained for the on-chain components.*
