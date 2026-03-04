# Custom Policies

SmartAgentKit has a **plugin architecture** for policies. Built-in policies (SpendingLimit, Allowlist, EmergencyPause) are plugins, and you can register your own custom plugins to extend wallet behavior with new on-chain hooks.

## How It Works

A policy in SmartAgentKit has two parts:

1. **On-chain hook contract** (Solidity) — An ERC-7579 hook that runs `preCheck` before every transaction. This is where enforcement happens. The hook is installed on the wallet's HookMultiPlexer alongside existing hooks.

2. **Off-chain plugin definition** (TypeScript) — A `PolicyPlugin` object that tells the SDK how to encode `onInstall` init data, validate config, and resolve deployed addresses. This is what the SDK uses when creating wallets or installing policies.

The two connect through the `onInstall` interface: your TypeScript plugin's `encodeInitData()` produces the exact bytes that your Solidity contract's `onInstall(bytes calldata data)` expects to decode.

```
TypeScript Plugin                    Solidity Hook
─────────────────                    ─────────────
encodeInitData(config) ──────────→   onInstall(bytes data)
  produces ABI-encoded bytes            decodes and stores config

validateConfig(config)               preCheck(sender, value, data)
  runtime checks before tx              on-chain enforcement
```

## The `PolicyPlugin` Interface

```typescript
import type { Address, Hex } from "viem";

interface PolicyPlugin<TConfig = unknown> {
  readonly id: string;           // Unique identifier (e.g., "target-blocker")
  readonly name: string;         // Human-readable (e.g., "TargetBlockerHook")
  readonly moduleType: "hook" | "executor" | "validator" | "fallback";
  readonly isInfrastructure: boolean; // If true, address is added to protected set
  readonly defaultAddresses?: Record<number, Address>; // chainId -> address
  readonly abi: readonly Record<string, unknown>[];

  encodeInitData(config: TConfig, trustedForwarder: Address): Hex;
  validateConfig(config: TConfig): void;
  toInstalledPolicy(config: TConfig, moduleAddress: Address): {
    moduleAddress: Address;
    moduleType: number;
    name: string;
  };
}
```

| Field | Purpose |
|---|---|
| `id` | Must match the `type` field in your config object. Used as the registry key. |
| `name` | Human-readable name shown in logs and wallet metadata. |
| `moduleType` | ERC-7579 module type. Most policies are `"hook"`. |
| `isInfrastructure` | If `true`, the deployed address is automatically added to the AllowlistHook's protected set, preventing the agent from calling it directly. |
| `defaultAddresses` | Per-chain deployed addresses. Keyed by chain ID (e.g., `{ 84532: "0x..." }`). |
| `abi` | The Solidity contract's ABI. Used for direct contract reads/writes. |
| `encodeInitData` | Produces the `onInstall` calldata for your Solidity hook. |
| `validateConfig` | Runtime validation. Throw `PolicyConfigError` on invalid config. |
| `toInstalledPolicy` | Maps config to the `InstalledPolicy` record stored on the wallet. |

## Step-by-Step: Create a Custom Policy

### 1. Write the Solidity Contract

Your hook must extend `ERC7579HookDestruct` (from ModuleKit v0.5.9) and implement `onInstall`/`onUninstall`/`preCheck`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { ERC7579HookDestruct } from "modulekit/modules/ERC7579HookDestruct.sol";

