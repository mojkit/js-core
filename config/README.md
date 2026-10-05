# Configuration

`Config` in `config/index.ts` loads `mojkit.config.ts` and merges it with defaults, an optional params object, and environment variables.

Behavioral contract, including startup and the variables `Mojkit.start()` actually reads: [docs/GUIDE.md](../docs/GUIDE.md). This page is only the merge.

## Precedence

Highest first:

1. Environment variables prefixed with `MOJKIT_CONFIG_`
2. The object passed to `load(params)`
3. The config file
4. Defaults

```typescript
import { Config } from "./index.ts";

const config = await Config.getInstance().load({
  service: { name: "orders" },
});

config.service.name;         // env MOJKIT_CONFIG_SERVICE_NAME if set, else "orders"
config.service.environment;  // "development" when nobody set it
```

There is no `getConfig()` function and no `ConfigGenerator` class.

## Defaults

```typescript
{
  service: { name: "mojkit-service", environment: "development" },
  domains: {},
  messageBus: {},
}
```

`load()` returns `ResolvedMojkitConfig`: `service.name` and `service.environment` are always strings. `messageBus` is always an object. `Mojkit.start()` does not read `messageBus`; the broker URL is `RABBITMQ_URL`.

`MojkitConfig` (the file's return type) requires `domains`. `service` and `messageBus` are optional on input.

## Config file

Default path: `<cwd>/mojkit.config.ts`. Override with `MOJKIT_CONFIG_PATH`.

```typescript
import type { MojkitConfig } from "./types.ts";

export default async function config(): Promise<MojkitConfig> {
  return {
    service: { name: "orders", environment: "development" },
    domains: {
      "Order.Management": orderManagement,
    },
  };
}
```

- A missing file is allowed. Only defaults, params, and env vars apply, and `domains` stays `{}` unless params or env supply it.
- The default export must be a function. Otherwise: `Config file must export a default function that returns a MojkitConfig`.
- The function must return an object with a `domains` object. Otherwise: `MojkitConfig must have a "domains" property`.
- Other failures are wrapped as `Failed to load config from "<path>": <message>`.

## Environment variables

`MOJKIT_CONFIG_` is stripped. The remainder is lowercased and split on `_`. All segments but the last nest as objects.

```bash
export MOJKIT_CONFIG_SERVICE_NAME=orders
export MOJKIT_CONFIG_SERVICE_ENVIRONMENT=production
```

Coercion: `"true"` / `"false"` become booleans, numeric strings become numbers, everything else stays a string.

The parser is generic. `MOJKIT_CONFIG_SERVER_PORT=8080` becomes `{ server: { port: 8080 } }` even though `server` is not in `MojkitConfig` and startup does not open a port. A primitive env value replaces an object at that key, so do not set `MOJKIT_CONFIG_DOMAINS_...`.

## API

### `Config.getInstance(): Config`

Returns the process singleton.

### `Config.reset(): void`

Drops the singleton. Call between tests, together with `Bus.reset()`, `AppDispatcher.reset()`, and `Mojkit.reset()` when those were used.

### `load(params?: Partial<MojkitConfig>): Promise<ResolvedMojkitConfig>`

Merges all sources. With no `params`, the result is cached and a later `load()` returns the same object. `load(params)` merges those params for that call and does not replace the cache. Changing `MOJKIT_CONFIG_PATH` drops the file cache.

### `get(): ResolvedMojkitConfig`

Returns the cached config. Throws `Configuration has not been loaded. Call Config.getInstance().load() first.` if `load()` has not completed without params.

## Merge behavior

Nested plain objects are deep-merged. Arrays and primitives from the higher-precedence source replace the previous value. `undefined` does not override.

## Tests

```bash
bun test __tests__/config/config.test.ts __tests__/config/optional-config.test.ts
```

Some cases in `config.test.ts` still expect a `server.host` / `server.port` default. Those fields are not in `RESOLVED_DEFAULTS` or `MojkitConfig`. Do not add a server section to match the test; the typed contract is `service`, `domains`, and `messageBus`.
