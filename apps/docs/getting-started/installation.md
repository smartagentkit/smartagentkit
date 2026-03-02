# Installation

## SDK (Required)

The core SDK provides wallet creation, policy management, transaction execution, and session key support.

```bash
npm install @smartagentkit/sdk
# or
pnpm add @smartagentkit/sdk
# or
yarn add @smartagentkit/sdk
```

## LangChain Integration (Optional)

Drop-in tools for using SmartAgentKit from a LangChain agent.

```bash
npm install @smartagentkit/langchain @langchain/core
```

Requires `@langchain/core` as a peer dependency. If you are using a specific LLM provider (e.g., `@langchain/openai`, `@langchain/anthropic`), install that separately.

## Testing Package (Optional)

In-memory mock client for testing agent workflows without deploying contracts or funding wallets.

```bash
npm install -D @smartagentkit/testing
```

This is a dev dependency -- you should not ship it in production.

## CLI (Optional)

Command-line interface for creating wallets, managing policies, and monitoring status.

```bash
npm install -g smartagentkit
# Provides the `sak` command
```

After installation, initialize your configuration:

```bash
sak config init
```

## Environment Setup

Create a `.env` file in your project root:

```env
RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
BUNDLER_URL=https://api.pimlico.io/v2/84532/rpc?apikey=YOUR_KEY
OWNER_PRIVATE_KEY=0x...
```

### RPC URL

Any Base Sepolia JSON-RPC endpoint. Options:

- [Alchemy](https://www.alchemy.com/) (free tier available)
- [Infura](https://www.infura.io/) (free tier available)
- Public RPC: `https://sepolia.base.org` (rate-limited, not recommended for production)

### Bundler URL

An ERC-4337 bundler is required to submit UserOperations. SmartAgentKit is tested with [Pimlico](https://pimlico.io):

1. Sign up at [pimlico.io](https://pimlico.io)
2. Create a project and select Base Sepolia (chain ID `84532`)
3. Copy your API key into the bundler URL

### Owner Private Key

The private key of the wallet owner account. This key:

- Signs UserOperations to authorize transactions
- Pays for gas (unless a paymaster is configured)
- Controls policy changes and wallet administration

::: warning
Never commit your private key to version control. Use `.env` files and add `.env` to your `.gitignore`.
:::

## For Solidity Developers

If you want to extend the policy modules, write custom hooks, or deploy contracts to new chains:

### Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Clone and Build

```bash
git clone https://github.com/smartagentkit/smartagentkit.git
cd smartagentkit/packages/contracts
forge install
forge build
```

### Run Tests

```bash
forge test
```

### Deploy to a New Chain

```bash
forge script script/Deploy.s.sol \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify
```

This deploys all four modules: SpendingLimitHook, AllowlistHook, EmergencyPauseHook, and AutomationExecutor.

## Verify Your Setup

Run this script to confirm everything is working:

```typescript
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { baseSepolia } from "viem/chains";

const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: process.env.RPC_URL!,
  bundlerUrl: process.env.BUNDLER_URL!,
});

console.log("SmartAgentKit client created successfully");
console.log(`Chain: ${client.chain.name} (${client.chain.id})`);
```

If this runs without errors, your environment is correctly configured.

## Next Steps

- [Quickstart](/getting-started/quickstart) — Deploy your first agent wallet
- [Core Concepts](/getting-started/concepts) — Understand the architecture
