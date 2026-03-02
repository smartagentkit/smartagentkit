import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ISmartAgentKitClient } from "@smartagentkit/sdk";

// Reusable Zod pattern for 0x-prefixed Ethereum addresses (20 bytes)
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 0x-prefixed 20-byte hex address");

// Reusable Zod pattern for non-negative integer strings (wei values)
const weiValueSchema = z
  .string()
  .regex(/^\d+$/, "Must be a non-negative integer string (wei)");

// Reusable Zod pattern for 0x-prefixed hex calldata (even-length)
const calldataSchema = z
  .string()
  .regex(/^0x([0-9a-fA-F]{2})*$/, "Must be 0x-prefixed hex calldata (even length)");

/**
 * Creates LangChain tools for interacting with a SmartAgentKit wallet.
 *
 * Returns 5 tools that an LLM agent can use to manage and transact
 * from a policy-governed smart wallet:
 *
 * - **check_wallet_balance** — Get ETH balance
 * - **check_spending_allowance** — Query remaining spending limit for a token
 * - **send_transaction** — Execute an on-chain transaction
 * - **send_batch_transaction** — Execute multiple calls atomically
 * - **check_wallet_status** — Check if wallet is paused
 *
 * @param client - An initialized SmartAgentKitClient
 * @param walletAddress - The smart wallet address to operate on
 * @param sessionKey - Optional session key private key for signing transactions
 * @returns Array of DynamicStructuredTool instances for use with LangChain agents
 *
 * @example
 * ```ts
 * import { createSmartAgentKitTools } from "@smartagentkit/langchain";
 * import { createReactAgent } from "@langchain/langgraph/prebuilt";
 *
 * const tools = createSmartAgentKitTools(client, wallet.address, sessionKey);
 * const agent = createReactAgent({ llm: chatModel, tools });
 * ```
 */
