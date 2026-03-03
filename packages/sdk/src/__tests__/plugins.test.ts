import { describe, it, expect, beforeEach } from "vitest";
import type { Address, Hex } from "viem";
import {
  pluginRegistry,
  PolicyPluginRegistry,
  spendingLimitPlugin,
  allowlistPlugin,
  emergencyPausePlugin,
  automationPlugin,
  encodePolicyInitData,
  encodeSpendingLimitInitData,
  encodeAllowlistInitData,
  encodeEmergencyPauseInitData,
  PolicyConfigError,
} from "../index.js";
import type { PolicyPlugin } from "../plugins/types.js";

// ─── Registry Tests ───────────────────────────────────────────

describe("PolicyPluginRegistry", () => {
  it("has all 4 built-in plugins registered", () => {
    expect(pluginRegistry.has("spending-limit")).toBe(true);
    expect(pluginRegistry.has("allowlist")).toBe(true);
    expect(pluginRegistry.has("emergency-pause")).toBe(true);
    expect(pluginRegistry.has("automation")).toBe(true);
  });

  it("get() returns the correct plugin by ID", () => {
    const plugin = pluginRegistry.get("spending-limit");
    expect(plugin.id).toBe("spending-limit");
    expect(plugin.name).toBe("SpendingLimitHook");
    expect(plugin.moduleType).toBe("hook");
    expect(plugin.isInfrastructure).toBe(true);
  });

  it("get() throws for unknown plugin with helpful message", () => {
    expect(() => pluginRegistry.get("nonexistent")).toThrow(PolicyConfigError);
    expect(() => pluginRegistry.get("nonexistent")).toThrow("Unknown policy plugin");
    expect(() => pluginRegistry.get("nonexistent")).toThrow("pluginRegistry.register()");
  });

  it("all() returns all registered plugins", () => {
    const all = pluginRegistry.all();
    expect(all.length).toBeGreaterThanOrEqual(4);
    const ids = all.map((p) => p.id);
    expect(ids).toContain("spending-limit");
    expect(ids).toContain("allowlist");
    expect(ids).toContain("emergency-pause");
    expect(ids).toContain("automation");
  });

  it("register() throws on duplicate ID", () => {
    expect(() => pluginRegistry.register(spendingLimitPlugin)).toThrow(
      "already registered",
    );
  });

  it("replace() overrides existing plugin", () => {
    const registry = new PolicyPluginRegistry();
    const plugin1: PolicyPlugin = {
      id: "test-hook",
      name: "TestHookV1",
      moduleType: "hook",
      isInfrastructure: false,
      abi: [],
      encodeInitData: () => "0x01" as Hex,
      validateConfig: () => {},
      toInstalledPolicy: (_, addr) => ({
        moduleAddress: addr,
        moduleType: 4,
        name: "TestHookV1",
      }),
    };
    const plugin2: PolicyPlugin = { ...plugin1, name: "TestHookV2" };

    registry.register(plugin1);
    expect(registry.get("test-hook").name).toBe("TestHookV1");

    registry.replace(plugin2);
    expect(registry.get("test-hook").name).toBe("TestHookV2");
  });

  it("has() returns false for unknown plugins", () => {
    expect(pluginRegistry.has("nonexistent")).toBe(false);
  });
});

// ─── Address Resolution Tests ─────────────────────────────────

