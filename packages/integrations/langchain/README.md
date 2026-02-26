# @smartagentkit/langchain

LangChain integration for SmartAgentKit. Provides pre-built tools that let LangChain agents interact with policy-governed smart wallets: check balances, send transactions, query spending allowances, and monitor wallet status.

## Install

```bash
npm install @smartagentkit/langchain @smartagentkit/sdk @langchain/core
```

## Quick Start

```typescript
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { createSmartAgentKitTools } from "@smartagentkit/langchain";
import { baseSepolia } from "viem/chains";

const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: "https://...",
  bundlerUrl: "https://...",
});

const wallet = await client.createWallet({ /* ... */ });
const tools = createSmartAgentKitTools(client, wallet);

// Use with any LangChain agent
// tools: check_wallet_balance, check_spending_allowance,
//        send_transaction, check_wallet_status
```

## Tools

- **check_wallet_balance** - Get ETH balance of the agent wallet
- **check_spending_allowance** - Query remaining spending limit for a token
- **send_transaction** - Execute a transaction through the smart wallet
- **check_wallet_status** - Check if the wallet is paused

## Documentation

See the [main repository](https://github.com/smartagentkit/smartagentkit) for full documentation, examples, and the technical specification.

## License

MIT
