import type { ResolvedWaveConfig, WaveConfig } from "./types";
import { RESOLVED_DEFAULTS } from "./types";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

/**
 * Deep merge utility that combines nested objects.
 * Later sources override earlier ones.
 */
function deepMerge<T extends Record<string, any>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  if (!sources.length) return target;

  const source = sources.shift();
  if (!source) return deepMerge(target, ...sources);

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      target[key] = deepMerge({ ...targetValue }, sourceValue);
    } else if (sourceValue !== undefined) {
      target[key] = sourceValue;
    }
  }

  return deepMerge(target, ...sources);
}

/**
 * Parse environment variables prefixed with WAVE_CONFIG_ into nested config object.
 * Example: WAVE_CONFIG_SERVER_PORT=8080 → { server: { port: 8080 } }
 */
function parseEnvConfig(): Partial<WaveConfig> {
  const config: any = {};
  const prefix = "WAVE_CONFIG_";

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(prefix) || value === undefined) continue;

    const path = key
      .slice(prefix.length)
      .toLowerCase()
      .split("_");

    let current = config;
    for (let i = 0; i < path.length - 1; i++) {
      const segment = path[i];
      if (!segment) continue;
      if (!current[segment]) {
        current[segment] = {};
      }
      current = current[segment];
    }

    const lastKey = path[path.length - 1];
    if (!lastKey) continue;

    // Try to parse as number or boolean
    let parsedValue: any = value;
    if (value === "true") parsedValue = true;
    else if (value === "false") parsedValue = false;
    else if (!isNaN(Number(value)) && value.trim() !== "") {
      parsedValue = Number(value);
    }

    current[lastKey] = parsedValue;
  }

  return config;
}

/**
 * Load and execute the wave.config.ts or wave.config.js file.
 * Returns null if the file doesn't exist.
 */
async function loadConfigFile(configPath: string): Promise<WaveConfig | null> {
  try {
    const absolutePath = resolve(configPath);
    
    // Check if file exists
    if (!existsSync(absolutePath)) {
      return null;
    }

    const fileUrl = pathToFileURL(absolutePath).href;

    const configModule = await import(fileUrl);
    const configFunction = configModule.default;

    if (typeof configFunction !== "function") {
      throw new Error(
        `Config file must export a default function that returns a WaveConfig`,
      );
    }

    const config = await configFunction();

    if (!config || typeof config !== "object") {
      throw new Error(`Config function must return a valid WaveConfig object`);
    }

    if (!config.domains || typeof config.domains !== "object") {
      throw new Error(`WaveConfig must have a "domains" property`);
    }

    return config;
  } catch (error: any) {
    // If file doesn't exist, return null
    if (error.code === "ENOENT" || error.code === "ERR_MODULE_NOT_FOUND") {
      return null;
    }
    throw new Error(
      `Failed to load config from "${configPath}": ${error.message}`,
    );
  }
}

/**
 * Singleton configuration manager for the Wave framework.
 *
 * Loads and merges configuration from three sources with precedence:
 * env variables > parameters > config file > defaults
 *
 * The config file is optional. If not found, only defaults, params, and env variables are used.
 */
export class Config {
  private static instance: Config | null = null;
  private configPromise: Promise<WaveConfig | null> | null = null;
  private resolvedConfig: ResolvedWaveConfig | null = null;
  private loadedConfigPath: string | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of Config.
   */
  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  /**
   * Load and resolve the configuration.
   * This method should be called during application initialization.
   *
   * @param params - Optional parameters to override config file values
   * @returns Resolved configuration object
   */
  async load(params?: Partial<WaveConfig>): Promise<ResolvedWaveConfig> {
    // Check if config path has changed
    const currentConfigPath =
      process.env.WAVE_CONFIG_PATH ||
      resolve(process.cwd(), "wave.config.ts");

    if (this.loadedConfigPath && this.loadedConfigPath !== currentConfigPath) {
      this.configPromise = null;
      this.resolvedConfig = null;
    }

    // If already resolved and no new params, return cached config
    if (this.resolvedConfig && !params) {
      return this.resolvedConfig;
    }

    // If loading is in progress, wait for it
    if (this.configPromise) {
      const fileConfig = await this.configPromise;
      return this.mergeConfigs(fileConfig, params);
    }

    // Start loading the config file (may return null if not found)
    this.configPromise = this.loadConfigFile();
    const fileConfig = await this.configPromise;

    return this.mergeConfigs(fileConfig, params);
  }

  /**
   * Get the resolved configuration.
   * Throws an error if configuration has not been loaded yet.
   *
   * @returns The resolved configuration
   */
  get(): ResolvedWaveConfig {
    if (!this.resolvedConfig) {
      throw new Error(
        "Configuration has not been loaded. Call Config.getInstance().load() first.",
      );
    }
    return this.resolvedConfig;
  }

  /**
   * Load configuration file from disk.
   * Returns null if file doesn't exist.
   */
  private async loadConfigFile(): Promise<WaveConfig | null> {
    this.loadedConfigPath =
      process.env.WAVE_CONFIG_PATH ||
      resolve(process.cwd(), "wave.config.ts");

    return await loadConfigFile(this.loadedConfigPath);
  }

  /**
   * Merge configuration from all sources with proper precedence.
   * File config is optional and may be null.
   */
  private mergeConfigs(
    fileConfig: WaveConfig | null,
    params?: Partial<WaveConfig>,
  ): ResolvedWaveConfig {
    const envConfig = parseEnvConfig();

    // Merge: defaults < file < params < env
    let merged = deepMerge({ ...RESOLVED_DEFAULTS } as any, {});

    // Merge file config over defaults (if file exists)
    if (fileConfig) {
      merged = deepMerge(merged, fileConfig);
    }

    if (params) {
      merged = deepMerge(merged, params);
    }

    merged = deepMerge(merged, envConfig);

    // Ensure domains property exists
    if (!merged.domains) {
      merged.domains = {};
    }

    // Cache the resolved config if no params were provided
    if (!params) {
      this.resolvedConfig = merged;
    }

    return merged as ResolvedWaveConfig;
  }

  /**
   * Reset the singleton instance (useful for testing).
   */
  static reset(): void {
    Config.instance = null;
  }
}
