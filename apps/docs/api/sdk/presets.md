# Presets

Pre-configured policy bundles for common AI agent use cases. Each preset is a function that returns a `PolicyConfig[]` array.

## Usage

```typescript
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  preset: "defi-trader",
  presetParams: { dailyEthLimit: parseEther("2") },
});
```

## `PRESETS` Record

```typescript
const PRESETS: Record<PresetName, (owner: Address, params?: Record<string, unknown>) => PolicyConfig[]>
```

## Available Presets

### `defi-trader`

Designed for autonomous DeFi trading agents with spending caps and DEX allowlists.

| Policy | Default | Override Param |
|---|---|---|
| Spending Limit | 1 ETH per day | `dailyEthLimit` |
| Allowlist | DEX contracts | `allowedDexes` |
| Emergency Pause | 24h auto-unpause | `guardian` |

```typescript
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  preset: "defi-trader",
  presetParams: {
    dailyEthLimit: parseEther("5"),
    guardian: "0xGuardian...",
  },
});
```

### `treasury-agent`

Designed for treasury management agents with higher limits and weekly windows.

| Policy | Default | Override Param |
|---|---|---|
| Spending Limit | 5 ETH per week | `weeklyEthLimit` |
| Emergency Pause | Manual unpause only | `guardian` |

```typescript
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  preset: "treasury-agent",
  presetParams: {
    weeklyEthLimit: parseEther("10"),
  },
});
```

### `payment-agent`

Designed for payment distribution bots with tight limits and recipient allowlists.

| Policy | Default | Override Param |
|---|---|---|
| Spending Limit | 0.1 ETH per day | `dailyLimit` |
| Allowlist | Approved recipients | `approvedRecipients` |
| Emergency Pause | 1h auto-unpause | `guardian` |

```typescript
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  preset: "payment-agent",
  presetParams: {
    approvedRecipients: ["0xAlice...", "0xBob..."],
  },
});
```

### `minimal`

Bare-minimum setup with only emergency pause. Useful for development and testing.

| Policy | Default | Override Param |
|---|---|---|
| Emergency Pause | Manual unpause only | `guardian` |

```typescript
const wallet = await client.createWallet({
  owner: "0x...",
  ownerPrivateKey: "0x...",
  preset: "minimal",
});
```

## Guardian Default

All presets default the guardian to the owner address if no `guardian` param is provided.
