# Mojkit Core

Back-end framework for Bun services. Each process loads a domain map, connects to RabbitMQ, and handles commands, queries, and sagas. Other domains are called through the `app` proxy, which sends bus messages.

The full contract — setup, handlers, events, and error handling — is [docs/GUIDE.md](docs/GUIDE.md). Automated edits should follow [AGENTS.md](AGENTS.md).

## Setup

Requirements: Bun, TypeScript 5, and RabbitMQ.

```bash
# from js/core
bun install

# broker used by the e2e tests (from js/)
cd ../bus/rabbitmq && docker compose -f docker-compose.test.yml up -d
```

`mojkit.config.ts` in the working directory (or `MOJKIT_CONFIG_PATH`):

```typescript
import type { MojkitConfig } from "@mojkit/core";

export default async function config(): Promise<MojkitConfig> {
  return {
    service: { name: "orders", environment: "development" },
    domains: {
      "Order.Management": {
        commands: {
          placeOrder: async (payload: { sku: string }) => {
            return { orderId: "order-1", sku: payload.sku };
          },
        },
        queries: {
          getOrder: async (orderId: string) => {
            return { orderId, status: "open" };
          },
        },
        sagas: {
          "Order.Management.OrderCreatedEvent": async () => {},
        },
      },
    },
  };
}
```

```typescript
import Mojkit from "@mojkit/core";

await Mojkit.start();
```

The broker URL is `RABBITMQ_URL` (default `amqp://guest:guest@localhost:5672`). Prefetch is `RABBITMQ_PREFETCH_COUNT`. `config.messageBus` is not used at startup.

Saga keys must be `namespace.eventName` (split on the last dot). Command and query keys are bare names under the domain namespace.

## Call another domainconfig.messageBus is not used at startup.

```typescript
import { app } from "@mojkit/core";

// Fire-and-forget. Resolves undefined. The handler return value is not returned.
await app.Order.Management.placeOrder({ sku: "WIDGET" });

// Waits for the handler's return value or thrown error.
await app.Order.Management.placeOrder({ sku: "WIDGET" }).await("OrderCreatedEvent");
```

`.await("OrderCreatedEvent")` does not wait for that event. It only makes the call wait for the command reply. Details are in [docs/GUIDE.md](docs/GUIDE.md).

## Events and errors

Publish with `context.publishEvent`. The plain-object form uses `name` and `payload`.

Reject with `context.reject`. That publishes `<handlerName>ErrorEvent` and then throws. The RPC reply is re-wrapped with code `COMMAND_HANDLER_ERROR`, `QUERY_HANDLER_ERROR`, or `SAGA_HANDLER_ERROR`. Throw `SerializableError` when the caller must see your business `code`.

```typescript
import { MojkitEvent, MojkitError, SerializableError } from "@mojkit/core";
```

`HandlerContext` is not exported from the package entry. Inside this repo import it from `bus/types.ts`.

## Configuration

Merged by `Config.getInstance().load()`. Highest precedence first: `MOJKIT_CONFIG_*` environment variables, the object passed to `load(params)`, the config file, then defaults (`service.name` `mojkit-service`, `service.environment` `development`).

There is no `getConfig()` helper. See [config/README.md](config/README.md).

## Tests

```bash
bun test
bun test __tests__/e2e/cross-instance.test.ts   # needs RabbitMQ; skips if it is down
```



## Layout

```
index.ts            Mojkit.start() and package exports
config/             Config load and merge
bus/                Transport singleton, listeners, events, errors
services/           AppDispatcher (app → RabbitMQ)
examples/
__tests__/
docs/GUIDE.md       Canonical guide
AGENTS.md           Checklist for automated edits
```



## Further reading

- [Guide](docs/GUIDE.md)
- [Configuration](config/README.md)
- [publishEvent](bus/events/README.md)
- [app dispatcher](services/APP_DISPATCHER_USAGE.md)
- [Handler modules](bus/handlers/README.md)
- [E2E tests](__tests__/e2e/README.md)

