import chalk from "chalk";
import Table from "cli-table3";
import { formatEther } from "viem";

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatBalance(wei: bigint): string {
  return `${formatEther(wei)} ETH`;
}

export function success(message: string): void {
  console.log(chalk.green(`\u2713 ${message}`));
}

export function error(message: string): void {
  console.error(chalk.red(`\u2717 ${message}`));
}

export function warn(message: string): void {
  console.log(chalk.yellow(`! ${message}`));
}

export function info(message: string): void {
  console.log(chalk.blue(`i ${message}`));
}

export function createTable(head: string[]): Table.Table {
  return new Table({
    head: head.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
  });
}

export function printKeyValue(pairs: [string, string][]): void {
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  for (const [key, value] of pairs) {
    console.log(`  ${chalk.gray(key.padEnd(maxKeyLen))}  ${value}`);
  }
}
