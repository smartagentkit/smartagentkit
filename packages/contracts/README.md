# SmartAgentKit Contracts

ERC-7579 policy modules for agent smart wallets, built with [Rhinestone ModuleKit](https://docs.rhinestone.wtf/) and [Foundry](https://book.getfoundry.sh/).

## Modules

### SpendingLimitHook

Per-token spending caps with rolling time windows. Tracks cumulative spend across `transfer`, `approve`, and `transferFrom` calls.

- Configurable per-token limits and window durations
- Rolling window resets automatically on expiry
- Supports native ETH and any ERC-20 token

### AllowlistHook

Restricts agent transactions to approved (or blocked) target addresses and function selectors.

- **Allowlist mode**: Only listed target/selector pairs are permitted
- **Blocklist mode**: Everything allowed except listed pairs
- Wildcard selector (`0x00000000`) allows all functions on a target

### EmergencyPauseHook

Circuit breaker that freezes all wallet transactions when triggered by a guardian.

- Guardian-only pause/unpause
- Optional auto-unpause timeout
- Blocks all execution paths when paused

### AutomationExecutor

ERC-7579 Executor module for external automation services (Gelato, Chainlink Keepers).

- Pre-approved tasks with authorized callers
- Per-task cooldown and max execution limits
- CEI pattern for safe external calls

## Architecture

All hook modules are registered as sub-hooks within the [HookMultiPlexer](https://github.com/rhinestonewtf/core-modules), which is installed as the single ERC-7579 hook on the Safe account. This ensures all hooks run on every transaction.

```
Safe (ERC-7579)
  └─ HookMultiPlexer (TYPE_HOOK)
       ├─ SpendingLimitHook (sub-hook)
       ├─ AllowlistHook     (sub-hook)
       └─ EmergencyPauseHook (sub-hook)
  └─ AutomationExecutor (TYPE_EXECUTOR)
```

## Build

```bash
forge build
```

## Test

```bash
forge test           # Run all tests
forge test -vvv      # Verbose output
forge test --mt test_name  # Run specific test
```

## Deploy

```bash
forge script script/Deploy.s.sol:DeployModules \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY \
  --broadcast
```

## Gas Snapshots

```bash
forge snapshot
```

## Format

```bash
forge fmt
```
