# Mojkit Configuration Generator

A robust configuration management system for the Mojkit framework that loads and merges configuration from multiple sources with clear precedence rules.

## Features

- **Multiple Configuration Sources**: Combines config from file, programmatic parameters, and environment variables
- **Clear Precedence**: `env variables > parameters > config file > defaults`
- **Singleton Pattern**: Config file is loaded only once during application lifecycle
- **Type-Safe**: Full TypeScript support with `MojkitConfig` interface
- **Deep Merging**: Nested configuration objects are merged intelligently
- **Auto Type Conversion**: Environment variables are automatically parsed to numbers and booleans
- **Default Values**: Sensible defaults provided for all optional configuration fields

## Quick Start

```typescript
import { getConfig } from "./config/generator";
// Load configuration
const config = await getConfig();
```

## Default Configuration

The configuration generator provides sensible defaults for all optional fields:

```typescript
{
  service: {
    name: "mojkit-service",
    environment: "development",
  },
  messageBus: {},
  domains: {},
}
```

These defaults are automatically applied when values are not specified in the config file, parameters, or environment variables.

## Configuration Sources (Precedence Order)

### 1. Config File

Create a `mojkit.config.ts` (or `mojkit.config.js`) file:

```typescript
import type { MojkitConfig } from "./config/types";

export default async function config(): Promise<MojkitConfig> {
  return {
    service: {
      name: "my-service",
      environment: "development",
    },
    domains: {
      "User.Auth": AuthDomain,
    },
    messageBus: {},
  };
}
```

**Config File Location:**
- Default: `mojkit.config.ts` in current working directory
- Custom: Set `MOJKIT_CONFIG_PATH` environment variable

```bash
export MOJKIT_CONFIG_PATH=/path/to/custom/mojkit.config.ts
```

### 2. Programmatic Parameters

Override config file values by passing parameters:

```typescript
const config = await getConfig({
  service: {
    environment: "staging",
  },
});
```

Parameters are **deep merged** with the config file, so you only need to specify the values you want to override.

### 3. Environment Variables

Environment variables prefixed with `MOJKIT_CONFIG_` automatically map to nested configuration:

```bash
# Maps to config.service.name
export MOJKIT_CONFIG_SERVICE_NAME=production-service

# Maps to config.service.environment
export MOJKIT_CONFIG_SERVICE_ENVIRONMENT=production
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
// mojkit.config.ts
export default async function config() {
  return {
    service: {
      environment: "production",
    },
    domains: {},
    messageBus: {}
  };
}
```

```bash
# Environment
export MOJKIT_CONFIG_SERVICE_ENVIRONMENT=test
```

```typescript
// Code
const config = await getConfig({
  service: { environment: 'develop' },
});

console.log(config.service.environment); // test (env variable wins)
console.log(config.service.name); // "mojkit-service" (default value used)
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

### `getConfig(params?: Partial<MojkitConfig>): Promise<MojkitConfig>`

Convenience function to get the merged configuration.

**Parameters:**
- `params` (optional): Partial configuration to override file values

**Returns:** Promise resolving to the merged `MojkitConfig`

**Example:**
```typescript
const config = await getConfig({
  service: { name: 'test' },
});
```

### `ConfigGenerator.getInstance(): ConfigGenerator`

Get the singleton instance of the configuration generator.

**Returns:** The singleton `ConfigGenerator` instance

### `ConfigGenerator.reset(): void`

Reset the singleton instance. The next call to `getInstance()` will create a new instance.

**Use Case:** Testing or forcing a config reload

### `ConfigGenerator.generate(params?: Partial<MojkitConfig>): Promise<MojkitConfig>`

Generate the final configuration by merging all sources.

**Parameters:**
- `params` (optional): Partial configuration to override file values

**Returns:** Promise resolving to the merged `MojkitConfig`

## Configuration Schema

See `config/types.ts` for the full `MojkitConfig` interface:

```typescript
interface MojkitConfig {
  service?: ServiceConfig;
  domains: Record<string, DomainConfig>;
  messageBus: MessageBusConfig;
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
