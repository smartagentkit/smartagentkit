# SmartAgentKitClient

The main SDK client class for creating and managing policy-governed smart wallets.

## Constructor

```typescript
new SmartAgentKitClient(config: SmartAgentKitConfig)
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `config.chain` | `Chain` | Yes | viem Chain object (e.g. `baseSepolia`) |
| `config.rpcUrl` | `string` | Yes | JSON-RPC endpoint URL |
| `config.bundlerUrl` | `string` | Yes | ERC-4337 bundler URL (Pimlico) |
| `config.paymasterUrl` | `string` | No | Paymaster URL for gas sponsorship |
| `config.moduleAddresses` | `ModuleAddresses` | No | Custom module addresses (auto-resolved for Base Sepolia and Sepolia) |

```typescript
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { baseSepolia } from "viem/chains";

const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: "https://base-sepolia.g.alchemy.com/v2/...",
  bundlerUrl: "https://api.pimlico.io/v2/base-sepolia/rpc?apikey=...",
});
```

## Methods

### `createWallet`

```typescript
createWallet(params: CreateWalletParams): Promise<AgentWallet>
```

Deploy a new policy-governed smart wallet.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `params.owner` | `Address` | Yes | Owner address |
| `params.ownerPrivateKey` | `Hex` | No | Owner private key |
| `params.ownerMnemonic` | `string` | No | Owner mnemonic phrase |
| `params.addressIndex` | `number` | No | HD derivation index (default: 0) |
| `params.policies` | `PolicyConfig[]` | No | Array of policy configurations |
| `params.preset` | `PresetName` | No | Named preset (`defi-trader`, etc.) |
| `params.presetParams` | `Record<string, unknown>` | No | Override preset defaults |
| `params.salt` | `bigint` | No | CREATE2 salt for deterministic addresses |

**Returns:** `AgentWallet` with `address`, `owner`, `chain`, `isDeployed`, `policies`, `sessions`.

**Throws:** `WalletCreationError`

```typescript
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  preset: "defi-trader",
});
```

### `connectWallet`

```typescript
connectWallet(walletAddress: Address, ownerKey: SignerKey): Promise<void>
```

Reconnect to an existing deployed wallet.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `walletAddress` | `Address` | Yes | Address of the deployed wallet |
| `ownerKey` | `SignerKey` | Yes | Owner private key or mnemonic credential |

**Throws:** `WalletCreationError`

### `execute`

```typescript
execute(wallet: AgentWallet, params: ExecuteParams): Promise<Hex>
```

Execute a single transaction through the smart wallet.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `wallet` | `AgentWallet` | Yes | Wallet instance from `createWallet` |
| `params.target` | `Address` | Yes | Target contract address |
| `params.value` | `bigint` | No | ETH value to send (default: 0) |
| `params.data` | `Hex` | No | Calldata |
| `params.sessionKey` | `Hex` | No | Session key private key |

**Returns:** Transaction hash (`Hex`).

**Throws:** `ExecutionError`, `SpendingLimitExceededError`, `WalletPausedError`

```typescript
const txHash = await client.execute(wallet, {
  target: "0xRecipient...",
  value: parseEther("0.1"),
});
```

### `executeBatch`

```typescript
executeBatch(wallet: AgentWallet, params: ExecuteBatchParams): Promise<Hex>
```

Execute multiple transactions atomically. All calls succeed or all revert.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `wallet` | `AgentWallet` | Yes | Wallet instance |
| `params.calls` | `ExecuteParams[]` | Yes | Array of calls |
| `params.sessionKey` | `Hex` | No | Session key private key |

**Returns:** Transaction hash (`Hex`).

**Throws:** `ExecutionError`, `SpendingLimitExceededError`, `WalletPausedError`

```typescript
const txHash = await client.executeBatch(wallet, {
  calls: [
    { target: "0xA...", value: parseEther("0.05") },
    { target: "0xB...", data: "0x..." },
  ],
});
```

### `getRemainingAllowance`

```typescript
getRemainingAllowance(walletAddress: Address, token: Address): Promise<bigint>
```

Check remaining spending allowance for a token in the current window.

Use `NATIVE_TOKEN` (`0x0000000000000000000000000000000000000000`) for ETH.

```typescript
import { NATIVE_TOKEN } from "@smartagentkit/sdk";

const remaining = await client.getRemainingAllowance(wallet.address, NATIVE_TOKEN);
```

### `isPaused`

```typescript
isPaused(walletAddress: Address): Promise<boolean>
```

Check if a wallet is currently paused.

### `getBalances`

```typescript
getBalances(walletAddress: Address): Promise<{
  eth: bigint;
  tokens: Array<{ address: Address; balance: bigint }>;
}>
```

Get ETH and tracked token balances for a wallet.

### `pause`

```typescript
pause(walletAddress: Address, guardianKey: SignerKey): Promise<Hex>
```

Emergency pause -- freezes all wallet activity. This is a direct contract call (not a UserOp).

**Throws:** `ExecutionError`

### `unpause`

```typescript
unpause(walletAddress: Address, guardianKey: SignerKey): Promise<Hex>
```

Unpause the wallet. This is a direct contract call.

**Throws:** `ExecutionError`

### `createSession`

```typescript
createSession(
  wallet: AgentWallet,
  params: CreateSessionParams,
  ownerKey: SignerKey
): Promise<{ sessionKey: Address; privateKey: Hex; permissionId: Hex }>
```

Create a scoped session key for an agent.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `wallet` | `AgentWallet` | Yes | Wallet instance |
| `params.actions` | `SessionAction[]` | Yes | Allowed target/selector pairs |
| `params.expiresAt` | `number` | Yes | Unix timestamp in seconds |
| `params.spendingLimits` | `TokenLimit[]` | No | Session-specific spending limits |
| `ownerKey` | `SignerKey` | Yes | Owner key for signing enable data |

**Returns:** Object with `sessionKey` address, `privateKey`, and `permissionId`.

**Throws:** `SessionError`

```typescript
const session = await client.createSession(
  wallet,
  {
    actions: [{ target: "0xDex...", selector: "0xa9059cbb" }],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  },
  ownerPrivateKey
);
```

### `revokeSession`

```typescript
revokeSession(wallet: AgentWallet, permissionId: Hex, ownerKey: SignerKey): Promise<void>
```

Revoke a session key on-chain.

**Throws:** `SessionError`

### `getActiveSessions`

```typescript
getActiveSessions(walletAddress: Address): ActiveSession[]
```

Get active (non-expired) sessions.

::: warning
Sessions are stored in-memory only and do not persist across process restarts.
:::
