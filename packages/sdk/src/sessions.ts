import {
  type Address,
  type Hex,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  concat,
  toHex,
} from "viem";
import {
  getSmartSessionsValidator,
  getPermissionId,
  getEnableSessionDetails,
  getRemoveSessionAction,
  encodeSmartSessionSignature,
  getTimeFramePolicy,
  getSpendingLimitsPolicy,
  SmartSessionMode,
  type Session,
  type ActionData,
  type PolicyData,
  type EnableSessionData,
} from "@rhinestone/module-sdk";
import type {
  CreateSessionParams,
  SessionAction,
  TokenLimit,
} from "./types.js";
import { SessionError } from "./errors.js";

// ─── Constants ──────────────────────────────────────────────────

/** Smart Sessions module address (canonical on all chains) */
export const SMART_SESSIONS_ADDRESS: Address =
  "0x00000000002B0eCfbD0496EE71e01257dA0E37DE";

/** OwnableValidator — used as session key validator for ECDSA keys */
export const OWNABLE_VALIDATOR_ADDRESS: Address =
  "0x2483DA3A338895199E5e538530213157e931Bf06";

// ─── Session Builder ────────────────────────────────────────────

/**
 * Build a Smart Sessions `Session` struct from our SDK params.
 *
 * The session is scoped to:
 * - Specific target contracts + function selectors (from actions)
 * - Time-bound via TimeFramePolicy (from expiresAt)
 * - Optional spending limits via SpendingLimitsPolicy
 *
 * @param sessionKeyAddress - The session key's public address (ECDSA)
 * @param params - SDK-level session params
 * @param chainId - Target chain ID
 * @param sessionValidatorAddress - Override for the session validator contract
 */
export function buildSession(
  sessionKeyAddress: Address,
  params: CreateSessionParams,
  chainId: bigint,
  sessionValidatorAddress?: Address,
): Session {
  const validatorAddress =
    sessionValidatorAddress ?? OWNABLE_VALIDATOR_ADDRESS;

  // Capture current time once to avoid drift between multiple Date.now() calls
  const now = Math.floor(Date.now() / 1000);

  // Session validator init data: encode the session key address
  const sessionValidatorInitData = encodeAbiParameters(
    parseAbiParameters("address"),
    [sessionKeyAddress],
  );

  // Build user-op level policies
  const userOpPolicies: PolicyData[] = [];

  // Time-bound policy (always required)
  if (!params.expiresAt || params.expiresAt <= now) {
    throw new SessionError("expiresAt must be in the future");
  }
  const timePolicy = getTimeFramePolicy({
    validUntil: params.expiresAt,
    validAfter: now,
  });
  userOpPolicies.push({
    policy: timePolicy.address,
    initData: timePolicy.initData,
  });

  // Optional spending limits
  if (params.spendingLimits && params.spendingLimits.length > 0) {
    const spendingPolicy = getSpendingLimitsPolicy(
      params.spendingLimits.map((l: TokenLimit) => ({
        token: l.token,
        limit: l.limit,
      })),
    );
    userOpPolicies.push({
      policy: spendingPolicy.address,
      initData: spendingPolicy.initData,
    });
  }

  // Build action-level permissions
  const actions: ActionData[] = params.actions.map(
    (action: SessionAction) => {
      if (action.rules?.length) {
        throw new SessionError(
          "Per-action rules (SessionAction.rules) are not yet supported. " +
            "Remove rules or wait for a future release.",
        );
      }
      return {
        actionTarget: action.target,
        actionTargetSelector: action.selector,
        actionPolicies: [],
      };
    },
  );

  if (actions.length === 0) {
    throw new SessionError("Session must have at least one allowed action");
  }

  // Generate a unique salt from the session key + cryptographic randomness
  const randomBuf = new Uint8Array(32);
  crypto.getRandomValues(randomBuf);
  const salt = keccak256(
    concat([sessionKeyAddress as Hex, toHex(randomBuf)]),
  );

  return {
    sessionValidator: validatorAddress,
    sessionValidatorInitData,
    salt,
    userOpPolicies,
    erc7739Policies: {
      allowedERC7739Content: [],
      erc1271Policies: [],
    },
    actions,
    permitERC4337Paymaster: true,
    chainId,
  };
}

