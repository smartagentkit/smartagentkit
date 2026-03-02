# Core Concepts

This page explains the foundational technologies that SmartAgentKit builds on. Understanding these concepts will help you make informed decisions about wallet configuration, policy design, and session key scoping.

## Account Abstraction (ERC-4337)

Traditional Ethereum wallets (Externally Owned Accounts, or EOAs) are controlled by a single private key. Whoever holds the key can sign any transaction with no restrictions. This is a poor fit for AI agents, where you want programmable limits on what the wallet can do.

**ERC-4337** replaces EOAs with **smart contract wallets** that have programmable validation and execution logic:

- **UserOperations** replace raw transactions. Instead of broadcasting a signed transaction directly, the owner signs a UserOperation struct that describes the intended action.
- **Bundlers** collect UserOperations and submit them to the chain. SmartAgentKit uses [Pimlico](https://pimlico.io) as the bundler.
- **EntryPoint** is a singleton contract (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`) that validates and executes UserOperations.
- **Benefits**: gas sponsorship (paymasters can pay gas on behalf of users), batched operations (multiple calls in one transaction), programmable validation (custom signature schemes, multi-sig, session keys), and hooks (pre/post execution checks).

## Modular Smart Accounts (ERC-7579)

**ERC-7579** defines a standard interface for modular smart account extensions. Instead of monolithic wallet contracts, functionality is split into installable modules:

| Module Type | ID | Purpose |
|---|---|---|
| **Validators** | Type 1 | Custom signature and authentication logic |
| **Executors** | Type 2 | Automation and delegated execution |
| **Fallback Handlers** | Type 3 | Extend the account with new callable functions |
| **Hooks** | Type 4 | Pre/post transaction checks -- **this is where policies live** |

SmartAgentKit uses:

- **Hooks** for policy enforcement (SpendingLimitHook, AllowlistHook, EmergencyPauseHook)
- **Executors** for automation (AutomationExecutor)
- **Validators** for session keys (Smart Sessions)

Modules can be installed and uninstalled at any time by the wallet owner, making the system fully upgradeable without deploying a new wallet.

## Safe + Safe7579 Adapter

SmartAgentKit uses **Safe** as the base smart account. Safe is the most battle-tested smart wallet on Ethereum, securing over $100B in assets.

The **Safe7579 adapter** bridges Safe's native module system to the ERC-7579 standard. This gives us:

- **Safe's security** -- audited, formally verified, used in production for years
- **ERC-7579's modularity** -- install any ERC-7579 compatible module

Wallet deployment uses the **Safe7579 Launchpad**, which performs atomic setup: the account and all its modules are deployed and configured in a single transaction. This avoids any window where the wallet exists without its policy hooks.

## HookMultiPlexer Architecture

### The Problem

ERC-7579 only allows **one hook** per smart account. But SmartAgentKit needs multiple policy hooks running simultaneously (spending limits AND allowlist AND emergency pause).

### The Solution

Rhinestone's **HookMultiPlexer** is installed as the single hook. It acts as a router, forwarding `preCheck` and `postCheck` calls to all registered sub-hooks.

```
UserOperation
    |
EntryPoint (0x0000000071727De22E5E9d8BAf0edAc6f37da032)
    |
Safe Account
    |
Safe7579 Adapter
    |
HookMultiPlexer (single hook slot)
    |---> SpendingLimitHook.preCheck()
    |---> AllowlistHook.preCheck()
    +---> EmergencyPauseHook.preCheck()
    | (all pass)
Execute Target Call
    |
HookMultiPlexer.postCheck()
    |---> SpendingLimitHook.postCheck()
    |---> AllowlistHook.postCheck()
    +---> EmergencyPauseHook.postCheck()
```

Key details:

- Sub-hooks execute in **ascending address order** (determined by deployment address)
- Each sub-hook must call `setTrustedForwarder(multiplexerAddress)` so it accepts forwarded calls
- If **any** sub-hook reverts during `preCheck`, the entire UserOperation fails
- The HookMultiPlexer is installed empty at deployment; sub-hooks are added in the first UserOp batch

## Policy Hooks

### SpendingLimitHook

Enforces per-token spending caps over rolling time windows.

- Tracks cumulative spend per token address per wallet
- Supports both native ETH and ERC-20 tokens
- Detects `transfer()` and `approve()` calls for ERC-20 spend tracking
- Rolling window resets automatically (e.g., "1 ETH per 24 hours")

### AllowlistHook

Controls which contracts and functions the wallet can call.

- **Allowlist mode**: only explicitly listed targets are permitted
- **Blocklist mode**: everything is permitted except listed targets
- Supports wildcard selectors (allow/block all functions on a contract)
- Supports specific function selectors (allow only `swap()` on a DEX)

### EmergencyPauseHook

Circuit breaker that freezes all wallet activity.

- When paused, every transaction reverts
- Can be triggered by the wallet owner or a designated guardian
- Optional auto-unpause after a configurable duration
- Useful for incident response: pause first, investigate later

## Smart Sessions

**Session keys** let you give an AI agent a scoped, time-limited private key instead of the owner's key.

A session key can be restricted to:

- **Specific target contracts** -- the agent can only call approved addresses
- **Specific function selectors** -- the agent can only call approved functions
- **Time window** -- the session expires automatically
- **Value limits** -- cap the ETH value per call

The flow:

1. **Owner creates a session** -- defines scope, generates a key pair, signs an enable signature
2. **Agent uses the session key** -- signs UserOperations with the session private key
3. **On-chain validation** -- the Smart Sessions validator module checks that the call falls within the session's scope
4. **Expiry** -- the session becomes invalid after its configured duration

SmartAgentKit uses **Smart Sessions v1.0.0** (Rhinestone + Biconomy), an ERC-7579 validator module that is already in production securing over 1.5 million accounts.

## Policy Enforcement Flow

Here is the complete flow from agent action to on-chain execution:

1. **Agent calls SDK** -- `client.execute(wallet, { target, data, value })`
2. **SDK builds UserOperation** -- assembles calldata, estimates gas, sets fees
3. **Owner signs** -- UserOp is signed with the owner key (or session key)
4. **Bundler submits** -- Pimlico sends the UserOp to the EntryPoint contract
5. **EntryPoint validates** -- checks signature, pays gas, calls the account
6. **Safe executes via Safe7579** -- adapter routes the call through installed modules
7. **HookMultiPlexer runs preCheck** -- each sub-hook validates the transaction:
   - SpendingLimitHook checks if the transfer amount is within budget
   - AllowlistHook checks if the target address and selector are permitted
   - EmergencyPauseHook checks if the wallet is paused
8. **Target call executes** -- if all hooks pass, the actual transaction runs
9. **HookMultiPlexer runs postCheck** -- hooks can verify post-conditions
10. **Result** -- success or revert propagates back through the stack

The critical insight: **policies cannot be bypassed.** They are enforced by the smart contract at the EVM level. Even if the AI agent is fully compromised -- prompt injected, jailbroken, or hallucinating -- the on-chain hooks will reject any transaction that violates policy. The agent does not have the owner's key and cannot uninstall the hooks.

## Next Steps

- [Quickstart](/getting-started/quickstart) -- Deploy your first policy-governed wallet
- [Wallet Creation Guide](/guides/wallet-creation) -- Configure wallets and presets
- [Policy Configuration Guide](/guides/policy-configuration) -- Set up spending limits, allowlists, and pause
- [SDK Client API](/api/sdk/client) -- Full API reference
