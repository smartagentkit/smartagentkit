# SmartAgentKit — Project Context

> Open-source SDK + smart contract toolkit for deploying policy-governed smart contract wallets for AI agents on EVM chains.

## Quick Links

- **Full Specification:** `TECHNICAL-BLUE-PRINT-AND-SPECIFICATION.md`
- **Build Plan:** `BUILD-PLAN.md`
- **Agent Team Briefs:** `docs/agent-briefs/`

## Project State

- **Phase:** Active development (Phase 1 MVP)
- **Target:** Phase 1 MVP on Base Sepolia + Sepolia testnets
- **Stack:** Solidity (Foundry) + TypeScript (viem/permissionless.js) + Rhinestone ModuleKit

## Architecture Summary

```
Developer Layer (CLI, TS SDK, Framework Plugins)
       ↓
SmartAgentKit Core (TypeScript)
  - Wallet Factory (SDK-level, using Safe7579 launchpad)
  - Policy Manager (HookMultiPlexer + individual hooks)
  - UserOp Builder (via permissionless.js)
  - Session Manager (via Smart Sessions)
       ↓
Infrastructure (Pimlico Bundler, optional Paymaster)
       ↓
On-Chain Layer (Safe + ERC-7579 Adapter + Policy Modules)
```

## Critical Technical Decisions

### 1. Hook Multiplexer (MANDATORY)
ERC-7579 implementations only support ONE hook per account. We use Rhinestone's `HookMultiPlexer` as the single installed hook, which routes to our individual policy hooks (SpendingLimit, Allowlist, EmergencyPause). This is NOT optional — it's a hard architectural requirement.

**Reference:** `rhinestonewtf/core-modules` → HookMultiPlexer

### 2. No Custom Factory Contract
We do NOT deploy a custom `SmartAgentKitFactory.sol`. Instead, the SDK orchestrates wallet deployment using:
- `toSafeSmartAccount()` from permissionless.js
- Safe7579 launchpad for atomic module installation
- Pre-configured module init data assembled by the SDK

This avoids an unnecessary on-chain contract while providing the same DX.

### 3. Module Base Classes
All ERC-7579 modules MUST extend ModuleKit v0.5.9 base classes:
- Hooks → `ERC7579HookBase` or `ERC7579HookDestruct`
- Executors → `ERC7579ExecutorBase`
- Validators → `ERC7579ValidatorBase`

Do NOT inherit directly from `IHook`/`IExecutor` interfaces.

### 4. preCheck Interface
```solidity
function preCheck(
    address msgSender,   // caller address
    uint256 msgValue,    // ETH value sent
    bytes calldata msgData // full calldata
) external returns (bytes memory hookData);
```

### 5. Smart Sessions (Not Custom Session Keys)
Session key management uses Smart Sessions v1.0.0 (Rhinestone + Biconomy). We do NOT build custom session key validation. See: `erc7579/smartsessions` repo.

### 6. Account Base
- **Primary:** Safe + Safe7579 adapter (v1.4.1)
- **Secondary (future):** Kernel v3
- **EntryPoint:** v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`)

## Key Dependencies & Versions

| Dependency | Version | Purpose |
|---|---|---|
| Solidity | ^0.8.25 | Smart contracts |
| Foundry | latest | Dev/test/deploy |
| ModuleKit | v0.5.9 | Module development |
| safe7579 | latest | Safe ↔ ERC-7579 adapter |
| Smart Sessions | v1.0.0 | Session key management |
| viem | ^2.46.0 | Ethereum interactions |
| permissionless | ^0.2.0 | ERC-4337 utilities |
| @rhinestone/module-sdk | ^0.2.0 | Module management |
| TypeScript | ^5.5.0 | SDK language |
| Turborepo | latest | Monorepo management |

## Key Contract Addresses (Existing Infrastructure)

```
EntryPoint v0.7:       0x0000000071727De22E5E9d8BAf0edAc6f37da032
Safe7579 Module:       0x7579EE8307284F293B1927136486880611F20002
Safe7579 Launchpad:    0x7579011aB74c46090561ea277Ba79D510c6C00ff
Rhinestone Attester:   0x000000333034E9f539ce08819E12c1b8Cb29084d
```

## Coding Standards

- **Solidity:** Follow Foundry conventions. NatSpec on all public functions. Fuzz test all boundary conditions.
- **TypeScript:** ESM + CJS dual builds via tsup. Strict TypeScript. Vitest for testing.
- **Naming:** `SmartAgentKit` (product), `@smartagentkit/sdk` (npm), `smartagentkit` (CLI)
- **Error handling:** Custom error classes, never throw raw strings. In Solidity, use custom errors.
- **License:** MIT for contracts + SDK

## Monorepo Structure

```
smartagentkit/
├── CLAUDE.md                  ← You are here
├── BUILD-PLAN.md              ← Master build plan
├── packages/
│   ├── contracts/             ← Foundry project (Solidity)
│   ├── sdk/                   ← @smartagentkit/sdk (TypeScript)
│   ├── cli/                   ← smartagentkit CLI
│   └── integrations/
│       └── langchain/         ← @smartagentkit/langchain
├── apps/
│   ├── docs/                  ← Documentation site
│   └── examples/              ← Example projects
└── .github/workflows/         ← CI/CD
```
