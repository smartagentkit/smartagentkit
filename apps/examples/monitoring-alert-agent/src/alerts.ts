import type { Alert, AlertSeverity } from "./rules.js";

const SEVERITY_PREFIX: Record<AlertSeverity, string> = {
  info: "[INFO]    ",
  warning: "[WARNING] ",
  critical: "[CRITICAL]",
};

export function printAlert(alert: Alert): void {
  const ts = new Date().toISOString();
  const prefix = SEVERITY_PREFIX[alert.severity];
  console.log(`${ts} ${prefix} [${alert.wallet.slice(0, 10)}...] ${alert.message}`);
  if (alert.action === "pause") {
    console.log(`${" ".repeat(ts.length)} ${"           "} --> ACTION: Auto-pausing wallet`);
  }
}
