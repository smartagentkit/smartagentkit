# Custom Policies

SmartAgentKit has a **plugin architecture** for policies. Built-in policies (SpendingLimit, Allowlist, EmergencyPause) are plugins, and you can register your own custom plugins to extend wallet behavior with new on-chain hooks.

## What Is a Policy Plugin?

A policy plugin is a self-contained object that defines:

- **Metadata** — ID, name, module type, whether it's infrastructure
- **Encoding** — How to produce the `onInstall` init data for your Solidity contract
- **Validation** — Runtime checks on config before sending a transaction
- **Default addresses** — Per-chain deployed contract addresses
- **ABI** — The on-chain contract's ABI

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

## Step-by-Step: Create a Custom Policy

### 1. Write the Solidity Contract

Your hook must extend `ERC7579HookDestruct` (from ModuleKit v0.5.9) and implement `onInstall`/`onUninstall`/`preCheck`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { ERC7579HookDestruct } from "modulekit/modules/ERC7579HookDestruct.sol";

contract TargetBlockerHook is ERC7579HookDestruct {
    mapping(address account => address blockedTarget) public blocked;

    function onInstall(bytes calldata data) external override {
        (address trustedForwarder, address target) = abi.decode(data, (address, address));
        _setTrustedForwarder(trustedForwarder);
        blocked[msg.sender] = target;
    }

    function onUninstall(bytes calldata) external override {
        delete blocked[msg.sender];
    }

    function preCheck(
        address, uint256, bytes calldata msgData
    ) external view override returns (bytes memory) {
        address target = address(bytes20(msgData[:20]));
        require(target != blocked[msg.sender], "Target is blocked");
        return "";
    }
    // ... postCheck, isInitialized, etc.
}
```

### 2. Define the Plugin

```typescript
import { encodeAbiParameters, parseAbiParameters, type Address, type Hex } from "viem";
import { pluginRegistry, PolicyConfigError } from "@smartagentkit/sdk";
import type { PolicyPlugin } from "@smartagentkit/sdk";

interface TargetBlockerConfig {
  type: "target-blocker";
  target: Address;
}

const targetBlockerPlugin: PolicyPlugin<TargetBlockerConfig> = {
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

### 3. Register the Plugin

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

// Use with client.policies.install
await client.policies.install(wallet, {
  plugin: "target-blocker",
  config: { type: "target-blocker", target: "0xBadContract..." },
}, ownerKey);
```

### 4. Deploy the Contract

Use Foundry to deploy your hook contract:

```bash
forge create src/TargetBlockerHook.sol:TargetBlockerHook \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY
```

Then pass the address via `hookAddress` or register it as a default:

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

This skips plugin resolution and validation — you're responsible for encoding correctly.

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

## Contributing a Built-in Policy

To add a new built-in policy plugin:

1. Create `packages/sdk/src/plugins/my-policy.ts` following the existing patterns
2. Register it in `packages/sdk/src/plugins/index.ts`
3. Add the type to the `PolicyConfig` union in `types.ts`
4. Add address field to `ModuleAddresses` interface
5. Add the deployment mapping in `deployments.ts`
6. Add tests in `packages/sdk/src/__tests__/plugins.test.ts`
7. Update this guide and the API docs
