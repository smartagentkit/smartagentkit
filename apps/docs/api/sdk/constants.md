# Constants

All constants exported by `@smartagentkit/sdk`.

## ERC-7579 Module Types

```typescript
MODULE_TYPE_VALIDATOR = 1
MODULE_TYPE_EXECUTOR = 2
MODULE_TYPE_FALLBACK = 3
MODULE_TYPE_HOOK = 4
```

## Infrastructure Addresses

```typescript
NATIVE_TOKEN = "0x0000000000000000000000000000000000000000"
ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
SAFE_7579_MODULE = "0x7579EE8307284F293B1927136486880611F20002"
SAFE_7579_LAUNCHPAD = "0x7579011aB74c46090561ea277Ba79D510c6C00ff"
RHINESTONE_ATTESTER = "0x000000333034E9f539ce08819E12c1b8Cb29084d"
```

| Constant | Description |
|---|---|
| `NATIVE_TOKEN` | Zero address representing native ETH in spending limit configs |
| `ENTRYPOINT_V07` | ERC-4337 EntryPoint v0.7 (canonical deployment) |
| `SAFE_7579_MODULE` | Safe7579 adapter module address |
| `SAFE_7579_LAUNCHPAD` | Safe7579 launchpad for atomic module installation during deployment |
| `RHINESTONE_ATTESTER` | Rhinestone module registry attester |

## HookMultiPlexer

```typescript
HOOK_MULTIPLEXER_ADDRESS = "0xF6782ed057F95f334D04F0Af1Af4D14fb84DE549"
HOOK_TYPE_GLOBAL = 0
HOOK_TYPE_SIG = 3
HOOK_TYPE_TARGET = 4
```

| Constant | Description |
|---|---|
| `HOOK_MULTIPLEXER_ADDRESS` | Rhinestone HookMultiPlexer contract address |
| `HOOK_TYPE_GLOBAL` | Hook runs on every transaction |
| `HOOK_TYPE_SIG` | Hook runs on specific function selectors |
| `HOOK_TYPE_TARGET` | Hook runs on specific target addresses |

## Time Windows

Convenience constants for policy window durations (in seconds).

```typescript
WINDOW_1_HOUR = 3_600
WINDOW_1_DAY = 86_400
WINDOW_1_WEEK = 604_800
```

```typescript
import { WINDOW_1_DAY, NATIVE_TOKEN } from "@smartagentkit/sdk";

const policy: SpendingLimitPolicy = {
  type: "spending-limit",
  limits: [
    { token: NATIVE_TOKEN, limit: parseEther("1"), window: WINDOW_1_DAY },
  ],
};
```

## ABIs

The SDK exports ABI constants for direct contract interaction.

```typescript
import {
  SPENDING_LIMIT_HOOK_ABI,
  ALLOWLIST_HOOK_ABI,
  EMERGENCY_PAUSE_HOOK_ABI,
  HOOK_MULTIPLEXER_ABI,
} from "@smartagentkit/sdk";
```

| ABI Constant | Contract |
|---|---|
| `SPENDING_LIMIT_HOOK_ABI` | SpendingLimitHook |
| `ALLOWLIST_HOOK_ABI` | AllowlistHook |
| `EMERGENCY_PAUSE_HOOK_ABI` | EmergencyPauseHook |
| `HOOK_MULTIPLEXER_ABI` | HookMultiPlexer |

These are viem-compatible ABI arrays and can be used with `getContract()`, `readContract()`, `writeContract()`, and similar viem functions.
