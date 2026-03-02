# Deployment

This guide covers the deployed contract addresses, how to deploy SmartAgentKit modules to a new chain, gas costs, and contract verification.

## Deployed Contracts

SmartAgentKit modules are deployed on the following chains.

### Base Sepolia (Chain ID: 84532)

| Contract | Address |
|---|---|
| SpendingLimitHook | `0x0ea97ef2fc52700d1628110a8f411fefb0c0aa8b` |
| AllowlistHook | `0x61a2100072d03f66de6f7dd0dfc2f7aa5c91e777` |
| EmergencyPauseHook | `0xb8fdc9ee56cfb4077e132eff631b546fe6e79fec` |
| AutomationExecutor | `0x729c29b35c396b907ed118f00fbe4d4bcc3a7f46` |

### Infrastructure Contracts (Same on All EVM Chains)

| Contract | Address |
|---|---|
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Safe7579 Module | `0x7579EE8307284F293B1927136486880611F20002` |
| Safe7579 Launchpad | `0x7579011aB74c46090561ea277Ba79D510c6C00ff` |
| Rhinestone Attester | `0x000000333034E9f539ce08819E12c1b8Cb29084d` |
| HookMultiPlexer | `0xF6782ed057F95f334D04F0Af1Af4D14fb84DE549` |

## Auto-Resolution

The SDK automatically resolves module addresses for deployed chains. You do **not** need to specify `moduleAddresses` when using Base Sepolia or Sepolia:

```typescript
const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: "...",
  bundlerUrl: "...",
  // moduleAddresses not needed -- auto-resolved
});
```

For other chains, deploy the modules first and pass the addresses explicitly:

```typescript
import { optimism } from "viem/chains";

const client = new SmartAgentKitClient({
  chain: optimism,
  rpcUrl: "...",
  bundlerUrl: "...",
  moduleAddresses: {
    spendingLimitHook: "0x...",
    allowlistHook: "0x...",
    emergencyPauseHook: "0x...",
    automationExecutor: "0x...",
  },
});
```

## Deploying to a New Chain

### Prerequisites

- [Foundry](https://book.getfoundry.sh/) installed
- A funded deployer account on the target chain
- An RPC URL for the target chain

### Using Foundry

```bash
cd packages/contracts

# Set environment
export PRIVATE_KEY=0x...
export RPC_URL=https://...

# Deploy all modules
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify
```

The deploy script deploys all four modules:
- SpendingLimitHook
- AllowlistHook
- EmergencyPauseHook
- AutomationExecutor

The infrastructure contracts (EntryPoint, Safe7579, HookMultiPlexer) are already deployed on all major EVM chains and do not need to be redeployed.

## Gas Costs

Median gas costs from `forge test --gas-report`:

| Operation | Gas |
|---|---|
| SpendingLimitHook.preCheck | ~54,000 |
| AllowlistHook.preCheck | ~32,000 |
| EmergencyPauseHook.preCheck | ~28,000 |
| HookMultiPlexer.preCheck (3 hooks) | ~87,000 |

The total hook overhead is approximately **87,000 gas per UserOp** when all three hooks are installed. This is the cost of the HookMultiPlexer routing to each sub-hook's `preCheck` function.

Note that the HookMultiPlexer cost is less than the sum of individual hooks because it batches the calls and avoids redundant storage reads.

## Contract Verification

After deploying, verify contracts on the block explorer so that users can read the source code and interact with them directly:

```bash
forge verify-contract \
  --chain-id 84532 \
  --compiler-version v0.8.29 \
  0xCONTRACT_ADDRESS \
  src/modules/SpendingLimitHook.sol:SpendingLimitHook
```

Repeat for each deployed contract, substituting the address and contract path:

```bash
# AllowlistHook
forge verify-contract \
  --chain-id 84532 \
  --compiler-version v0.8.29 \
  0xCONTRACT_ADDRESS \
  src/modules/AllowlistHook.sol:AllowlistHook

# EmergencyPauseHook
forge verify-contract \
  --chain-id 84532 \
  --compiler-version v0.8.29 \
  0xCONTRACT_ADDRESS \
  src/modules/EmergencyPauseHook.sol:EmergencyPauseHook

# AutomationExecutor
forge verify-contract \
  --chain-id 84532 \
  --compiler-version v0.8.29 \
  0xCONTRACT_ADDRESS \
  src/modules/AutomationExecutor.sol:AutomationExecutor
```

If verification fails, ensure you are using the exact same compiler version and optimizer settings as the deployment. The project uses `via_ir = true` in `foundry.toml`, which must match during verification.
