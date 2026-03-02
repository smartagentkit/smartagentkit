# CLI Command Reference

Full reference for the `smartagentkit` CLI, available as the `sak` command.

## Installation

```bash
npm install -g @smartagentkit/cli
```

## Global Options

All commands accept the following options:

| Option | Description |
|---|---|
| `--chain <name>` | Chain name (e.g. `base-sepolia`, `sepolia`) |
| `--rpc-url <url>` | JSON-RPC endpoint URL |
| `--bundler-url <url>` | ERC-4337 bundler URL |

## Commands

### `sak create`

Create a new agent wallet.

```bash
sak create --owner 0x... --owner-key 0x... --preset defi-trader --chain base-sepolia
```

| Option | Description | Required |
|---|---|---|
| `--owner <address>` | Owner address | Yes |
| `--owner-key <hex>` | Private key | One of key/mnemonic |
| `--owner-mnemonic <phrase>` | Mnemonic phrase | One of key/mnemonic |
| `--address-index <n>` | HD derivation index (default: 0) | No |
| `--preset <name>` | Policy preset | No |
| `--salt <number>` | CREATE2 salt for deterministic addresses | No |

### `sak status`

Show wallet status, balance, and installed policies.

```bash
sak status --wallet 0x...
```

| Option | Description | Required |
|---|---|---|
| `--wallet <address>` | Wallet address | Yes |

### `sak fund`

Print testnet faucet links for the specified chain.

```bash
sak fund --chain base-sepolia
```

| Option | Description | Required |
|---|---|---|
| `--chain <name>` | Chain to get faucet links for | No (uses config default) |

### `sak policy list`

List installed policies on a wallet.

```bash
sak policy list --wallet 0x...
```

| Option | Description | Required |
|---|---|---|
| `--wallet <address>` | Wallet address | Yes |

::: info
`policy add` and `policy remove` subcommands are not yet implemented.
:::

### `sak pause`

Emergency pause a wallet. Freezes all activity.

```bash
sak pause --wallet 0x... --guardian-key 0x...
```

| Option | Description | Required |
|---|---|---|
| `--wallet <address>` | Wallet address | Yes |
| `--guardian-key <hex>` | Guardian private key | Yes |

### `sak unpause`

Unpause a paused wallet.

```bash
sak unpause --wallet 0x... --guardian-key 0x...
```

| Option | Description | Required |
|---|---|---|
| `--wallet <address>` | Wallet address | Yes |
| `--guardian-key <hex>` | Guardian private key | Yes |

### `sak session create`

Create a scoped session key for an agent.

```bash
sak session create --wallet 0x... --owner-key 0x... --target 0xDex... --selector 0xa9059cbb --expires 7200
```

| Option | Description | Required |
|---|---|---|
| `--wallet <address>` | Wallet address | Yes |
| `--owner-key <hex>` | Owner private key | One of key/mnemonic |
| `--owner-mnemonic <phrase>` | Owner mnemonic | One of key/mnemonic |
| `--target <address>` | Target contract address | Yes |
| `--selector <hex>` | Function selector (4 bytes) | Yes |
| `--expires <seconds>` | Session duration in seconds (default: 3600) | No |

### `sak session list`

List active sessions on a wallet.

```bash
sak session list --wallet 0x...
```

| Option | Description | Required |
|---|---|---|
| `--wallet <address>` | Wallet address | Yes |

### `sak session revoke`

Revoke a session key on-chain.

```bash
sak session revoke --wallet 0x... --permission-id 0x... --owner-key 0x...
```

| Option | Description | Required |
|---|---|---|
| `--wallet <address>` | Wallet address | Yes |
| `--permission-id <hex>` | Permission ID to revoke | Yes |
| `--owner-key <hex>` | Owner private key | One of key/mnemonic |
| `--owner-mnemonic <phrase>` | Owner mnemonic | One of key/mnemonic |

### `sak config init`

Initialize the CLI configuration file at `~/.smartagentkit/config.json`.

```bash
sak config init
```

### `sak config show`

Print the current configuration.

```bash
sak config show
```

### `sak config set`

Set a configuration value.

```bash
sak config set rpcUrl https://base-sepolia.g.alchemy.com/v2/...
```

### `sak config delete`

Delete a configuration value.

```bash
sak config delete paymasterUrl
```

### `sak config chains`

List all supported chains with their chain IDs and RPC URLs.

```bash
sak config chains
```

## Environment Variables

Environment variables override CLI options. Useful for CI/CD and scripting.

| Variable | Overrides |
|---|---|
| `SAK_OWNER_KEY` | `--owner-key` |
| `SAK_OWNER_MNEMONIC` | `--owner-mnemonic` |
| `SAK_RPC_URL` | `--rpc-url` |
| `SAK_BUNDLER_URL` | `--bundler-url` |

```bash
export SAK_OWNER_KEY=0x...
export SAK_RPC_URL=https://...
export SAK_BUNDLER_URL=https://...

sak create --owner 0x... --preset minimal
```
