# Types

All TypeScript types exported by `@smartagentkit/sdk`, organized by category.

## Configuration

### `SmartAgentKitConfig`

```typescript
interface SmartAgentKitConfig {
  chain: Chain;
  rpcUrl: string;
  bundlerUrl: string;
  paymasterUrl?: string;
  moduleAddresses?: ModuleAddresses;
}
```

### `ModuleAddresses`

```typescript
interface ModuleAddresses {
  spendingLimitHook: Address;
  allowlistHook: Address;
  emergencyPauseHook: Address;
  automationExecutor?: Address;
  customModules?: Record<string, Address>; // Plugin ID -> address
}
```

## Credentials

### `SignerKey`

```typescript
type SignerKey = Hex | MnemonicCredential;
```

### `MnemonicCredential`

```typescript
interface MnemonicCredential {
  mnemonic: string;
  addressIndex?: number;
}
```

## Wallet

### `AgentWallet`

```typescript
interface AgentWallet {
  address: Address;
  owner: Address;
  chain: Chain;
  isDeployed: boolean;
  policies: InstalledPolicy[];
  sessions: ActiveSession[];
}
```

### `CreateWalletParams`

```typescript
interface CreateWalletParams {
  owner: Address;
  ownerPrivateKey?: Hex;
  ownerMnemonic?: string;
  addressIndex?: number;
  policies?: PolicyConfig[];
  preset?: PresetName;
  presetParams?: Record<string, unknown>;
  salt?: bigint;
}
```

## Policies

### `PresetName`

```typescript
type PresetName = "defi-trader" | "treasury-agent" | "payment-agent" | "minimal";
```

### `PolicyConfig`

```typescript
type PolicyConfig =
  | SpendingLimitPolicy
  | AllowlistPolicy
  | EmergencyPausePolicy
  | AutomationPolicy;
```

### `SpendingLimitPolicy`

```typescript
interface SpendingLimitPolicy {
  type: "spending-limit";
  limits: TokenLimit[];
}
```

### `TokenLimit`

```typescript
interface TokenLimit {
  token: Address;
  limit: bigint;
  window: number;
}
```

### `AllowlistPolicy`

```typescript
interface AllowlistPolicy {
  type: "allowlist";
  mode: "allow" | "block";
  targets: TargetPermission[];
  protectedAddresses?: Address[];
}
```

### `TargetPermission`

```typescript
interface TargetPermission {
  address: Address;
  selector?: Hex;
}
```

### `EmergencyPausePolicy`

```typescript
interface EmergencyPausePolicy {
  type: "emergency-pause";
  guardian: Address;
  autoUnpauseAfter?: number;
}
```

### `AutomationPolicy`

```typescript
interface AutomationPolicy {
  type: "automation";
  tasks: AutomationTask[];
}
```

### `AutomationTask`

```typescript
interface AutomationTask {
  id: string;
  caller: Address;
  target: Address;
  value?: bigint;
  calldata: Hex;
  cooldown: number;
  maxExecutions?: number;
}
```

### `InstalledPolicy`

```typescript
interface InstalledPolicy {
  moduleAddress: Address;
  moduleType: number;
  name: string;
  config: PolicyConfig;
}
```

## Execution

### `ExecuteParams`

```typescript
interface ExecuteParams {
  target: Address;
  value?: bigint;
  data?: Hex;
  sessionKey?: Hex;
}
```

### `ExecuteBatchParams`

```typescript
interface ExecuteBatchParams {
  calls: ExecuteParams[];
  sessionKey?: Hex;
}
```

## Sessions

### `CreateSessionParams`

```typescript
interface CreateSessionParams {
  sessionKey: Address;
  actions: SessionAction[];
  expiresAt: number;
  spendingLimits?: TokenLimit[];
}
```

### `SessionAction`

```typescript
interface SessionAction {
  target: Address;
  selector: Hex;
  rules?: SessionRule[];
}
```

### `SessionRule`

```typescript
interface SessionRule {
  offset: bigint;
  condition: "equal" | "greater" | "less" | "notEqual";
  value: Hex;
}
```

### `ActiveSession`

```typescript
interface ActiveSession {
  sessionKey: Address;
  actions: SessionAction[];
  expiresAt: number;
  isActive: boolean;
}
```

## Plugin Types

### `PolicyPlugin<TConfig>`

See [Policies API](/api/sdk/policies#plugin-architecture) for full documentation.

### `ModuleType`

```typescript
type ModuleType = "hook" | "executor" | "validator" | "fallback";
```

### `InstallPolicyParams`

```typescript
interface InstallPolicyParams {
  plugin: PolicyPlugin | string; // Plugin object or registered ID
  hookAddress?: Address;          // Override the hook address
  config: unknown;                // Plugin-specific config
}
```

### `InstallRawParams`

```typescript
interface InstallRawParams {
  hookAddress: Address;
  moduleType: "hook" | "executor" | "validator" | "fallback";
  initData: Hex;
  abi?: readonly Record<string, unknown>[];
}
```

## Client Interface

### `ISmartAgentKitClient`

The full interface implemented by both `SmartAgentKitClient` and `MockSmartAgentKitClient`.

```typescript
interface ISmartAgentKitClient {
  createWallet(params: CreateWalletParams): Promise<AgentWallet>;
  connectWallet(walletAddress: Address, ownerKey: SignerKey): Promise<void>;
  execute(wallet: AgentWallet, params: ExecuteParams): Promise<Hex>;
  executeBatch(wallet: AgentWallet, params: ExecuteBatchParams): Promise<Hex>;
  getRemainingAllowance(walletAddress: Address, token: Address): Promise<bigint>;
  isPaused(walletAddress: Address): Promise<boolean>;
  getBalances(
    walletAddress: Address
  ): Promise<{
    eth: bigint;
    tokens: Array<{ address: Address; balance: bigint }>;
  }>;
  pause(walletAddress: Address, guardianKey: SignerKey): Promise<Hex>;
  unpause(walletAddress: Address, guardianKey: SignerKey): Promise<Hex>;
  createSession(
    wallet: AgentWallet,
    params: CreateSessionParams,
    ownerKey: SignerKey
  ): Promise<{ sessionKey: Address; privateKey: Hex; permissionId: Hex }>;
  revokeSession(
    wallet: AgentWallet,
    permissionId: Hex,
    ownerKey: SignerKey
  ): Promise<void>;
  getActiveSessions(walletAddress: Address): ActiveSession[];
}
```
