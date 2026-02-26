# smartagentkit

CLI tool for managing policy-governed AI agent smart wallets. Create wallets, configure spending limits, manage session keys, and monitor wallet status from the command line.

## Install

```bash
npm install -g smartagentkit
```

## Quick Start

```bash
# Initialize configuration
sak config init

# Create a wallet with the defi-trader preset
sak create --preset defi-trader --owner 0x...

# Check wallet status
sak status 0x...

# Add a spending limit policy
sak policy add --type spending-limit --token 0x... --limit 1000000000000000000 --window 86400

# Pause a wallet (emergency)
sak pause 0x... --guardian-key 0x...
```

## Commands

- `sak create` - Deploy a new agent wallet
- `sak status` - Check wallet status and balances
- `sak fund` - Fund a wallet with ETH
- `sak policy` - Manage spending limits, allowlists, and pause policies
- `sak pause` / `sak unpause` - Emergency pause controls
- `sak session` - Create, list, and revoke session keys
- `sak config` - Manage CLI configuration

## Documentation

See the [main repository](https://github.com/smartagentkit/smartagentkit) for full documentation and examples.

## License

MIT
