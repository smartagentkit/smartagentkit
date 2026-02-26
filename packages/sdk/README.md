# @smartagentkit/sdk

TypeScript SDK for deploying and managing policy-governed smart wallets for AI agents. Built on Safe + ERC-7579 + ERC-4337 (Account Abstraction), it provides spending limits, allowlists, emergency pause, and session key management out of the box.

## Install

```bash
npm install @smartagentkit/sdk viem permissionless
```

## Quick Start

```typescript
import { SmartAgentKitClient } from "@smartagentkit/sdk";
import { baseSepolia } from "viem/chains";

const client = new SmartAgentKitClient({
  chain: baseSepolia,
  rpcUrl: "https://base-sepolia.g.alchemy.com/v2/...",
  bundlerUrl: "https://api.pimlico.io/v2/base-sepolia/rpc?apikey=...",
});

// Deploy a wallet with spending limits and emergency pause
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  preset: "defi-trader",
});

// Execute a transaction (policies enforced on-chain)
await client.execute(wallet, {
  target: "0x...",
  value: 1000000000000000n,
});
```

## Features

- **Wallet Deployment** - Deploy Safe smart accounts with ERC-7579 modules
- **Spending Limits** - Per-token rolling-window spending caps
- **Allowlist/Blocklist** - Target and function-level access control
- **Emergency Pause** - Guardian-triggered kill switch with auto-unpause
- **Session Keys** - Scoped, time-limited keys for AI agent autonomy
- **Presets** - Pre-configured policy bundles (defi-trader, treasury-agent, etc.)

## Documentation

See the [main repository](https://github.com/smartagentkit/smartagentkit) for full documentation, examples, and the technical specification.

## License

MIT
