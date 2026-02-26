/**
 * Base error class for SmartAgentKit SDK errors.
 */
export class SmartAgentKitError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SmartAgentKitError";
  }
}

/**
 * Thrown when wallet creation fails.
 */
export class WalletCreationError extends SmartAgentKitError {
  constructor(message: string, cause?: unknown) {
    super(`Wallet creation failed: ${message}`, { cause });
    this.name = "WalletCreationError";
  }
}

/**
 * Thrown when a policy configuration is invalid.
 */
export class PolicyConfigError extends SmartAgentKitError {
  constructor(message: string, cause?: unknown) {
    super(`Invalid policy configuration: ${message}`, { cause });
    this.name = "PolicyConfigError";
  }
}

/**
 * Thrown when transaction execution fails.
 */
export class ExecutionError extends SmartAgentKitError {
  constructor(message: string, cause?: unknown) {
    super(`Transaction execution failed: ${message}`, { cause });
    this.name = "ExecutionError";
  }
}

/**
 * Thrown when a spending limit would be exceeded.
 */
export class SpendingLimitExceededError extends SmartAgentKitError {
  constructor(
    public readonly token: string,
    public readonly attempted: bigint,
    public readonly remaining: bigint,
  ) {
    super(
      `Spending limit exceeded for ${token}: attempted ${attempted}, remaining ${remaining}`,
    );
    this.name = "SpendingLimitExceededError";
  }
}

/**
 * Thrown when the wallet is paused.
 */
export class WalletPausedError extends SmartAgentKitError {
  constructor(public readonly walletAddress: string) {
    super(`Wallet ${walletAddress} is currently paused`);
    this.name = "WalletPausedError";
  }
}

/**
 * Thrown when a session key is invalid or expired.
 */
export class SessionError extends SmartAgentKitError {
  constructor(message: string, cause?: unknown) {
    super(`Session error: ${message}`, { cause });
    this.name = "SessionError";
  }
}
