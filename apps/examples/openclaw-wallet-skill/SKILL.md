---
name: smartagentkit-wallet
description: Create, manage, and monitor policy-governed smart wallets for AI agents using SmartAgentKit CLI
homepage: https://github.com/smartagentkit/smartagentkit
requires:
  - smartagentkit CLI (install globally via `npm i -g smartagentkit`)
  - A funded wallet on Base Sepolia or Sepolia testnet
  - A Pimlico API key for the ERC-4337 bundler
  - Deployed SmartAgentKit module contracts (SpendingLimitHook, AllowlistHook, EmergencyPauseHook)
---

# SmartAgentKit Wallet Management

You can manage policy-governed smart wallets for AI agents using the `smartagentkit` CLI (alias: `sak`).

## Configuration

Before using wallet commands, configure the CLI:

```bash
# Interactive setup
sak config init

# Or set values individually
sak config set rpcUrl https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
sak config set bundlerUrl https://api.pimlico.io/v2/base-sepolia/rpc?apikey=YOUR_KEY
sak config set chain base-sepolia
```

View current config: `sak config show`
List supported chains: `sak config chains`

## Creating a Wallet

Create a new policy-governed smart wallet:

```bash
# With a preset (recommended)
sak create --preset defi-trader --owner 0xYOUR_ADDRESS --private-key 0xYOUR_KEY

# Available presets: defi-trader, treasury-agent, payment-agent, minimal
sak create --preset treasury-agent --owner 0xYOUR_ADDRESS --private-key 0xYOUR_KEY

# With custom policies (advanced)
sak create --owner 0xYOUR_ADDRESS --private-key 0xYOUR_KEY --spending-limit 1eth/day --allowlist 0xDEX1,0xDEX2
```

The command returns the deployed wallet address.

## Checking Wallet Status

```bash
sak status 0xWALLET_ADDRESS
```

Shows: balance, pause status, installed policies, active sessions, remaining spending allowances.

## Funding a Wallet

```bash
sak fund 0xWALLET_ADDRESS --amount 0.1
```

Sends ETH from the owner wallet to the smart wallet.

## Managing Policies

```bash
# List installed policies
sak policy list 0xWALLET_ADDRESS

# Add a new policy
sak policy add 0xWALLET_ADDRESS --type spending-limit --token ETH --limit 0.5 --window 1d --private-key 0xYOUR_KEY

# Remove a policy
sak policy remove 0xWALLET_ADDRESS --module 0xHOOK_ADDRESS --private-key 0xYOUR_KEY
```

## Emergency Pause/Unpause

```bash
# Pause immediately (blocks all transactions)
sak pause 0xWALLET_ADDRESS --private-key 0xGUARDIAN_KEY

# Unpause
sak unpause 0xWALLET_ADDRESS --private-key 0xGUARDIAN_KEY
```

Only the configured guardian can pause/unpause. This is a direct on-chain call, not a UserOperation.

## Session Key Management

```bash
# Create a time-limited session key
sak session create 0xWALLET_ADDRESS --expires 24h --target 0xDEX --selector 0xa9059cbb --private-key 0xOWNER_KEY

# List active sessions
sak session list 0xWALLET_ADDRESS

# Revoke a session
sak session revoke 0xWALLET_ADDRESS --permission-id 0xPERMISSION_ID --private-key 0xOWNER_KEY
```

## Important Notes

- All wallets use ERC-4337 (Account Abstraction) — transactions are UserOperations processed by a bundler
- Policy enforcement happens on-chain via ERC-7579 hook modules — the CLI cannot bypass them
- Spending limits are per-token with configurable time windows (hourly, daily, weekly)
- Session keys have strict time expiry — they cannot be extended, only recreated
- The `pause` command is a direct contract call by the guardian — it works even if the bundler is down
- Always use testnet first (Base Sepolia or Sepolia) before deploying to mainnet