describe("Address Resolution", () => {
  it("getInfrastructureAddresses returns addresses for infrastructure plugins", () => {
    const registry = new PolicyPluginRegistry();
    const addr1 = "0x1111111111111111111111111111111111111111" as Address;
    const addr2 = "0x2222222222222222222222222222222222222222" as Address;

    registry.register({
      id: "infra-hook",
      name: "InfraHook",
      moduleType: "hook",
      isInfrastructure: true,
      defaultAddresses: { 84532: addr1 },
      abi: [],
      encodeInitData: () => "0x" as Hex,
      validateConfig: () => {},
      toInstalledPolicy: (_, a) => ({ moduleAddress: a, moduleType: 4, name: "InfraHook" }),
    });
    registry.register({
      id: "non-infra",
      name: "NonInfra",
      moduleType: "hook",
      isInfrastructure: false,
      defaultAddresses: { 84532: addr2 },
      abi: [],
      encodeInitData: () => "0x" as Hex,
      validateConfig: () => {},
      toInstalledPolicy: (_, a) => ({ moduleAddress: a, moduleType: 4, name: "NonInfra" }),
    });

    const infra = registry.getInfrastructureAddresses(84532);
    expect(infra).toContain(addr1);
    expect(infra).not.toContain(addr2);
  });

  it("getInfrastructureAddresses uses overrides over defaults", () => {
    const registry = new PolicyPluginRegistry();
    const defaultAddr = "0x1111111111111111111111111111111111111111" as Address;
    const overrideAddr = "0x9999999999999999999999999999999999999999" as Address;

    registry.register({
      id: "my-hook",
      name: "MyHook",
      moduleType: "hook",
      isInfrastructure: true,
      defaultAddresses: { 84532: defaultAddr },
      abi: [],
      encodeInitData: () => "0x" as Hex,
      validateConfig: () => {},
      toInstalledPolicy: (_, a) => ({ moduleAddress: a, moduleType: 4, name: "MyHook" }),
    });

    const infra = registry.getInfrastructureAddresses(84532, { "my-hook": overrideAddr });
    expect(infra).toContain(overrideAddr);
    expect(infra).not.toContain(defaultAddr);
  });

  it("resolveAddress follows priority: override > defaultAddresses", () => {
    const registry = new PolicyPluginRegistry();
    const defaultAddr = "0x1111111111111111111111111111111111111111" as Address;
    const overrideAddr = "0x9999999999999999999999999999999999999999" as Address;

    registry.register({
      id: "my-hook",
      name: "MyHook",
      moduleType: "hook",
      isInfrastructure: true,
      defaultAddresses: { 84532: defaultAddr },
      abi: [],
      encodeInitData: () => "0x" as Hex,
      validateConfig: () => {},
      toInstalledPolicy: (_, a) => ({ moduleAddress: a, moduleType: 4, name: "MyHook" }),
    });

    // Without override: use default
    expect(registry.resolveAddress("my-hook", 84532)).toBe(defaultAddr);

    // With override: use override
    expect(registry.resolveAddress("my-hook", 84532, { "my-hook": overrideAddr })).toBe(overrideAddr);

    // Wrong chain: undefined
    expect(registry.resolveAddress("my-hook", 1)).toBeUndefined();
  });

  it("resolveAddress returns undefined for unknown plugins", () => {
    expect(pluginRegistry.resolveAddress("nonexistent", 84532)).toBeUndefined();
  });

  it("setDefaultAddress populates defaultAddresses", () => {
    const registry = new PolicyPluginRegistry();
    const addr = "0x3333333333333333333333333333333333333333" as Address;

    registry.register({
      id: "dynamic-hook",
      name: "DynamicHook",
      moduleType: "hook",
      isInfrastructure: false,
      abi: [],
      encodeInitData: () => "0x" as Hex,
      validateConfig: () => {},
      toInstalledPolicy: (_, a) => ({ moduleAddress: a, moduleType: 4, name: "DynamicHook" }),
    });

    expect(registry.resolveAddress("dynamic-hook", 84532)).toBeUndefined();
    registry.setDefaultAddress("dynamic-hook", 84532, addr);
    expect(registry.resolveAddress("dynamic-hook", 84532)).toBe(addr);
  });
});

// ─── Custom Plugin Tests ──────────────────────────────────────

