# LangChain Integration

SmartAgentKit provides first-class LangChain integration through the `@smartagentkit/langchain` package. It exposes wallet operations as LangChain `DynamicStructuredTool` instances that any LangChain-compatible agent can use.

## Install

```bash
npm install @smartagentkit/langchain @langchain/core @langchain/openai
```

## Create Tools

```typescript
import { createSmartAgentKitTools } from "@smartagentkit/langchain";

const tools = createSmartAgentKitTools(client, wallet.address);
// Returns 5 DynamicStructuredTools
```

## Available Tools

### `check_wallet_balance`

Returns the wallet's ETH balance.

- **Input:** none
- **Output:** `{ wallet, eth, ethWei }`

### `check_spending_allowance`

Returns the remaining spending allowance for a given token.

- **Input:** `{ token: string }` -- Token address (`0x0000000000000000000000000000000000000000` for ETH)
- **Output:** `{ wallet, token, remainingWei, remaining }`

### `send_transaction`

Sends a single transaction from the wallet.

- **Input:** `{ target: string, value?: string, data?: string }`
- **Output:** `{ success, transactionHash }` or `{ success: false, error }`
- Subject to all policy constraints (spending limits, allowlist, pause state)

### `send_batch_transaction`

Sends multiple transactions atomically in a single UserOp.

- **Input:** `{ calls: [{ target, value?, data? }, ...] }`
- **Output:** `{ success, transactionHash, callCount }` or `{ success: false, error }`
- Atomic: all calls succeed or all revert

### `check_wallet_status`

Returns whether the wallet is paused.

- **Input:** none
- **Output:** `{ wallet, paused, status }`

## Using with a Session Key

Pass the session key's private key as the third argument to scope the agent's access:

```typescript
const tools = createSmartAgentKitTools(client, wallet.address, sessionPrivateKey);
```

All transactions sent through these tools will be signed with the session key and subject to the session's permission scope.

## Full Agent Example

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { createSmartAgentKitTools } from "@smartagentkit/langchain";
import { baseSepolia } from "viem/chains";

// Initialize SDK client
const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: process.env.RPC_URL!,
  bundlerUrl: process.env.BUNDLER_URL!,
});

const wallet = await client.createWallet({
  owner: "0xYourAddress",
  ownerPrivateKey: "0xYourPrivateKey",
  preset: "defi-trader",
});

// Create LangChain tools
const llm = new ChatOpenAI({ model: "gpt-4o" });
const tools = createSmartAgentKitTools(client, wallet.address);

// Create ReAct agent
const agent = createReactAgent({ llm, tools });
const executor = new AgentExecutor({ agent, tools });

const result = await executor.invoke({
  input: "Check my wallet balance and send 0.01 ETH to 0xRecipient",
});

console.log(result.output);
```

## Error Handling

All tools return JSON strings. On error, the response includes a `success: false` field with a descriptive error message:

```json
{
  "success": false,
  "error": "Spending limit exceeded for 0x0000...0000: attempted 1000000000000000000, remaining 500000000000000000"
}
```

The agent reads the error and decides how to proceed. Common errors include:

- **Spending limit exceeded** -- The transaction amount exceeds the remaining allowance for the token.
- **Target not allowed** -- The target address is not on the allowlist (or is on the blocklist).
- **Wallet is paused** -- The emergency pause is active; all transactions are blocked.
- **Session expired** -- The session key has passed its expiration time.
- **Action not permitted** -- The session key does not have permission for the requested call.

Because the errors are returned as structured JSON (not thrown exceptions), the LLM agent can parse them and take corrective action, such as reducing the transfer amount or selecting a different target.
