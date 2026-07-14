import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Config } from "../../config/index.ts";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const testConfigDir = resolve(process.cwd(), "__test_configs__");
let testCounter = 0;

function uniqueConfigPath(): string {
  testCounter++;
  const dir = resolve(testConfigDir, `test_${testCounter}`);
  mkdirSync(dir, { recursive: true });
  return resolve(dir, "mojkit.config.ts");
}

function writeConfig(path: string, content: string): void {
  writeFileSync(path, content);
}

beforeEach(() => {
  Config.reset();
  delete process.env.WAVE_CONFIG_PATH;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("WAVE_CONFIG_")) delete process.env[key];
  }
  mkdirSync(testConfigDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(testConfigDir, { recursive: true, force: true });
  } catch {}
});

describe("Config", () => {
  describe("Singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = Config.getInstance();
      const instance2 = Config.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should return a fresh instance after reset", () => {
      const instance1 = Config.getInstance();
      Config.reset();
      const instance2 = Config.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Default Configuration", () => {
    it("should use default values when config file doesn't specify them", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() {
          return {
            domains: { "Test.Domain": {} },
            messageBus: {},
          };
        }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;

      const config = await Config.getInstance().load();

      expect(config.server?.host).toBe("0.0.0.0");
      expect(config.server?.port).toBe(7000);
      expect(config.service?.name).toBe("mojkit-service");
      expect(config.service?.environment).toBe("development");
    });

    it("should allow config file to override defaults", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() {
          return {
            domains: { "Test.Domain": {} },
            messageBus: {},
            server: { host: "localhost", port: 8080 },
            service: { name: "custom-service", environment: "production" },
          };
        }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;

      const config = await Config.getInstance().load();

      expect(config.server?.host).toBe("localhost");
      expect(config.server?.port).toBe(8080);
      expect(config.service?.name).toBe("custom-service");
      expect(config.service?.environment).toBe("production");
    });

    it("should follow full precedence: env > params > file > defaults", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() {
          return {
            domains: { "Test.Domain": {} },
            messageBus: {},
            server: { host: "file-host", port: 4000 },
            service: { name: "file-service" },
          };
        }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;
      process.env.WAVE_CONFIG_SERVER_PORT = "7000";

      const config = await Config.getInstance().load({
        server: { host: "param-host" },
        service: { name: "param-service" },
      });

      expect(config.server?.port).toBe(7000);
      expect(config.server?.host).toBe("param-host");
      expect(config.service?.name).toBe("param-service");
      expect(config.service?.environment).toBe("development");
    });
  });

  describe("Config file loading", () => {
    it("should load config from WAVE_CONFIG_PATH", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() {
          return {
            domains: { "Custom.Domain": {} },
            messageBus: {},
            server: { host: "0.0.0.0", port: 8080 }
          };
        }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;

      const config = await Config.getInstance().load();
      expect(config.server?.host).toBe("0.0.0.0");
      expect(config.server?.port).toBe(8080);
    });

    it("should reload config when WAVE_CONFIG_PATH changes", async () => {
      const path1 = uniqueConfigPath();
      const path2 = uniqueConfigPath();

      writeConfig(path1, `
        export default async function config() {
          return { domains: {}, messageBus: {}, server: { host: "first", port: 1111 } };
        }
      `);
      writeConfig(path2, `
        export default async function config() {
          return { domains: {}, messageBus: {}, server: { host: "second", port: 2222 } };
        }
      `);

      process.env.WAVE_CONFIG_PATH = path1;
      const config1 = await Config.getInstance().load();
      expect(config1.server?.host).toBe("first");

      process.env.WAVE_CONFIG_PATH = path2;
      const config2 = await Config.getInstance().load();
      expect(config2.server?.host).toBe("second");
    });
  });

  describe("Parameter merging", () => {
    it("should merge parameters over config file values", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() {
          return {
            domains: { "Test.Domain": {} },
            messageBus: {},
            server: { host: "localhost", port: 3000 }
          };
        }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;

      const config = await Config.getInstance().load({
        server: { host: "localhost", port: 4000 },
      });

      expect(config.server?.host).toBe("localhost");
      expect(config.server?.port).toBe(4000);
    });

    it("should deep merge nested parameters", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() {
          return {
            domains: { "Test.Domain": {} },
            messageBus: {},
            service: { name: "test-service", environment: "dev" }
          };
        }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;

      const config = await Config.getInstance().load({
        service: { environment: "production" },
      });

      expect(config.service?.name).toBe("test-service");
      expect(config.service?.environment).toBe("production");
    });
  });

  describe("Environment variable parsing", () => {
    it("should parse environment variables into config", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() {
          return {
            domains: {},
            messageBus: {},
            server: { host: "localhost", port: 3000 }
          };
        }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;
      process.env.WAVE_CONFIG_SERVER_HOST = "localhost";
      process.env.WAVE_CONFIG_SERVER_PORT = "8080";
      process.env.WAVE_CONFIG_SERVICE_NAME = "env-service";

      const config = await Config.getInstance().load();

      expect(config.server?.host).toBe("localhost");
      expect(config.server?.port).toBe(8080);
      expect(config.service?.name).toBe("env-service");
    });

    it("should parse nested environment variables", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() {
          return {
            domains: {},
            messageBus: {},
          };
        }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;
      process.env.WAVE_CONFIG_SERVER_EXTRA_NESTED_VALUE = "env-value";

      const config = await Config.getInstance().load();

      expect((config.server as any).extra?.nested?.value).toBe("env-value");
    });

    it("should prefer env over params and file", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() {
          return {
            domains: {},
            messageBus: {},
            server: { host: "localhost", port: 3000 }
          };
        }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;
      process.env.WAVE_CONFIG_SERVER_PORT = "9000";

      const config = await Config.getInstance().load({ server: { host: "localhost", port: 5000 } });

      expect(config.server?.port).toBe(9000);
    });
  });

  describe("Error handling", () => {
    it("should throw when config file does not exist", async () => {
      process.env.WAVE_CONFIG_PATH = "/nonexistent/path/mojkit.config.ts";
      await expect(Config.getInstance().load()).rejects.toThrow();
    });

    it("should throw when config file does not export a default function", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `export default { domains: {}, messageBus: {} };`);
      process.env.WAVE_CONFIG_PATH = configPath;

      await expect(Config.getInstance().load()).rejects.toThrow(
        "Config file must export a default function",
      );
    });

    it("should throw when config function returns null", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() { return null; }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;

      await expect(Config.getInstance().load()).rejects.toThrow(
        "Config function must return a valid WaveConfig object",
      );
    });

    it("should throw when config is missing the domains property", async () => {
      const configPath = uniqueConfigPath();
      writeConfig(configPath, `
        export default async function config() { return { messageBus: {} }; }
      `);
      process.env.WAVE_CONFIG_PATH = configPath;

      await expect(Config.getInstance().load()).rejects.toThrow(
        'WaveConfig must have a "domains" property',
      );
    });

    it("should throw when trying to get config before loading", () => {
      expect(() => Config.getInstance().get()).toThrow(
        "Configuration has not been loaded",
      );
    });
  });
});
