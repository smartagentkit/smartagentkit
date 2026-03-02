# Quickstart

Deploy a policy-governed smart wallet for your AI agent in under 5 minutes.

## Prerequisites

- **Node.js 22+**
- **A Pimlico account** for the bundler URL — sign up at [pimlico.io](https://pimlico.io)
- **A funded wallet on Base Sepolia** to pay for gas (get testnet ETH from a faucet)

## Install

```bash
npm install @smartagentkit/sdk
```

## 1. Create a Client

```typescript
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { baseSepolia } from "viem/chains";

const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: process.env.RPC_URL!,
  bundlerUrl: process.env.BUNDLER_URL!,
});
```

## 2. Deploy a Wallet

The `defi-trader` preset configures spending limits, an allowlist, and emergency pause out of the box.

```typescript
const wallet = await client.createWallet({
  owner: "0xYourAddress",
  ownerPrivateKey: "0xYourPrivateKey",
  preset: "defi-trader",
});

console.log(`Wallet deployed at: ${wallet.address}`);
```

The wallet is deployed as a Safe smart account with the Safe7579 adapter and all policy hooks installed atomically in a single transaction.

## 3. Execute a Transaction

```typescript
import { encodeFunctionData, erc20Abi, parseEther } from "viem";

const txHash = await client.execute(wallet, {
  target: "0xTokenAddress",
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: ["0xRecipient", parseEther("100")],
  }),
});

console.log(`Transaction: ${txHash}`);
```

If this transaction would exceed the spending limit or call a contract not on the allowlist, it will revert on-chain. The agent cannot bypass these checks.

## 4. Check Remaining Allowance

```typescript
import { formatEther } from "viem";
import { NATIVE_TOKEN } from "@smartagentkit/sdk";

const remaining = await client.getRemainingAllowance(
  wallet.address,
  NATIVE_TOKEN,
);

console.log(`Remaining: ${formatEther(remaining)} ETH`);
```

## Try Mock Mode (No Testnet Needed)

You can test the entire SDK workflow without deploying contracts, running a bundler, or funding a wallet.

```bash
npm install @smartagentkit/testing
```

```typescript
import { MockSmartAgentKitClient } from "@smartagentkit/testing";

const client = new MockSmartAgentKitClient();

const wallet = await client.createWallet({
  owner: "0xYourAddress",
  preset: "defi-trader",
});

// Works instantly — no RPC, bundler, or funds needed
console.log(`Mock wallet: ${wallet.address}`);

// Policy enforcement still works in mock mode
const remaining = await client.getRemainingAllowance(
  wallet.address,
  "0x0000000000000000000000000000000000000000",
);
```

The mock client enforces spending limits, allowlists, and pause state entirely in-memory, so you can validate your agent logic before touching a testnet.

## Next Steps

- [Installation](/getting-started/installation) — Set up all packages and environment variables
- [Core Concepts](/getting-started/concepts) — Understand Account Abstraction, ERC-7579, and the hook architecture
- [Wallet Creation Guide](/guides/wallet-creation) — Deep dive into wallet configuration and presets
- [Policy Configuration Guide](/guides/policy-configuration) — Configure spending limits, allowlists, and pause
- [LangChain Integration Guide](/guides/langchain-integration) — Use SmartAgentKit tools in a LangChain agent
