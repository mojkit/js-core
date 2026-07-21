import { describe, it, expect, beforeEach } from "bun:test";
import { Config } from "../../config/index.ts";
import type { MojkitConfig } from "../../config/types.ts";

describe("Optional Config Loading", () => {
  beforeEach(() => {
    Config.reset();
  });

  it("should load config with params only (no config file)", async () => {
    const params: Partial<MojkitConfig> = {
      domains: {
        "TestNamespace": {
          commands: {
            testCommand: async () => ({ success: true }),
          },
        },
      },
    };

    const config = await Config.getInstance().load(params);

    expect(config).toBeDefined();
    expect(config.domains).toBeDefined();
    expect(config.domains["TestNamespace"]).toBeDefined();
    expect(config.service).toBeDefined();
    expect(config.service.name).toBe("mojkit-service");
    expect(config.service.environment).toBe("development");
  });

  it("should load config with empty domains when no params or file", async () => {
    // Set a non-existent config path
    process.env.MOJKIT_CONFIG_PATH = "/tmp/non-existent-mojkit-config.ts";

    const config = await Config.getInstance().load();

    expect(config).toBeDefined();
    expect(config.domains).toBeDefined();
    expect(Object.keys(config.domains)).toHaveLength(0);
    expect(config.service.name).toBe("mojkit-service");

    // Clean up
    delete process.env.MOJKIT_CONFIG_PATH;
  });

  it("should merge params with defaults when no config file exists", async () => {
    process.env.MOJKIT_CONFIG_PATH = "/tmp/non-existent-mojkit-config.ts";

    const params: Partial<MojkitConfig> = {
      domains: {
        "MyNamespace": {
          commands: {
            myCommand: async () => ({}),
          },
        },
      },
      service: {
        name: "custom-service",
        environment: "production",
      },
    };

    const config = await Config.getInstance().load(params);

    expect(config.domains["MyNamespace"]).toBeDefined();
    expect(config.service.name).toBe("custom-service");
    expect(config.service.environment).toBe("production");

    delete process.env.MOJKIT_CONFIG_PATH;
  });

  it("should handle multiple domains in params", async () => {
    process.env.MOJKIT_CONFIG_PATH = "/tmp/non-existent-mojkit-config.ts";

    const params: Partial<MojkitConfig> = {
      domains: {
        "NamespaceA": {
          commands: {
            commandA: async () => ({ a: true }),
          },
        },
        "NamespaceB": {
          queries: {
            queryB: async () => ({ b: true }),
          },
        },
      },
    };

    const config = await Config.getInstance().load(params);

    expect(config.domains["NamespaceA"]).toBeDefined();
    expect(config.domains["NamespaceB"]).toBeDefined();
    expect(Object.keys(config.domains)).toHaveLength(2);

    delete process.env.MOJKIT_CONFIG_PATH;
  });

  it("should cache resolved config", async () => {
    process.env.MOJKIT_CONFIG_PATH = "/tmp/non-existent-mojkit-config.ts";

    const params: Partial<MojkitConfig> = {
      domains: {
        "TestNamespace": {
          commands: {
            test: async () => ({}),
          },
        },
      },
    };

    const config1 = await Config.getInstance().load(params);
    const config2 = Config.getInstance().get();

    expect(config1).toBe(config2);

    delete process.env.MOJKIT_CONFIG_PATH;
  });
});
