# Session Keys

Session keys allow you to grant AI agents scoped, time-limited access to your smart wallet. Instead of sharing the owner's private key, you create a session key that can only call specific contracts and functions, with optional parameter-level constraints.

## What Are Session Keys?

- **Scoped** — Each session key is restricted to specific contract addresses and function selectors.
- **Time-limited** — Sessions have an expiration timestamp. After expiry, the key is useless.
- **On-chain enforcement** — Permissions are enforced by the Smart Sessions validator module (ERC-7579), not just client-side checks.
- **Damage-limited** — If a session key is leaked, the attacker can only perform the actions allowed by the session's permission scope.

### Architecture

Smart Sessions (developed by Rhinestone and Biconomy) is an ERC-7579 validator module. The wallet owner installs it and creates permission structures that map session keys to allowed actions. When an agent submits a UserOp signed with a session key, the Smart Sessions validator checks the signature and enforces the permission scope entirely on-chain.

## Creating a Session

```typescript
const session = await client.createSession(wallet, {
  actions: [
    {
      target: "0xDeFiRouter",
      selector: "0x38ed1739", // swapExactTokensForTokens
    },
    {
      target: "0xTokenAddress",
      selector: "0xa9059cbb", // transfer
      rules: [{
        offset: 32n,                                    // Check 2nd param (amount)
        condition: "less",
        value: "0x00000000000000000000000000000000000000000000000000038d7ea4c68000", // < 0.001 ETH
      }],
    },
  ],
  expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour
}, ownerPrivateKey);

console.log(`Session key: ${session.sessionKey}`);
console.log(`Private key: ${session.privateKey}`);
console.log(`Permission ID: ${session.permissionId}`);
```

The `createSession` method:
1. Generates a new key pair for the session.
2. Builds the permission structure from the provided actions and rules.
3. Installs the Smart Sessions validator module (if not already installed).
4. Has the owner sign the enable details to authorize the session.
5. Returns the session key, private key, and permission ID.

## Using a Session Key

Pass the session key's private key when executing transactions:

```typescript
await client.execute(wallet, {
  target: "0xDeFiRouter",
  data: encodeFunctionData({...}),
  sessionKey: session.privateKey,
});
```

The UserOp will be signed with the session key instead of the owner key. The Smart Sessions validator verifies that the call is within the session's allowed scope.

## Revoking a Session

```typescript
await client.revokeSession(wallet, session.permissionId, ownerPrivateKey);
```

Revocation is an on-chain action that invalidates the permission. Any subsequent UserOps signed with the revoked session key will be rejected by the validator.

## Listing Active Sessions

```typescript
const sessions = client.getActiveSessions(wallet.address);
for (const s of sessions) {
  console.log(`Key: ${s.sessionKey}, Expires: ${new Date(s.expiresAt * 1000)}`);
}
```

::: warning
Session data is stored **in-memory**. If the process restarts, session metadata is lost. However, on-chain sessions remain valid until their expiry time or until explicitly revoked.
:::

## Session Rules

Rules add parameter-level constraints to individual actions. They allow you to restrict not just which function is called, but what arguments are passed.

```typescript
interface SessionRule {
  offset: bigint;    // Byte offset in calldata (32n = 2nd param, 64n = 3rd, etc.)
  condition: "equal" | "greater" | "less" | "notEqual";
  value: Hex;        // 32-byte ABI-encoded value to compare against
}
```

### Offset Calculation

Function calldata is structured as a 4-byte selector followed by 32-byte ABI-encoded parameters:

| Offset | Parameter |
|---|---|
| `0n` | 1st parameter (bytes 4-35) |
| `32n` | 2nd parameter (bytes 36-67) |
| `64n` | 3rd parameter (bytes 68-99) |
| `96n` | 4th parameter (bytes 100-131) |

### Example: Limit Transfer Amount

```typescript
{
  target: "0xTokenAddress",
  selector: "0xa9059cbb", // transfer(address to, uint256 amount)
  rules: [{
    offset: 32n,          // 2nd parameter = amount
    condition: "less",
    value: "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000", // < 1 ETH
  }],
}
```

### Example: Restrict Recipient

```typescript
{
  target: "0xTokenAddress",
  selector: "0xa9059cbb", // transfer(address to, uint256 amount)
  rules: [{
    offset: 0n,           // 1st parameter = to address
    condition: "equal",
    value: "0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }],
}
```

Multiple rules on the same action are ANDed together -- all rules must pass for the call to be allowed.