describe("Custom Plugin Registration", () => {
  it("custom plugin works with encodePolicyInitData", () => {
    const customPlugin: PolicyPlugin<{ target: Address }> = {
      id: "target-blocker",
      name: "TargetBlockerHook",
      moduleType: "hook",
      isInfrastructure: false,
      abi: [],
      encodeInitData: (config, _tf) => `0x${config.target.slice(2)}` as Hex,
      validateConfig: (config) => {
        if (!config.target) throw new PolicyConfigError("target is required");
      },
      toInstalledPolicy: (_, addr) => ({
        moduleAddress: addr,
        moduleType: 4,
        name: "TargetBlockerHook",
      }),
    };

    // Register it
    pluginRegistry.register(customPlugin);

    try {
      const target = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
      const encoded = encodePolicyInitData(
        { type: "target-blocker", target } as never,
        {
          spendingLimitHook: "0x1111111111111111111111111111111111111111" as Address,
          allowlistHook: "0x2222222222222222222222222222222222222222" as Address,
          emergencyPauseHook: "0x3333333333333333333333333333333333333333" as Address,
          customModules: {
            "target-blocker": "0x4444444444444444444444444444444444444444" as Address,
          },
        },
      );

      // Address resolves from customModules
      expect(encoded.moduleAddress).toBe("0x4444444444444444444444444444444444444444");
      expect(encoded.moduleType).toBe(4); // hook
      // initData is our custom encoding
      expect(encoded.initData).toContain("abcdefabcdefabcdefabcdefabcdefabcdefabcd");
    } finally {
      // Clean up: replace with original to avoid polluting other tests
      pluginRegistry.replace(customPlugin); // it's already there, just ensure consistency
    }
  });

  it("custom plugin validateConfig throws on invalid config", () => {
    const customPlugin: PolicyPlugin<{ target: Address }> = {
      id: "validator-test",
      name: "ValidatorTest",
      moduleType: "hook",
      isInfrastructure: false,
      abi: [],
      encodeInitData: () => "0x" as Hex,
      validateConfig: (config) => {
        if (!config.target) throw new PolicyConfigError("target is required");
      },
      toInstalledPolicy: (_, addr) => ({
        moduleAddress: addr,
        moduleType: 4,
        name: "ValidatorTest",
      }),
    };

    expect(() => customPlugin.validateConfig({} as never)).toThrow("target is required");
  });
});

// ─── Built-in Plugin Tests ────────────────────────────────────

describe("Built-in Plugins", () => {
  const owner = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
  const tf = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

  describe("spendingLimitPlugin", () => {
    it("encodeInitData produces valid hex", () => {
      const result = spendingLimitPlugin.encodeInitData(
        {
          type: "spending-limit",
          limits: [{ token: owner, limit: 1000n, window: 3600 }],
        },
        tf,
      );
      expect(result).toMatch(/^0x/);
    });

    it("toInstalledPolicy returns correct metadata", () => {
      const installed = spendingLimitPlugin.toInstalledPolicy(
        { type: "spending-limit", limits: [] } as never,
        owner,
      );
      expect(installed.name).toBe("SpendingLimitHook");
      expect(installed.moduleType).toBe(4);
      expect(installed.moduleAddress).toBe(owner);
    });

    it("validateConfig throws on empty limits", () => {
      expect(() =>
        spendingLimitPlugin.validateConfig({ type: "spending-limit", limits: [] }),
      ).toThrow("at least one token limit");
    });
  });

  describe("allowlistPlugin", () => {
    it("encodeInitData produces valid hex", () => {
      const result = allowlistPlugin.encodeInitData(
        {
          type: "allowlist",
          mode: "allow",
          targets: [{ address: owner }],
        },
        tf,
      );
      expect(result).toMatch(/^0x/);
    });

    it("toInstalledPolicy returns correct metadata", () => {
      const installed = allowlistPlugin.toInstalledPolicy(
        { type: "allowlist", mode: "allow", targets: [] } as never,
        owner,
      );
      expect(installed.name).toBe("AllowlistHook");
      expect(installed.moduleType).toBe(4);
    });

    it("validateConfig throws on empty allow-mode targets", () => {
      expect(() =>
        allowlistPlugin.validateConfig({
          type: "allowlist",
          mode: "allow",
          targets: [],
        }),
      ).toThrow("at least one target");
    });
  });

  describe("emergencyPausePlugin", () => {
    it("encodeInitData produces valid hex", () => {
      const result = emergencyPausePlugin.encodeInitData(
        { type: "emergency-pause", guardian: owner },
        tf,
      );
      expect(result).toMatch(/^0x/);
    });

    it("validateConfig throws on zero guardian", () => {
      expect(() =>
        emergencyPausePlugin.validateConfig({
          type: "emergency-pause",
          guardian: "0x0000000000000000000000000000000000000000" as Address,
        }),
      ).toThrow("zero address");
    });
  });

  describe("automationPlugin", () => {
    it("encodeInitData throws not implemented", () => {
      expect(() =>
        automationPlugin.encodeInitData({ type: "automation", tasks: [] }, tf),
      ).toThrow("not yet implemented");
    });

    it("toInstalledPolicy returns executor type", () => {
      const installed = automationPlugin.toInstalledPolicy(
        { type: "automation", tasks: [] },
        owner,
      );
      expect(installed.moduleType).toBe(2); // executor
      expect(installed.name).toBe("AutomationExecutor");
    });
  });
});