export function createSmartAgentKitTools(
  client: ISmartAgentKitClient,
  walletAddress: string,
  sessionKey?: string,
): DynamicStructuredTool[] {
  const address = walletAddress as `0x${string}`;

  // ─── check_wallet_balance ─────────────────────────────────────

  const checkWalletBalance = new DynamicStructuredTool({
    name: "check_wallet_balance",
    description:
      "Check the ETH balance of the agent's smart wallet. " +
      "Returns the balance in ETH (assuming 18 decimals). " +
      "The raw wei value is also returned for precision. " +
      "Use this before sending transactions to ensure sufficient funds.",
    schema: z.object({}),
    func: async () => {
      try {
        const balances = await client.getBalances(address);
        // Note: Division by 1e18 assumes 18 decimals (correct for native ETH).
        // For ERC-20 tokens, use the raw wei value and the token's actual decimals.
        const ethBalance = Number(balances.eth) / 1e18;
        return JSON.stringify({
          wallet: walletAddress,
          eth: ethBalance.toString(),
          ethWei: balances.eth.toString(),
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  // ─── check_spending_allowance ────────────────────────────────

  const checkSpendingAllowance = new DynamicStructuredTool({
    name: "check_spending_allowance",
    description:
      "Check how much spending allowance remains for a token on the wallet. " +
      "The wallet has policy-enforced spending limits per token per time window. " +
      "Use this to verify you can spend a certain amount before sending a transaction. " +
      'Use "0x0000000000000000000000000000000000000000" for native ETH.',
    schema: z.object({
      token: addressSchema.describe(
        "Token contract address. Use 0x0000000000000000000000000000000000000000 for native ETH.",
      ),
    }),
    func: async ({ token }) => {
      try {
        const remaining = await client.getRemainingAllowance(
          address,
          token as `0x${string}`,
        );
        // Note: Division by 1e18 assumes 18 decimals (correct for native ETH).
        // For tokens with different decimals (e.g., USDC = 6), use remainingWei
        // and divide by the token's actual decimal factor.
        const remainingEth = Number(remaining) / 1e18;
        return JSON.stringify({
          wallet: walletAddress,
          token,
          remainingWei: remaining.toString(),
          remaining: remainingEth.toString(),
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  // ─── send_transaction ─────────────────────────────────────────

  const sendTransaction = new DynamicStructuredTool({
    name: "send_transaction",
    description:
      "Send a transaction from the agent's smart wallet. " +
      "The transaction is executed as a UserOperation through ERC-4337 " +
      "and is subject to the wallet's policy constraints (spending limits, " +
      "allowlist, pause state). All values are in wei (1 ETH = 1e18 wei). " +
      "Returns the transaction hash on success.",
    schema: z.object({
      target: addressSchema.describe(
        "Target contract address to call (0x-prefixed 20-byte hex)",
      ),
      value: weiValueSchema
        .optional()
        .describe(
          "ETH value to send in wei (as string). Defaults to '0'. Example: '1000000000000000' for 0.001 ETH.",
        ),
      data: calldataSchema
        .optional()
        .describe(
          "Calldata for the transaction (0x-prefixed hex). Defaults to '0x' for simple ETH transfer.",
        ),
    }),
    func: async ({ target, value, data }) => {
      try {
        const wallet = {
          address,
          owner: address, // Resolved from connected wallet
          chain: {} as never, // Not used in execute
          isDeployed: true,
          policies: [],
          sessions: [],
        };

        const txHash = await client.execute(wallet, {
          target: target as `0x${string}`,
          value: value ? BigInt(value) : 0n,
          data: (data as `0x${string}`) ?? "0x",
          sessionKey: sessionKey as `0x${string}` | undefined,
        });

        return JSON.stringify({
          success: true,
          transactionHash: txHash,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  // ─── send_batch_transaction ───────────────────────────────────

  const sendBatchTransaction = new DynamicStructuredTool({
    name: "send_batch_transaction",
    description:
      "Send multiple transactions atomically from the agent's smart wallet. " +
      "All calls are bundled into a single UserOperation and either all succeed or all revert. " +
      "Useful for approve+swap, multi-transfer, or any multi-step operation. " +
      "Subject to the wallet's policy constraints. All values are in wei.",
    schema: z.object({
      calls: z
        .array(
          z.object({
            target: addressSchema.describe(
              "Target contract address (0x-prefixed 20-byte hex)",
            ),
            value: weiValueSchema
              .optional()
              .describe("ETH value in wei (as string). Defaults to '0'."),
            data: calldataSchema
              .optional()
              .describe("Calldata (0x-prefixed hex). Defaults to '0x'."),
          }),
        )
        .min(1)
        .describe("Array of calls to execute atomically"),
    }),
    func: async ({ calls }) => {
      try {
        const wallet = {
          address,
          owner: address,
          chain: {} as never,
          isDeployed: true,
          policies: [],
          sessions: [],
        };

        const txHash = await client.executeBatch(wallet, {
          calls: calls.map((c) => ({
            target: c.target as `0x${string}`,
            value: c.value ? BigInt(c.value) : 0n,
            data: (c.data as `0x${string}`) ?? "0x",
          })),
          sessionKey: sessionKey as `0x${string}` | undefined,
        });

        return JSON.stringify({
          success: true,
          transactionHash: txHash,
          callCount: calls.length,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  // ─── check_wallet_status ─────────────────────────────────────

  const checkWalletStatus = new DynamicStructuredTool({
    name: "check_wallet_status",
    description:
      "Check if the agent's smart wallet is currently paused. " +
      "A paused wallet cannot execute any transactions. " +
      "The guardian can pause the wallet in emergencies.",
    schema: z.object({}),
    func: async () => {
      try {
        const paused = await client.isPaused(address);
        return JSON.stringify({
          wallet: walletAddress,
          paused,
          status: paused ? "paused" : "active",
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  return [
    checkWalletBalance,
    checkSpendingAllowance,
    sendTransaction,
    sendBatchTransaction,
    checkWalletStatus,
  ];
}