/// @title TargetBlockerHook
/// @notice Blocks all calls to a single target address per account.
contract TargetBlockerHook is ERC7579HookDestruct {
    mapping(address account => address blockedTarget) public blocked;
    mapping(address account => bool) private _initialized;

    error TargetBlocked(address target);
    error AlreadyInitialized();
    error NotInitialized();

    function onInstall(bytes calldata data) external override {
        if (_initialized[msg.sender]) revert AlreadyInitialized();
        (address trustedForwarder, address target) = abi.decode(data, (address, address));
        _setTrustedForwarder(trustedForwarder);
        blocked[msg.sender] = target;
        _initialized[msg.sender] = true;
    }

    function onUninstall(bytes calldata) external override {
        delete blocked[msg.sender];
        delete _initialized[msg.sender];
    }

    function isInitialized(address account) external view returns (bool) {
        return _initialized[account];
    }

    function preCheck(
        address, uint256, bytes calldata msgData
    ) external view override returns (bytes memory) {
        // msgData is the full calldata to the account's execute function.
        // Extract the target address (first 20 bytes of the inner call).
        if (msgData.length >= 20) {
            address target = address(bytes20(msgData[:20]));
            if (target == blocked[msg.sender]) revert TargetBlocked(target);
        }
        return "";
    }

    function postCheck(bytes calldata) external pure override {}
}
```

Key requirements:
- Extend `ERC7579HookDestruct` (not raw `IHook`)
- Call `_setTrustedForwarder()` in `onInstall` — this is required for the HookMultiPlexer to route calls
- Track initialization state to prevent double-install
- Implement `isInitialized()` for the HookMultiPlexer to check readiness

### 2. Test the Solidity Contract

Write Foundry tests for your hook:

```solidity
// test/TargetBlockerHook.t.sol
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../src/modules/TargetBlockerHook.sol";

contract TargetBlockerHookTest is Test {
    TargetBlockerHook hook;
    address account = address(0x1);
    address blockedTarget = address(0xBAD);

    function setUp() public {
        hook = new TargetBlockerHook();
        vm.prank(account);
        hook.onInstall(abi.encode(address(0), blockedTarget));
    }

    function test_blocksTarget() public {
        bytes memory msgData = abi.encodePacked(blockedTarget);
        vm.prank(account);
        vm.expectRevert();
        hook.preCheck(address(0), 0, msgData);
    }

    function test_allowsOtherTargets() public {
        bytes memory msgData = abi.encodePacked(address(0x999));
        vm.prank(account);
        hook.preCheck(address(0), 0, msgData);
        // No revert = pass
    }
}
```

Run with `forge test`.

### 3. Deploy the Contract

Deploy to a testnet using Foundry:

```bash
cd packages/contracts

forge create src/modules/TargetBlockerHook.sol:TargetBlockerHook \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY
```

Note the deployed address.

### 4. Define the TypeScript Plugin

```typescript
import { encodeAbiParameters, parseAbiParameters, type Address, type Hex } from "viem";
import { pluginRegistry, PolicyConfigError } from "@smartagentkit/sdk";
import type { PolicyPlugin } from "@smartagentkit/sdk";

interface TargetBlockerConfig {
  type: "target-blocker";
  target: Address;
}

export const targetBlockerPlugin: PolicyPlugin<TargetBlockerConfig> = {
  id: "target-blocker",
  name: "TargetBlockerHook",
  moduleType: "hook",
  isInfrastructure: false,
  abi: [], // Add your contract ABI here
  defaultAddresses: {
    84532: "0x..." as Address, // Base Sepolia deployment
  },

  encodeInitData(config, trustedForwarder) {
    return encodeAbiParameters(
      parseAbiParameters("address trustedForwarder, address target"),
      [trustedForwarder, config.target],
    );
  },

  validateConfig(config) {
    if (config.target === "0x0000000000000000000000000000000000000000") {
      throw new PolicyConfigError("Target cannot be zero address");
    }
  },

  toInstalledPolicy(config, moduleAddress) {
    return {
      moduleAddress,
      moduleType: 4, // hook
      name: "TargetBlockerHook",
    };
  },
};
```

The key constraint: `encodeInitData` must produce bytes that match what your Solidity `onInstall` decodes. Use `encodeAbiParameters` from viem with the same types.

### 5. Register and Use the Plugin

```typescript
pluginRegistry.register(targetBlockerPlugin);
```

After registration, the plugin works with all SDK functions:

```typescript
// Use with createWallet
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  policies: [
    { type: "emergency-pause", guardian: "0x..." },
    { type: "target-blocker", target: "0xBadContract..." } as any,
  ],
});

// Use with client.policies.install (post-deployment)
await client.policies.install(wallet, {
  plugin: "target-blocker",
  hookAddress: "0xDeployedAddress...",
  config: { type: "target-blocker", target: "0xBadContract..." },
}, ownerKey);
```

### 6. Deploy and Pass the Address

Pass the deployed address via `hookAddress` or register it as a default:

```typescript
// Option A: Pass explicitly
await client.policies.install(wallet, {
  plugin: "target-blocker",
  hookAddress: "0xDeployedAddress...",
  config: { type: "target-blocker", target: "0x..." },
}, ownerKey);