// ─── Backward Compatibility Tests ─────────────────────────────

describe("Backward Compatibility", () => {
  const owner = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
  const hookAddr = "0x1111111111111111111111111111111111111111" as Address;
  const tf = "0x0000000000000000000000000000000000000000" as Address;

  it("encodePolicyInitData with old-style PolicyConfig works", () => {
    const result = encodePolicyInitData(
      {
        type: "spending-limit",
        limits: [{ token: owner, limit: 1000n, window: 3600 }],
      },
      { spendingLimitHook: hookAddr, allowlistHook: hookAddr, emergencyPauseHook: hookAddr },
    );
    expect(result.moduleAddress).toBe(hookAddr);
    expect(result.moduleType).toBe(4);
    expect(result.initData).toMatch(/^0x/);
  });

  it("standalone encoder functions still work and produce same output", () => {
    const policy = {
      type: "spending-limit" as const,
      limits: [{ token: owner, limit: 1000n, window: 3600 }],
    };

    const standalone = encodeSpendingLimitInitData(policy, tf);
    const viaPlugin = spendingLimitPlugin.encodeInitData(policy, tf);
    expect(standalone).toBe(viaPlugin);
  });

  it("allowlist standalone encoder matches plugin", () => {
    const policy = {
      type: "allowlist" as const,
      mode: "allow" as const,
      targets: [{ address: owner }],
    };

    const standalone = encodeAllowlistInitData(policy, tf);
    const viaPlugin = allowlistPlugin.encodeInitData(policy, tf);
    expect(standalone).toBe(viaPlugin);
  });

  it("emergency-pause standalone encoder matches plugin", () => {
    const policy = {
      type: "emergency-pause" as const,
      guardian: owner,
    };

    const standalone = encodeEmergencyPauseInitData(policy, tf);
    const viaPlugin = emergencyPausePlugin.encodeInitData(policy, tf);
    expect(standalone).toBe(viaPlugin);
  });

  it("ModuleAddresses without customModules still works", () => {
    const result = encodePolicyInitData(
      {
        type: "allowlist",
        mode: "block",
        targets: [],
      },
      { spendingLimitHook: hookAddr, allowlistHook: hookAddr, emergencyPauseHook: hookAddr },
    );
    expect(result.moduleAddress).toBe(hookAddr);
  });

  it("DEPLOYMENTS record is still populated", async () => {
    const { DEPLOYMENTS } = await import("../deployments.js");
    // Base Sepolia should be populated from JSON
    expect(DEPLOYMENTS[84532]).toBeDefined();
    expect(DEPLOYMENTS[84532].spendingLimitHook).toMatch(/^0x/);
  });
});
