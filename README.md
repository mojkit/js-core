# Mojkit Core

A powerful back-end framework for building distributed microservices using Domain-Driven Design (DDD) and Command Query Responsibility Segregation (CQRS) patterns. Services communicate asynchronously through RabbitMQ as the message bus.

## Features

- **Domain-Driven Design**: Organize your code around business domains
- **CQRS Pattern**: Separate command and query responsibilities
- **Event-Driven Architecture**: Publish and react to domain events with sagas
- **Distributed Communication**: Seamless cross-instance messaging via RabbitMQ
- **Automatic Route Registration**: Controllers are auto-discovered and registered
- **Type-Safe Configuration**: Multiple configuration sources with clear precedence
- **Event Publishing API**: Clean, metadata-enriched event publishing for handlers

## Installation

```bash
bun install
```

## Quick Start

### 1. Configure Your Application

Create a `mojkit.config.ts` file:

```typescript
import type { MojkitConfig } from "@mojkit/core";

export default async function config(): Promise<MojkitConfig> {
  return {
    domains: {
      "User.Auth": {
        controllers: {
          "POST /login": LoginController,
          "POST /logout": LogoutController,
        },
        commands: {
          createUser: async (payload) => {
            // Command logic
            return { userId: "123" };
          },
        },
        queries: {
          getUser: async (payload) => {
            // Query logic
            return { user: { id: "123", name: "John" } };
          },
        },
        sagas: {
          UserCreated: async (payload, context) => {
            // React to UserCreated event
            await context.publishEvent({
              name: "WelcomeEmailSent",
              data: { userId: payload.userId },
            });
          },
        },
      },
    },
    messageBus: {},
    server: {
      host: "0.0.0.0",
      port: 3000,
    },
    service: {
      name: "my-mojkit-service",
      environment: "development",
    },
  };
}
```

### 2. Run Your Application

```bash
bun run index.ts
```

## Core Concepts

### Automatic Route Registration

Mojkit automatically discovers and registers HTTP routes from your configuration:

1. Server loads `mojkit.config.ts` at startup (configurable via `WAVE_CONFIG_PATH`)
2. Iterates over all `domains` in the config
3. Reads the `controllers` map for each domain
4. Registers each `"METHOD /path"` key as a Fastify route

**Controller Types:**
- **Class-based**: Export a class with a `handle(req, res)` method
- **Function-based**: Export a plain async function or `FastifyLikeHandler`

**Example Domain Structure:**

```
domains/
  Auth/
    controllers/
      index.ts         ← exports Record<"METHOD /path", Controller>
      Login.ts         ← class implements ControllerClass
      Logout.ts
    commands/
    index.ts           ← { controllers, commands, queries, sagas }
```

### Configuration System

Mojkit provides a robust configuration system with multiple sources and clear precedence:

**Precedence Order** (highest to lowest):
1. Environment Variables (prefixed with `WAVE_CONFIG_`)
2. Programmatic Parameters
3. Config File (`mojkit.config.ts`)
4. Default Values

**Example:**

```bash
# Environment variables
export WAVE_CONFIG_SERVER_PORT=8080
export WAVE_CONFIG_SERVICE_NAME=production-service
```

```typescript
// Programmatic override
const config = await getConfig({
  server: { port: 4000 },
});
```

See [config/README.md](config/README.md) for detailed documentation.

### Event Publishing

Handlers receive a `publishEvent` function in their context for publishing domain events:

**Class-Based Events (Recommended):**

```typescript
import { MojkitEvent, type HandlerContext } from "@mojkit/core";

class OrderCreatedEvent extends MojkitEvent {
  constructor(payload: { orderId: string; amount: number }) {
    super("OrderCreatedEvent", payload);
  }
}

async function placeOrderCommand(payload: any, context: HandlerContext) {
  // Business logic
  const orderId = createOrder(payload);

  // Publish event with auto-populated metadata
  await context.publishEvent(
    new OrderCreatedEvent({ orderId, amount: payload.amount })
  );

  return { orderId };
}
```