// Option B: Register as default
pluginRegistry.setDefaultAddress("target-blocker", 84532, "0xDeployedAddress...");
```

### 7. Test Enforcement

Write SDK-level tests to verify the plugin integrates correctly:

```typescript
import { describe, it, expect } from "vitest";
import { MockSmartAgentKitClient } from "@smartagentkit/testing";
import { pluginRegistry } from "@smartagentkit/sdk";
import { targetBlockerPlugin } from "./my-plugin";

// Register for tests
pluginRegistry.register(targetBlockerPlugin);

describe("TargetBlockerPlugin", () => {
  it("validates config", () => {
    expect(() =>
      targetBlockerPlugin.validateConfig({
        type: "target-blocker",
        target: "0x0000000000000000000000000000000000000000",
      })
    ).toThrow("Target cannot be zero address");
  });

  it("encodes init data", () => {
    const data = targetBlockerPlugin.encodeInitData(
      { type: "target-blocker", target: "0x1234567890abcdef1234567890abcdef12345678" },
      "0x0000000000000000000000000000000000000000",
    );
    expect(data).toMatch(/^0x/);
  });
});
```

## Using Your Own Deployments

If you've deployed the built-in hooks at different addresses (e.g., on a new chain), you can override them:

```typescript
// Override via moduleAddresses
const client = new SmartAgentKitClient({
  chain: myChain,
  rpcUrl: "...",
  bundlerUrl: "...",
  moduleAddresses: {
    spendingLimitHook: "0xMySpendingLimitHook",
    allowlistHook: "0xMyAllowlistHook",
    emergencyPauseHook: "0xMyEmergencyPauseHook",
  },
});

// Or set defaults on the registry
pluginRegistry.setDefaultAddress("spending-limit", myChain.id, "0xMySpendingLimitHook");
```

## `installRaw()` for Pre-encoded Hooks

For maximum control, use `installRaw()` to install a hook with pre-encoded init data:

```typescript
await client.policies.installRaw(wallet, {
  hookAddress: "0xMyCustomHook",
  moduleType: "hook",
  initData: "0x...", // Your pre-encoded onInstall data
}, ownerKey);
```

This skips plugin resolution and validation — you are responsible for encoding correctly.

## Plugin Registry API

| Method | Description |
|---|---|
| `pluginRegistry.register(plugin)` | Register a new plugin (throws on duplicate) |
| `pluginRegistry.replace(plugin)` | Override an existing registration |
| `pluginRegistry.get(id)` | Get plugin by ID (throws if not found) |
| `pluginRegistry.has(id)` | Check if a plugin is registered |
| `pluginRegistry.all()` | Get all registered plugins |
| `pluginRegistry.resolveAddress(id, chainId, overrides?)` | Resolve deployed address |
| `pluginRegistry.setDefaultAddress(id, chainId, address)` | Set a default address |
| `pluginRegistry.getInfrastructureAddresses(chainId, overrides?)` | Get all protected addresses |

## Contribution Checklist

When contributing a new built-in policy plugin, ensure:

- [ ] Solidity hook contract in `packages/contracts/src/modules/`
- [ ] Foundry tests with edge cases and fuzz tests in `packages/contracts/test/`
- [ ] TypeScript plugin definition in `packages/sdk/src/plugins/`
- [ ] Plugin registered in `packages/sdk/src/plugins/index.ts`
- [ ] Config type added to the `PolicyConfig` union in `packages/sdk/src/types.ts`
- [ ] Config validation in `validateConfig()` with clear error messages
- [ ] Address field added to `ModuleAddresses` interface
- [ ] Deployment mapping in `packages/sdk/src/deployments.ts`
- [ ] SDK tests in `packages/sdk/src/__tests__/plugins.test.ts`
- [ ] Documentation page or section in `apps/docs/`
- [ ] Example usage snippet
- [ ] Changeset entry (`pnpm changeset`)
