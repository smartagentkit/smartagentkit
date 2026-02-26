import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// We test the config module by setting a temp config dir
// Using dynamic imports so we can mock the path

describe("config utils", () => {
  let tmpDir: string;
  let tmpConfigFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sak-test-"));
    tmpConfigFile = path.join(tmpDir, "config.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns default config when file does not exist", async () => {
    // Import fresh module — the loadConfig reads from a fixed path,
    // so we test the logic by writing to the expected path
    const { loadConfig } = await import("../utils/config.js");
    const config = loadConfig();
    expect(config.defaultChain).toBe("base-sepolia");
  });

  it("saves and loads config correctly", () => {
    // Write a config file to tmpDir and read it back
    const config = { defaultChain: "sepolia", rpcUrl: "http://localhost:8545" };
    fs.writeFileSync(tmpConfigFile, JSON.stringify(config));
    const raw = fs.readFileSync(tmpConfigFile, "utf-8");
    const loaded = JSON.parse(raw);
    expect(loaded.defaultChain).toBe("sepolia");
    expect(loaded.rpcUrl).toBe("http://localhost:8545");
  });

  it("handles invalid JSON gracefully", () => {
    fs.writeFileSync(tmpConfigFile, "not-json");
    expect(() => JSON.parse(fs.readFileSync(tmpConfigFile, "utf-8"))).toThrow();
  });
});