// ─── Smart Sessions Module ──────────────────────────────────────

/**
 * Get the Smart Sessions Module for installation on the account.
 * This module enables session key support on the smart account.
 *
 * @param sessions - Optional initial sessions to enable at install time
 */
export function getSmartSessionsModule(sessions?: Session[]) {
  return getSmartSessionsValidator({
    sessions,
    useRegistry: true,
  });
}

// ─── Permission ID ──────────────────────────────────────────────

/**
 * Compute the permission ID for a session.
 * This is a deterministic hash of the session configuration.
 */
export function computePermissionId(session: Session): Hex {
  return getPermissionId({ session });
}

// ─── Enable Session ─────────────────────────────────────────────

/**
 * Get the details needed to enable a session on the account.
 * The owner must sign the returned `permissionEnableHash`.
 */
export async function getEnableDetails(
  sessions: Session[],
  account: { address: Address; type: "safe" },
  publicClients: Parameters<typeof getEnableSessionDetails>[0]["clients"],
  enableValidatorAddress?: Address,
): Promise<{
  permissionEnableHash: Hex;
  mode: (typeof SmartSessionMode)[keyof typeof SmartSessionMode];
  permissionId: Hex;
  signature: Hex;
  enableSessionData: EnableSessionData;
}> {
  return getEnableSessionDetails({
    sessions,
    account: {
      address: account.address,
      type: account.type,
      deployedOnChains: [],
    },
    clients: publicClients,
    enableValidatorAddress,
  });
}

// ─── Session Signature ──────────────────────────────────────────

/**
 * Encode a session signature for a UserOp in USE mode.
 * Used when the session is already enabled on the account.
 */
export function encodeUseSessionSignature(
  permissionId: Hex,
  signature: Hex,
): Hex {
  return encodeSmartSessionSignature({
    mode: SmartSessionMode.USE,
    permissionId,
    signature,
  });
}

/**
 * Encode a session signature for a UserOp in ENABLE mode.
 * Used when enabling and using a session in the same UserOp.
 */
export function encodeEnableSessionSignature(
  permissionId: Hex,
  signature: Hex,
  enableSessionData: EnableSessionData,
): Hex {
  return encodeSmartSessionSignature({
    mode: SmartSessionMode.ENABLE,
    permissionId,
    signature,
    enableSessionData,
  });
}

// ─── Remove Session ─────────────────────────────────────────────

/**
 * Get the execution action to remove (revoke) a session.
 * Returns a call that can be batched into a UserOp.
 */
export function getRemoveAction(permissionId: Hex): {
  to: Address;
  value: bigint;
  data: Hex;
} {
  const action = getRemoveSessionAction({ permissionId });

  const to: Address = (typeof action.target === "string"
    ? action.target
    : action.to) as Address;
  if (!to) throw new SessionError("getRemoveSessionAction returned no target address");

  let value: bigint;
  if (typeof action.value === "bigint") {
    value = action.value;
  } else if (action.value != null) {
    // Upstream may return BigInt wrapper object; convert via string to avoid TS error
    value = BigInt(String(action.value));
  } else {
    value = 0n;
  }

  const data: Hex = ((typeof action.data === "string"
    ? action.data
    : action.callData) ?? "0x") as Hex;

  return { to, value, data };
}

// ─── Re-exports for convenience ─────────────────────────────────

export { SmartSessionMode } from "@rhinestone/module-sdk";
export type {
  Session,
  ActionData,
  PolicyData,
  EnableSessionData,
} from "@rhinestone/module-sdk";