**Plain Object Events (Simple):**

```typescript
async function cancelOrderCommand(payload: any, context: HandlerContext) {
  await context.publishEvent({
    name: "OrderCancelledEvent",
    data: { orderId: payload.orderId },
  });

  return { success: true };
}
```

Events automatically include metadata: namespace, correlationId, handlerType, handlerName, and publishedAt.

See [bus/events/README.md](bus/events/README.md) for detailed documentation.

## Architecture

### Bus Handlers

The bus handler system is organized into modular services following Single Responsibility Principle:

- **HandlerInvoker**: Invokes different handler types (function, class, instance)
- **ErrorHandler**: Transforms domain errors into serializable format
- **EventNameParser**: Parses event names into namespace and event components
- **ListenerRegistrar**: Orchestrates registration of all bus listeners

See [bus/handlers/README.md](bus/handlers/README.md) for detailed documentation.

### Cross-Instance Communication

Mojkit supports true microservices architecture where multiple instances communicate via RabbitMQ:

```typescript
// Instance A provides services
const configA = {
  domains: {
    OrderService: {
      commands: {
        placeOrder: async (payload) => ({ orderId: "123" }),
      },
    },
  },
};

// Instance B consumes services
const instanceB = new MojkitInstance("InstanceB", {});
await instanceB.initialize();

// Instance B calls Instance A's command via RabbitMQ
const result = await instanceB.getBus().sendCommand({
  kind: "command",
  namespace: "OrderService",
  name: "placeOrder",
  payload: { items: [...] },
  awaitResponse: true,
});
```

See [__tests__/e2e/README.md](__tests__/e2e/README.md) for detailed documentation and testing guide.

## Testing

### Run Unit Tests

```bash
bun test
```

### Run E2E Tests

E2E tests require a running RabbitMQ instance:

```bash
# Start RabbitMQ (if needed)
cd ../bus/rabbitmq && docker-compose -f docker-compose.test.yml up -d

# Run E2E tests
bun test __tests__/e2e/cross-instance.test.ts
```

## Project Structure

```
.
├── bus/
│   ├── handlers/          # Bus listener registration services
│   └── events/            # Event publishing API
├── config/                # Configuration management system
├── __tests__/
│   └── e2e/              # Cross-instance communication tests
├── examples/             # Usage examples
├── services/             # Core services
├── index.ts              # Application entry point
├── mojkit.config.ts        # Mojkit configuration file
└── README.md
```

## Environment Variables

- `WAVE_CONFIG_PATH`: Custom path to mojkit.config.ts (default: `./mojkit.config.ts`)
- `WAVE_CONFIG_SERVER_PORT`: Override server port
- `WAVE_CONFIG_SERVER_HOST`: Override server host
- `WAVE_CONFIG_SERVICE_NAME`: Override service name
- `WAVE_CONFIG_SERVICE_ENVIRONMENT`: Override service environment

## Best Practices

1. **Configuration**
   - Use environment variables for deployment-specific config
   - Use config file for application structure
   - Rely on defaults for common development settings

2. **Events**
   - Use class-based events for production code (type-safe)
   - Use plain objects for prototyping or simple events
   - Always publish events after successful business logic execution

3. **Domains**
   - Organize code by business domain, not technical layers
   - Keep domain logic isolated and testable
   - Use sagas for cross-domain workflows

4. **Testing**
   - Reset ConfigGenerator singleton between tests
   - Mock `publishEvent` in unit tests
   - Use E2E tests for cross-instance communication scenarios

## Documentation

- [Configuration System](config/README.md)
- [Event Publishing API](bus/events/README.md)
- [Bus Handlers](bus/handlers/README.md)
- [E2E Testing Guide](__tests__/e2e/README.md)

## License

This project is part of the Mojkit framework.
