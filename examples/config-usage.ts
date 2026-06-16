/**
 * Example usage of the Wave configuration generator
 */

import { Config } from "../config";

// Example 1: Basic usage - load config from default location
async function basicUsage() {
  console.log("=== Basic Usage ===");
  const config = await Config.getInstance().load();
  console.log("Server config:", config.server);
  console.log("Service config:", config.service);
}

// Example 2: Override with parameters
async function withParameters() {
  console.log("\n=== With Parameters ===");
  const config = await Config.getInstance().load({
    server: {
      host: "127.0.0.1",
      port: 4000,
    },
    service: {
      name: "custom-service",
      environment: "development",
    },
  });
  console.log("Server config:", config.server);
  console.log("Service config:", config.service);
}

// Example 3: Environment variables override everything
async function withEnvVars() {
  console.log("\n=== With Environment Variables ===");
  
  // Set environment variables
  process.env.WAVE_CONFIG_SERVER_PORT = "9000";
  process.env.WAVE_CONFIG_SERVER_HOST = "0.0.0.0";
  process.env.WAVE_CONFIG_SERVICE_NAME = "production-service";
  process.env.WAVE_CONFIG_SERVICE_ENVIRONMENT = "production";

  const config = await Config.getInstance().load({
    server: {
      host: "localhost",
      port: 3000,
    },
  });

  console.log("Server config:", config.server);
  console.log("Service config:", config.service);
  console.log("Note: Env vars override parameters!");
}

// Example 4: Custom config file path
async function customConfigPath() {
  console.log("\n=== Custom Config Path ===");
  
  // Set custom config path via environment variable
  process.env.WAVE_CONFIG_PATH = "./__tests__/wave.config.ts";
  
  // Reset singleton to reload from new path
  Config.reset();
  
  const config = await Config.getInstance().load();
  console.log("Domains:", Object.keys(config.domains));
}

// Example 5: Singleton behavior
async function singletonBehavior() {
  console.log("\n=== Singleton Behavior ===");
  
  const instance1 = Config.getInstance();
  const instance2 = Config.getInstance();
  
  console.log("Same instance?", instance1 === instance2);
  
  const config1 = await Config.getInstance().load();
  const config2 = await Config.getInstance().load();
  
  console.log("Same config object (cached)?", config1 === config2);
}

// Run all examples
async function main() {
  try {
    await basicUsage();
    await withParameters();
    await withEnvVars();
    await customConfigPath();
    await singletonBehavior();
  } catch (error) {
    console.error("Error:", error);
  }
}

// Uncomment to run:
// main();

export { basicUsage, withParameters, withEnvVars, customConfigPath, singletonBehavior };
