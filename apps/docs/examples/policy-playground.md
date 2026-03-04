# Policy Playground

The Policy Playground is a hands-on example that demonstrates the SmartAgentKit plugin architecture. It is the recommended starting point for anyone looking to write custom policies or understand how the SDK's extensibility works.

## What It Demonstrates

1. **Custom Plugin Definition** — A `TargetBlockerPlugin` that blocks calls to a specific address, implemented as a full `PolicyPlugin` object.
2. **Plugin Registration** — Registering custom plugins with `pluginRegistry` and querying the registry.
3. **Config Validation** — Runtime type checking before on-chain transactions.
4. **Init Data Encoding** — Producing the `onInstall` calldata that matches a Solidity contract's decoder.
5. **Address Resolution** — Default addresses, per-chain overrides, and the resolution priority chain.
6. **Infrastructure Addresses** — How `isInfrastructure` plugins are automatically protected.
7. **Mock Wallet Creation** — Creating wallets with both built-in and custom policies using the mock client.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/smartagentkit/smartagentkit.git
cd smartagentkit

# Install and build
pnpm install && pnpm build

# Run the playground in mock mode (no RPC needed)
cd apps/examples/policy-playground
pnpm start:mock
```

The playground runs through 7 steps and prints the results of each operation. No chain connection, funding, or API keys required in mock mode.

## Files

| File | Description |
|---|---|
| `src/custom-plugin.ts` | Example `PolicyPlugin<TargetBlockerConfig>` implementation |
| `src/playground.ts` | Main demo script that exercises the plugin API |
| `.env.example` | Environment variables for live-chain mode |

## What to Look At

Start with `src/custom-plugin.ts` to see how a plugin is defined:

```typescript
export const targetBlockerPlugin: PolicyPlugin<TargetBlockerConfig> = {
  id: "target-blocker",
  name: "TargetBlockerHook",
  moduleType: "hook",
  isInfrastructure: false,
  // ...
  encodeInitData(config, trustedForwarder) { /* ... */ },
  validateConfig(config) { /* ... */ },
  toInstalledPolicy(config, moduleAddress) { /* ... */ },
};
```

Then read `src/playground.ts` to see how the plugin is registered and used through the SDK.

## Adapting for Your Own Policy

To use the playground as a starting point for your own policy:

1. Copy `src/custom-plugin.ts` and rename it (e.g., `src/my-policy-plugin.ts`)
2. Change `id`, `name`, and the config interface to match your policy
3. Update `encodeInitData` to produce the bytes your Solidity `onInstall` expects
4. Update `validateConfig` with your own config checks
5. Import and register your plugin in `playground.ts` instead of the TargetBlockerPlugin
6. Run `pnpm start:mock` to verify registration, validation, and encoding work

Once your plugin works in the playground, move on to writing the Solidity hook and deploying it. See the [Custom Policies Guide](/guides/custom-policies) for the full end-to-end walkthrough.

## For Contributors

If you are thinking about contributing a new policy plugin, the playground is the fastest way to understand the full lifecycle:

1. Run it to see how plugins work end-to-end
2. Modify `custom-plugin.ts` to experiment with your own config/encoding
3. When ready, follow the [Custom Policies Guide](/guides/custom-policies) to build a real Solidity hook + TypeScript plugin

## Related

- [Custom Policies Guide](/guides/custom-policies) — Full walkthrough including Solidity contracts
- [Policy Configuration](/guides/policy-configuration) — Built-in policy reference
- [Policies API](/api/sdk/policies) — `pluginRegistry` and `client.policies` API reference
