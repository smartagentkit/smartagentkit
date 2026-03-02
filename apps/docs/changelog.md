# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-02-23

Initial release of SmartAgentKit.

### Added

#### Solidity Modules (`packages/contracts`)
- **SpendingLimitHook** -- Per-token spending caps with rolling time windows
- **AllowlistHook** -- Allowlist/blocklist for target contracts and function selectors, with wildcard selector support
- **EmergencyPauseHook** -- Circuit breaker with guardian-controlled pause and optional auto-unpause timeout
- **HookMultiPlexer** integration -- Route multiple hooks through a single ERC-7579 hook slot
- **AutomationExecutor** -- Scheduled task execution for automated wallet operations
- Deploy script (`script/Deploy.s.sol`) for all modules
- Full Foundry test suite (118 tests)

#### TypeScript SDK (`@smartagentkit/sdk`)
- `SmartAgentKitClient` -- Create and manage policy-governed smart wallets
- Wallet creation with configurable policies and presets (`defi-trader`, `treasury-agent`, `payment-agent`, `minimal`)
- Transaction execution with policy enforcement
- Spending allowance queries
- Emergency pause/unpause
- Session key management via Smart Sessions (ERC-7579)
- Safe + ERC-7579 adapter integration via permissionless.js
- Vitest test suite (50 tests)

#### CLI (`smartagentkit` / `sak`)
- `sak create` -- Create wallets with presets
- `sak status` -- Check wallet balances and status
- `sak fund` -- Testnet faucet links
- `sak policy list|add|remove` -- Manage policies
- `sak pause` / `sak unpause` -- Emergency controls
- `sak session create|list|revoke` -- Session key management
- `sak config show|set|delete|chains|init` -- Configuration management
- Persistent config at `~/.smartagentkit/config.json`
- Vitest test suite (23 tests)

#### LangChain Integration (`@smartagentkit/langchain`)
- `createSmartAgentKitTools()` -- Generate LangChain tools from SDK client
- Tools: `check_wallet_balance`, `check_spending_allowance`, `send_transaction`, `send_batch_transaction`, `check_wallet_status`
- Compatible with LangGraph ReAct agents
- Vitest test suite (16 tests)

#### Testing (`@smartagentkit/testing`)
- `MockSmartAgentKitClient` -- In-memory mock with policy enforcement
- All 4 presets supported (`defi-trader`, `treasury-agent`, `payment-agent`, `minimal`)
- Mock-specific methods: `getLog()`, `setState()`, `getWalletState()`
- Vitest test suite (15 tests)

#### Examples
- **DeFi Trading Agent** -- LangChain + LangGraph agent with autonomous trading within policy guardrails
- **Treasury Management Agent** -- Claude (Anthropic) with batch rebalancing
- **Payment Distribution Bot** -- Scheduled multi-recipient payouts with allowlist
- **Monitoring & Alerts Agent** -- Guardian pattern with auto-pause
- **Arbitrage Agent** -- Session keys with atomic buy+sell execution

#### Infrastructure
- Turborepo monorepo with pnpm workspaces
- GitHub Actions CI (build + test on PR)
- Foundry for Solidity development and testing
- Deployed on Base Sepolia
