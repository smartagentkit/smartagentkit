# LangChain Tools

The `@smartagentkit/langchain` package provides LangChain-compatible tools for AI agents to interact with SmartAgentKit wallets.

## `createSmartAgentKitTools`

```typescript
createSmartAgentKitTools(
  client: ISmartAgentKitClient,
  walletAddress: string,
  sessionKey?: string
): DynamicStructuredTool[]
```

Create an array of LangChain `DynamicStructuredTool` instances for wallet interaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `client` | `ISmartAgentKitClient` | Yes | SDK client or `MockSmartAgentKitClient` |
| `walletAddress` | `string` | Yes | Wallet address |
| `sessionKey` | `string` | No | Session key private key for scoped access |

**Returns:** Array of 5 `DynamicStructuredTool` instances.

```typescript
import { createSmartAgentKitTools } from "@smartagentkit/langchain";
import { SmartAgentKitClient } from "@smartagentkit/sdk";

const client = new SmartAgentKitClient({ ... });
const wallet = await client.createWallet({ ... });

const tools = createSmartAgentKitTools(client, wallet.address);
```

## Tools

All tools return JSON strings for LLM consumption.

### `check_wallet_balance`

Check the ETH balance of the wallet.

**Input schema:** `{}` (no inputs)

**Returns:**

```json
{
  "wallet": "0x...",
  "eth": "1.5",
  "ethWei": "1500000000000000000"
}
```

### `check_spending_allowance`

Check the remaining spending allowance for a token.

**Input schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `token` | `string` | Yes | Token address (use zero address for ETH) |

**Returns:**

```json
{
  "wallet": "0x...",
  "token": "0x0000000000000000000000000000000000000000",
  "remainingWei": "500000000000000000",
  "remaining": "0.5"
}
```

### `send_transaction`

Send a single transaction through the wallet.

**Input schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `target` | `string` | Yes | Target contract address |
| `value` | `string` | No | ETH value in wei |
| `data` | `string` | No | Calldata hex string |

**Returns (success):**

```json
{
  "success": true,
  "transactionHash": "0x..."
}
```

**Returns (failure):**

```json
{
  "success": false,
  "error": "Spending limit exceeded for 0x0000...0000: attempted 2000000000000000000, remaining 500000000000000000"
}
```

### `send_batch_transaction`

Send multiple transactions atomically through the wallet.

**Input schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `calls` | `Array<{ target, value?, data? }>` | Yes | Array of transaction calls |

**Returns (success):**

```json
{
  "success": true,
  "transactionHash": "0x...",
  "callCount": 3
}
```

**Returns (failure):**

```json
{
  "success": false,
  "error": "Wallet 0x... is currently paused"
}
```

### `check_wallet_status`

Check whether the wallet is paused.

**Input schema:** `{}` (no inputs)

**Returns:**

```json
{
  "wallet": "0x...",
  "paused": false,
  "status": "active"
}
```

## Usage with LangChain Agents

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { createSmartAgentKitTools } from "@smartagentkit/langchain";

const tools = createSmartAgentKitTools(client, wallet.address);

const llm = new ChatOpenAI({ model: "gpt-4" });
const agent = await createReactAgent({ llm, tools, prompt });
const executor = new AgentExecutor({ agent, tools });

const result = await executor.invoke({
  input: "Check my wallet balance and send 0.01 ETH to 0xAlice...",
});
```

## Usage with MockSmartAgentKitClient

The tools work identically with the mock client for testing:

```typescript
import { MockSmartAgentKitClient } from "@smartagentkit/testing";
import { createSmartAgentKitTools } from "@smartagentkit/langchain";

const mockClient = new MockSmartAgentKitClient();
const wallet = await mockClient.createWallet({ ... });
const tools = createSmartAgentKitTools(mockClient, wallet.address);
```
