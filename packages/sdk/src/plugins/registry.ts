import type { Address } from "viem";
import type { PolicyPlugin } from "./types.js";
import { PolicyConfigError } from "../errors.js";

/**
 * Registry of policy plugins. Plugins are registered by ID and
 * provide encoding, validation, and address resolution logic.
 *
 * The SDK creates a singleton `pluginRegistry` that is auto-populated
 * with built-in plugins on import.
 */
export class PolicyPluginRegistry {
  private plugins: Map<string, PolicyPlugin> = new Map();

  /**
   * Register a new policy plugin. Throws if a plugin with the same ID
   * is already registered (use `replace()` to override).
   */
  register(plugin: PolicyPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new PolicyConfigError(
        `Plugin "${plugin.id}" is already registered. Use replace() to override.`,
      );
    }
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Replace an existing plugin registration. Useful for testing or
   * overriding built-in plugin behavior.
   */
  replace(plugin: PolicyPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Get a plugin by ID. Throws with a helpful message if not found.
   */
  get(id: string): PolicyPlugin {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      const available = [...this.plugins.keys()].join(", ");
      throw new PolicyConfigError(
        `Unknown policy plugin "${id}". Available plugins: ${available || "(none)"}. ` +
          "Register custom plugins with pluginRegistry.register().",
      );
    }
    return plugin;
  }

  /**
   * Check if a plugin with the given ID is registered.
   */
  has(id: string): boolean {
    return this.plugins.has(id);
  }

  /**
   * Return all registered plugins.
   */
  all(): PolicyPlugin[] {
    return [...this.plugins.values()];
  }

  /**
   * Collect all protected infrastructure addresses for a given chain.
   * Returns addresses from plugins where `isInfrastructure === true`.
   *
   * @param chainId - Chain ID to resolve addresses for
   * @param overrides - Optional address overrides keyed by plugin ID
   */
  getInfrastructureAddresses(
    chainId: number,
    overrides?: Record<string, Address>,
  ): Address[] {
    const addresses: Address[] = [];
    for (const plugin of this.plugins.values()) {
      if (!plugin.isInfrastructure) continue;
      const addr =
        overrides?.[plugin.id] ??
        plugin.defaultAddresses?.[chainId];
      if (addr) {
        addresses.push(addr);
      }
    }
    return addresses;
  }

  /**
   * Resolve the deployed address for a plugin on a specific chain.
   *
   * Priority: override > defaultAddresses > undefined
   *
   * @param pluginId - Plugin ID to resolve
   * @param chainId - Chain ID
   * @param overrides - Optional address overrides keyed by plugin ID
   */
  resolveAddress(
    pluginId: string,
    chainId: number,
    overrides?: Record<string, Address>,
  ): Address | undefined {
    const override = overrides?.[pluginId];
    if (override) return override;

    const plugin = this.plugins.get(pluginId);
    return plugin?.defaultAddresses?.[chainId];
  }

  /**
   * Set a default address for a plugin on a specific chain.
   * Called by deployments.ts after loading JSON deployment files.
   */
  setDefaultAddress(pluginId: string, chainId: number, address: Address): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return; // Silently skip unknown plugins (deployment may list extras)

    // defaultAddresses is readonly on the interface, but we need to mutate it
    // during initialization. Cast to mutable here.
    const mutablePlugin = plugin as PolicyPlugin & {
      defaultAddresses: Record<number, Address>;
    };
    if (!mutablePlugin.defaultAddresses) {
      (mutablePlugin as { defaultAddresses: Record<number, Address> }).defaultAddresses = {};
    }
    mutablePlugin.defaultAddresses[chainId] = address;
  }
}

/** Singleton plugin registry, auto-populated with built-in plugins */
export const pluginRegistry = new PolicyPluginRegistry();
