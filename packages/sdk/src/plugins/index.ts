export type { PolicyPlugin, ModuleType } from "./types.js";
export { PolicyPluginRegistry, pluginRegistry } from "./registry.js";
export { spendingLimitPlugin, encodeSpendingLimitInitData } from "./spending-limit.js";
export { allowlistPlugin, encodeAllowlistInitData } from "./allowlist.js";
export { emergencyPausePlugin, encodeEmergencyPauseInitData } from "./emergency-pause.js";
export { automationPlugin } from "./automation.js";

// ─── Auto-register built-in plugins on import ──────────────────

import { pluginRegistry } from "./registry.js";
import { spendingLimitPlugin } from "./spending-limit.js";
import { allowlistPlugin } from "./allowlist.js";
import { emergencyPausePlugin } from "./emergency-pause.js";
import { automationPlugin } from "./automation.js";

pluginRegistry.register(spendingLimitPlugin);
pluginRegistry.register(allowlistPlugin);
pluginRegistry.register(emergencyPausePlugin);
pluginRegistry.register(automationPlugin);
