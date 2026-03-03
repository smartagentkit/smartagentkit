# @smartagentkit/sdk

## 0.1.9

### Patch Changes

- 75078c2: fix: pre-install Smart Sessions validator during wallet creation to enable session keys on wallets with hooks

## 0.1.8

### Patch Changes

- fix(sdk): register 0x00000000 selector for wildcard allowlist targets

## 0.1.7

### Patch Changes

- fix(sdk): wait for confirmations after initializePolicies UserOp

## 0.1.6

### Patch Changes

- fix(sdk): wait for 2 block confirmations in pause/unpause

## 0.1.5

### Patch Changes

- fix(sdk): clear factory data cache after deployment & wait for pause tx receipt,chore: docs, security audit fixes, CI, SDK deployment fix, and v0.1.4 release

## 0.1.4

### Patch Changes

- fix(sdk): two-phase HMP deployment to fix Safe7579 hook initialization,ci: auto-generate changesets and enforce on PRs

## 0.1.3

### Patch Changes

- Security hardening: EmergencyPauseHook upgraded to ERC7579HookDestruct with self-call/delegatecall/module blocking, AllowlistHook adds atomic setModeWithPermissions(), SDK adds Smart Sessions Validator to infrastructure blocklist and wallet self-address blocking, redeployed all contracts on Base Sepolia.

## 0.1.2

## 0.1.1

### Patch Changes

- 355840b: chore: test release flow
