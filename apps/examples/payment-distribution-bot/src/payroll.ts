import type { Address } from "viem";

export interface PayrollEntry {
  recipient: Address;
  amount: bigint;
  label: string;
}

export function buildPayroll(
  recipients: Address[],
  amounts: bigint[],
): PayrollEntry[] {
  return recipients.map((recipient, i) => ({
    recipient,
    amount: amounts[i],
    label: `Recipient ${i + 1} (${recipient.slice(0, 8)}...)`,
  }));
}
