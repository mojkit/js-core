# Wave Configuration Generator

A robust configuration management system for the Wave framework that loads and merges configuration from multiple sources with clear precedence rules.

## Features

- **Multiple Configuration Sources**: Combines config from file, programmatic parameters, and environment variables
- **Clear Precedence**: `env variables > parameters > config file > defaults`
- **Singleton Pattern**: Config file is loaded only once during application lifecycle
- **Type-Safe**: Full TypeScript support with `WaveConfig` interface
- **Deep Merging**: Nested configuration objects are merged intelligently
- **Auto Type Conversion**: Environment variables are automatically parsed to numbers and booleans
- **Default Values**: Sensible defaults provided for all optional configuration fields

## Quick Start

```typescript
import { getConfig } from "./config/generator";

// Load configuration
const config = await getConfig();

console.log(config.server?.host); // e.g., "0.0.0.0"
console.log(config.server?.port); // e.g., 3000
```

## Default Configuration

The configuration generator provides sensible defaults for all optional fields:

```typescript
{
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  service: {
    name: "wave-service",
    environment: "development",
  },
  messageBus: {},
  domains: {},
}
```

These defaults are automatically applied when values are not specified in the config file, parameters, or environment variables.

## Configuration Sources (Precedence Order)

### 1. Config File

Create a `wave.config.ts` (or `wave.config.js`) file:

```typescript
import type { WaveConfig } from "./config/types";

export default async function config(): Promise<WaveConfig> {
  return {
    domains: {
      "User.Auth": AuthDomain,
    },
    messageBus: {},
    server: {
      host: "localhost",
      port: 3000,
    },
    service: {
      name: "my-service",
      environment: "development",
    },
  };
}
```

**Config File Location:**
- Default: `wave.config.ts` in current working directory
- Custom: Set `WAVE_CONFIG_PATH` environment variable

```bash
export WAVE_CONFIG_PATH=/path/to/custom/wave.config.ts
```

### 2. Programmatic Parameters

Override config file values by passing parameters:

```typescript
const config = await getConfig({
  server: {
    port: 4000,
  },
  service: {
    environment: "staging",
  },
});
```

Parameters are **deep merged** with the config file, so you only need to specify the values you want to override.

### 3. Environment Variables

Environment variables prefixed with `WAVE_CONFIG_` automatically map to nested configuration:

```bash
# Maps to config.server.port
export WAVE_CONFIG_SERVER_PORT=8080

# Maps to config.server.host
export WAVE_CONFIG_SERVER_HOST=0.0.0.0

# Maps to config.service.name
export WAVE_CONFIG_SERVICE_NAME=production-service

# Maps to config.service.environment
export WAVE_CONFIG_SERVICE_ENVIRONMENT=production
```

**Type Conversion:**
- `"true"` / `"false"` → boolean
- Numeric strings → number
- Everything else → string

### 4. Default Values

If a configuration value is not provided by any of the above sources, the default value is used automatically.

## Merge Precedence

Configuration sources are merged with clear precedence rules (highest to lowest):

1. **Environment Variables** (highest priority)
2. **Programmatic Parameters**
3. **Config File**
4. **Default Values** (lowest priority)

This means environment variables will always win, followed by parameters, then config file values, and finally defaults are used for any fields not specified elsewhere.

### Precedence Example

```typescript
// wave.config.ts
export default async function config() {
  return {
    domains: {},
    messageBus: {},
    server: { port: 3000 },
    // host will use default: "0.0.0.0"
  };
}
```

```bash
# Environment
export WAVE_CONFIG_SERVER_PORT=9000
```

```typescript
// Code
const config = await getConfig({
  server: { port: 5000 },
});

console.log(config.server?.port); // 9000 (env variable wins)
console.log(config.server?.host); // "0.0.0.0" (default value used)
console.log(config.service?.name); // "wave-service" (default)
console.log(config.service?.environment); // "development" (default)
```

**Result:** Environment variables override everything, and defaults fill in any missing values.

## Singleton Pattern

The configuration generator uses the Singleton pattern to ensure the config file is loaded only once:

```typescript
import { ConfigGenerator } from "./config/generator";

const instance1 = ConfigGenerator.getInstance();
const instance2 = ConfigGenerator.getInstance();

console.log(instance1 === instance2); // true
```

### Resetting the Singleton

Useful for testing or when you need to reload configuration:

```typescript
ConfigGenerator.reset();
```

## API Reference

### `getConfig(params?: Partial<WaveConfig>): Promise<WaveConfig>`

Convenience function to get the merged configuration.

**Parameters:**
- `params` (optional): Partial configuration to override file values

**Returns:** Promise resolving to the merged `WaveConfig`

**Example:**
```typescript
const config = await getConfig({
  server: { port: 4000 },
});
```

### `ConfigGenerator.getInstance(): ConfigGenerator`

Get the singleton instance of the configuration generator.

**Returns:** The singleton `ConfigGenerator` instance

### `ConfigGenerator.reset(): void`

Reset the singleton instance. The next call to `getInstance()` will create a new instance.

**Use Case:** Testing or forcing a config reload

### `ConfigGenerator.generate(params?: Partial<WaveConfig>): Promise<WaveConfig>`

Generate the final configuration by merging all sources.

**Parameters:**
- `params` (optional): Partial configuration to override file values

**Returns:** Promise resolving to the merged `WaveConfig`

## Configuration Schema

See `config/types.ts` for the full `WaveConfig` interface:

```typescript
interface WaveConfig {
  domains: Record<string, DomainConfig>;
  messageBus: MessageBusConfig;
  service?: ServiceConfig;
  server?: ServerConfig;
}
```

## Testing

The configuration generator includes comprehensive tests covering:

- Singleton pattern behavior
- Config file loading from different paths
- Parameter merging and deep merge
- Environment variable parsing and type conversion
- Default value application
- Merge precedence rules
- Error handling

Run tests:

```bash
bun test config/generator.test.ts
```

## Best Practices

1. **Use environment variables for deployment-specific config** (ports, hosts, credentials)
2. **Use config file for application structure** (domains, default values)
3. **Rely on defaults for common development settings** (reduces boilerplate)
4. **Use parameters for runtime overrides** (testing, dynamic configuration)
5. **Never commit sensitive data** to config files (use env vars instead)
6. **Reset singleton in tests** to ensure clean state between test cases

## Examples

See `examples/config-usage.ts` for complete usage examples including:

- Basic configuration loading
- Parameter overrides
- Environment variable usage
- Custom config file paths
- Singleton behavior demonstration
