# CLI Usage

The `smartagentkit` CLI (command: `sak`) provides a terminal interface for creating wallets, managing policies, handling session keys, and controlling emergency pause.

## Install

```bash
npm install -g smartagentkit
# Provides: sak command
```

## Configuration

The CLI stores configuration in `~/.smartagentkit/config.json`. Initialize it first, then set your defaults:

```bash
# Initialize config file
sak config init

# Set defaults
sak config set rpcUrl https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
sak config set bundlerUrl https://api.pimlico.io/v2/84532/rpc?apikey=YOUR_KEY
sak config set chain base-sepolia

# View current config
sak config show

# Delete a config value
sak config delete paymasterUrl

# List supported chains
sak config chains
```

### Supported Chains

`base-sepolia`, `sepolia`, `base`, `optimism`, `arbitrum`, `polygon`, `ethereum`, `optimism-sepolia`, `arbitrum-sepolia`, `polygon-amoy`

## Create a Wallet

```bash
sak create \
  --owner 0xYourAddress \
  --owner-key 0xYourPrivateKey \
  --preset defi-trader \
  --chain base-sepolia
```

### Options

| Option | Description | Default |
|---|---|---|
| `--owner <address>` | Owner address (required) | -- |
| `--owner-key <hex>` | Private key (or `SAK_OWNER_KEY` env) | -- |
| `--owner-mnemonic <phrase>` | Mnemonic (or `SAK_OWNER_MNEMONIC` env) | -- |
| `--address-index <n>` | HD derivation index | 0 |
| `--preset <name>` | Policy preset | -- |
| `--chain <name>` | Target chain | base-sepolia |
| `--rpc-url <url>` | RPC URL | Config value |
| `--bundler-url <url>` | Bundler URL | Config value |
| `--salt <number>` | CREATE2 salt | -- |

## Check Wallet Status

```bash
sak status --wallet 0xWalletAddress
```

Displays the wallet's on-chain status, including whether it is paused and deployed module information.

## Fund Wallet (Testnet Faucets)

```bash
sak fund --chain base-sepolia
```

Prints links to testnet faucets for the specified chain. Does not send funds directly.

## Policy Management

```bash
# List installed policies
sak policy list --wallet 0xWalletAddress
```

::: info
`policy add` and `policy remove` commands are not yet implemented. Use the SDK programmatically to add or remove policies after wallet creation.
:::

## Emergency Pause / Unpause

```bash
# Pause the wallet (blocks all UserOps)
sak pause --wallet 0xWalletAddress --guardian-key 0xGuardianKey

# Unpause the wallet
sak unpause --wallet 0xWalletAddress --guardian-key 0xGuardianKey
```

The guardian key must correspond to the guardian address configured in the EmergencyPauseHook.

## Session Key Management

### Create a Session Key

```bash
sak session create \
  --wallet 0xWalletAddress \
  --owner-key 0xOwnerKey \
  --target 0xContractAddress \
  --selector 0x38ed1739 \
  --expires 3600
```

The `--expires` value is in seconds from now. The command outputs the session key, private key, and permission ID.

### List Active Sessions

```bash
sak session list --wallet 0xWalletAddress
```

### Revoke a Session

```bash
sak session revoke \
  --wallet 0xWalletAddress \
  --permission-id 0xPermissionId \
  --owner-key 0xOwnerKey
```

## Environment Variables

The CLI reads these environment variables as fallbacks for command-line options:

| Variable | Description |
|---|---|
| `SAK_OWNER_KEY` | Owner private key |
| `SAK_OWNER_MNEMONIC` | Owner mnemonic phrase |
| `SAK_RPC_URL` | RPC URL |
| `SAK_BUNDLER_URL` | Bundler URL |

Environment variables are overridden by explicit command-line flags. They are also overridden by values in the config file when both are present, so command-line flags take highest priority, followed by config file values, followed by environment variables.
