# LLM API Reference

Condensed API reference for AI agents using SmartAgentKit. Zero prose -- signatures, inputs, outputs, errors only.

## SDK: SmartAgentKitClient

### Constructor

```
new SmartAgentKitClient({ chain, rpcUrl, bundlerUrl, paymasterUrl?, moduleAddresses? })
```

### createWallet(params) -> AgentWallet

```
Input: {
  owner: Address,
  ownerPrivateKey?: Hex,
  preset?: "defi-trader" | "treasury-agent" | "payment-agent" | "minimal",
  policies?: PolicyConfig[],
  presetParams?: Record<string, unknown>,
  salt?: bigint
}
Output: { address, owner, chain, isDeployed, policies, sessions }
Error: WalletCreationError
```

### connectWallet(params) -> AgentWallet

```
Input: { address: Address }
Output: { address, owner, chain, isDeployed, policies, sessions }
Error: WalletCreationError
```

### execute(wallet, params) -> Hex

```
Input: { target: Address, value?: bigint, data?: Hex, sessionKey?: Hex }
Output: Transaction hash
Errors: ExecutionError, SpendingLimitExceededError, WalletPausedError
```

### executeBatch(wallet, params) -> Hex

```
Input: { calls: Array<{ target, value?, data? }>, sessionKey?: Hex }
Output: Transaction hash (atomic -- all calls succeed or all revert)
Errors: ExecutionError, SpendingLimitExceededError, WalletPausedError
```

### getRemainingAllowance(walletAddress, token) -> bigint

```
Use NATIVE_TOKEN (0x0000000000000000000000000000000000000000) for ETH.
```

### isPaused(walletAddress) -> boolean

### getBalances(walletAddress) -> { eth: bigint, tokens: Array<{ address, balance }> }

### pause(walletAddress, guardianKey) -> Hex

```
Direct contract call. Not a UserOp. Requires guardian key.
```

### unpause(walletAddress, guardianKey) -> Hex

### createSession(wallet, params, ownerKey) -> { sessionKey, privateKey, permissionId }

```
Input params: { actions: Array<{ target, selector, rules? }>, expiresAt: number }
Error: SessionError
```

### revokeSession(wallet, permissionId, ownerKey) -> void

### getActiveSessions(walletAddress) -> ActiveSession[]

```
In-memory only. Does not persist across SDK restarts.
```

## LangChain Tools

```
createSmartAgentKitTools(client, walletAddress, sessionKey?) -> DynamicStructuredTool[]
```

### check_wallet_balance

```
Input: none
Output: { wallet, eth, ethWei }
```

### check_spending_allowance

```
Input: { token: Address }
Output: { wallet, token, remainingWei, remaining }
```

### send_transaction

```
Input: { target, value?, data? }
Output: { success, transactionHash } or { success: false, error }
```

### send_batch_transaction

```
Input: { calls: [{ target, value?, data? }] }
Output: { success, transactionHash, callCount } or { success: false, error }
```

### check_wallet_status

```
Input: none
Output: { wallet, paused, status }
```

## Error Codes

| Error | Message Pattern | Thrown By |
|---|---|---|
| WalletCreationError | "Wallet creation failed: {msg}" | createWallet, connectWallet |
| PolicyConfigError | "Invalid policy configuration: {msg}" | Policy encoding functions |
| ExecutionError | "Transaction execution failed: {msg}" | execute, executeBatch, pause, unpause |
| SpendingLimitExceededError | "Spending limit exceeded for {token}: attempted {n}, remaining {n}" | execute, executeBatch |
| WalletPausedError | "Wallet {addr} is currently paused" | execute, executeBatch |
| SessionError | "Session error: {msg}" | createSession, revokeSession |

## Constants

```
NATIVE_TOKEN = 0x0000000000000000000000000000000000000000
WINDOW_1_HOUR = 3600
WINDOW_1_DAY = 86400
WINDOW_1_WEEK = 604800
```

## Presets

```
defi-trader:     1 ETH/day + DEX allowlist + 24h auto-unpause
treasury-agent:  5 ETH/week + manual unpause
payment-agent:   0.1 ETH/day + recipient allowlist + 1h auto-unpause
minimal:         emergency pause only
```
