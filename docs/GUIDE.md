# Mojkit Core

Canonical guide for `@mojkit/core`. It describes the code as it runs today: how to start a service, how commands, queries, sagas, and events are wired, and how errors move across the bus.

Use this file when an older README disagrees with it. The shorter pages under `config/`, `bus/`, and `services/` are supplements. `AGENTS.md` is the checklist for automated edits.

Runtime is [Bun](https://bun.sh). The message broker is RabbitMQ, through `@mojkit/bus-rabbitmq`. Cross-domain calls use the fluent proxy from `@mojkit/app-service`.

## How to read this

Programmers can follow sections 1–10 in order and use 11–14 as reference.

Agents should read this whole file before generating a service, a handler, or a config file. Section 14 lists wiring that looks implemented in types or in older docs and is not connected. Do not invent that wiring, and do not "fix" examples so they match the older docs.

## 1. What a Mojkit service is

A service is one Node/Bun process that:

1. Loads `mojkit.config.ts`.
2. Connects to RabbitMQ.
3. Registers a listener for every command, query, and saga in that config.
4. Exposes `app`, a proxy that turns method calls into bus messages.

Code is organized by domain, not by technical layer. A domain key such as `"Order.Management"` is the namespace. Under it:

| Slot | Role | Bus operation |
| --- | --- | --- |
| `commands` | Change state. Return a value or fail. | `addCommandListener` |
| `queries` | Read state. | `addQueryListener` |
| `sagas` | React to an event published by some domain. | `addEventListener` |

`Mojkit.start()` always sends `app` calls to RabbitMQ, including calls whose namespace is registered in this same process. There is no in-process shortcut. The local-dispatch branch in `services/AppDispatcher.ts` is commented out.

## 2. Layout

```
core/
├── index.ts                 # Mojkit.start(), package exports
├── config/                  # Load and merge mojkit.config.ts
├── bus/
│   ├── index.ts             # Bus singleton (RabbitMQ transport)
│   ├── listeners.ts         # registerListeners()
│   ├── types.ts             # HandlerContext
│   ├── errors.ts            # SerializableError, RemoteServiceError
│   ├── errors/              # MojkitError and context.reject
│   ├── events/              # MojkitEvent and context.publishEvent
│   └── handlers/            # Registration and invocation
├── services/AppDispatcher.ts
├── examples/
├── __tests__/
└── docs/GUIDE.md            # this file
```

Package entry (`core/index.ts`) exports:

- `Mojkit` (named and default)
- types `MojkitConfig`, `DomainConfig`
- `app`
- everything from `bus/events` (`MojkitEvent`, `createPublishEvent`, type guards, …)
- everything from `bus/errors` (`SerializableError`, `RemoteServiceError`, `MojkitError`, `createReject`, …)

These are real modules but are **not** re-exported from the package entry. Inside this repository, import them by path:

| Symbol | Path |
| --- | --- |
| `Config` | `core/config/index.ts` |
| `Bus` | `core/bus/index.ts` |
| `HandlerContext` | `core/bus/types.ts` (also re-exported from `core/bus/listeners.ts`) |
| `AppDispatcher`, `getAppDispatcher` | `core/services/AppDispatcher.ts` |
| `registerListeners` | `core/bus/listeners.ts` |

`package.json` has no `exports` map. Bun resolves deep specifiers such as `@mojkit/core/bus/types` against the package directory. Prefer the paths above when working in this repo.

## 3. Setup

### Prerequisites

- Bun
- TypeScript 5 (peer dependency)
- RabbitMQ reachable from the process

From the `js/` repo, the test broker is:

```bash
cd bus/rabbitmq && docker compose -f docker-compose.test.yml up -d
```

That container listens on `localhost:5672` (AMQP) and `localhost:15672` (management UI). User and password are `guest` / `guest`.

### Install

`core/package.json` depends on the sibling packages by path:

```json
"@mojkit/app-service": "file:../app-service",
"@mojkit/bus-rabbitmq": "file:../bus/rabbitmq"
```

From `core/`:

```bash
bun install
```

### Config file

Put `mojkit.config.ts` in the process working directory, or point `MOJKIT_CONFIG_PATH` at another file (`.ts` or `.js`).

The default export must be a function (sync or async) that returns an object with a `domains` property.

```typescript
import type { MojkitConfig } from "@mojkit/core";

const OrderManagement = {
  commands: {
    placeOrder: async (payload: { sku: string; quantity: number }) => {
      return { orderId: "order-1", sku: payload.sku, quantity: payload.quantity };
    },
  },
  queries: {
    getOrder: async (orderId: string) => {
      return { orderId, status: "open" };
    },
  },
  sagas: {
    "Order.Management.OrderCreatedEvent": async (payload: { orderId: string }) => {
      console.log("order created", payload.orderId);
    },
  },
};

export default async function config(): Promise<MojkitConfig> {
  return {
    service: {
      name: "orders",
      environment: "development",
    },
    domains: {
      "Order.Management": OrderManagement,
    },
    messageBus: {
      url: "amqp://guest:guest@localhost:5672",
      prefetchCount: 2,
    },
  };
}
```

Rules enforced while loading the file:

- Missing file is allowed. `domains` becomes `{}`.
- The default export must be a function. Otherwise load throws `Config file must export a default function that returns a MojkitConfig`.
- The return value must be an object with a `domains` object. Otherwise load throws `MojkitConfig must have a "domains" property`.
- Any other load failure is wrapped as `Failed to load config from "<path>": <message>`.

A domain module may live in its own file and be placed under `domains`, as `examples/mojkit.config.ts` does with `examples/domains/MyContext/MyAggregate`.

### Environment

| Variable | Effect |
| --- | --- |
| `MOJKIT_CONFIG_PATH` | Absolute or cwd-relative path to the config file. Default: `<cwd>/mojkit.config.ts`. |
| `MOJKIT_CONFIG_MESSAGEBUS_URL` | Overrides `messageBus.url`. |
| `MOJKIT_CONFIG_MESSAGEBUS_PREFETCHCOUNT` | Overrides `messageBus.prefetchCount`. Parsed as a number. |
| `MOJKIT_CONFIG_*` | Merged on top of file and programmatic config. See section 4. |
| `NODE_ENV=development` | Stack traces are included on the error wire format. Any other value omits them. |

`Mojkit.start()` connects with the resolved `messageBus`. Set `messageBus.url` and `messageBus.prefetchCount` in the config file, or override them with the variables above. When `url` is omitted, the transport uses `RABBITMQ_URL`, or `amqp://guest:guest@localhost:5672` when that variable is unset. When `prefetchCount` is omitted, the transport uses `2`.

There is no `server.host` / `server.port` in `MojkitConfig`. Older notes and `config/__tests__` still mention a `server` section. Startup does not open an HTTP port.

### Start

```typescript
import Mojkit from "@mojkit/core";

await Mojkit.start();
```

`Mojkit.start()` is the supported entry. On failure it logs `Failed to initialize Mojkit:` and calls `process.exit(1)`.

`examples/index.ts` is that one call. Keep the process alive after `start()` returns; the RabbitMQ consumers are what keep the service working.

### Tests

```bash
bun test
```

End-to-end tests need the broker from the compose file above:

```bash
bun test __tests__/e2e/cross-instance.test.ts
```

They skip themselves when RabbitMQ is not reachable. See `__tests__/e2e/README.md`.

## 4. Configuration

`Config` (`config/index.ts`) is a singleton. Precedence, highest first:

1. Environment variables prefixed with `MOJKIT_CONFIG_`
2. The object passed to `Config.getInstance().load(params)`
3. The config file
4. Defaults

Defaults (`RESOLVED_DEFAULTS`):

```typescript
{
  service: { name: "mojkit-service", environment: "development" },
  domains: {},
  messageBus: {},
}
```

`MojkitConfig` (what the file returns):

```typescript
interface MojkitConfig {
  domains: Record<string, DomainConfig>;
  service?: { name?: string; environment?: string };
  messageBus?: { url?: string; prefetchCount?: number };
}
```

`ResolvedMojkitConfig` is the merged result. `service.name` and `service.environment` are always set. `messageBus` is always an object, possibly empty.

`DomainConfig`:

```typescript
interface DomainConfig {
  commands?: Record<string, CommandHandler>;
  queries?: Record<string, QueryHandler>;
  sagas?: Record<string, SagaHandler>;
}
```

### Environment mapping

The prefix is stripped, the rest is lowercased and split on `_`. Each segment except the last becomes a nested object.

```bash
export MOJKIT_CONFIG_SERVICE_NAME=orders
export MOJKIT_CONFIG_SERVICE_ENVIRONMENT=production
```

becomes `{ service: { name: "orders", environment: "production" } }`.

Coercion:

- `"true"` / `"false"` become booleans
- numeric strings become numbers
- everything else stays a string

The parser accepts any path. `MOJKIT_CONFIG_SERVER_PORT=8080` becomes `{ server: { port: 8080 } }` even though `server` is not part of the typed config and nothing in startup reads it. Do not put secrets or domain handlers in env vars. A primitive env value overwrites an object at that key, which will break `domains` if you set `MOJKIT_CONFIG_DOMAINS_...`.

### Load and cache

```typescript
import { Config } from "./config";

const config = await Config.getInstance().load();
const again = Config.getInstance().get(); // throws if load() has not finished
```

- `load()` with no argument caches the result. A later `load()` with no argument returns the same object.
- `load(params)` merges those params but does **not** replace the cache.
- If `MOJKIT_CONFIG_PATH` changes after a load, the file cache is dropped.
- `Config.reset()` drops the singleton. Tests must call it between cases. Also reset `Bus`, `AppDispatcher`, and `Mojkit` when those were started (`Bus.reset()`, `AppDispatcher.reset()`, `Mojkit.reset()`).

Nested objects are deep-merged. Arrays and primitives are replaced by the higher-precedence source. `undefined` does not override.

There is no `getConfig()` function and no `ConfigGenerator` class. Those names are from a removed API.

## 5. Start sequence

`Mojkit.initialize()` (called by `start()`):

1. `Config.getInstance().load()` with no overrides.
2. `Bus.getInstance().initialize(config.messageBus)`. Omitted `url` and `prefetchCount` are left unset so the transport can apply its defaults.
3. `AppDispatcher.initialize()`, which installs the process-wide dispatcher used by `app`.
4. `registerListeners(config)`, which subscribes every command, query, and saga.

`Bus.initialize` connects immediately (`ensureConnected`). Calling it again with the same `url` and `prefetchCount` is a no-op. A different url disconnects and connects again.

`Bus.get()` throws `Bus has not been initialized...` before `initialize`. `Config.get()` throws `Configuration has not been loaded...` before `load`.

`Mojkit` is a singleton. `Mojkit.getInstance().config` returns the resolved config after `load()`.

Singletons are process-wide. Two `MojkitInstance` objects in one test process share `Config` and `Bus`. Separate OS processes are what isolates two services.

## 6. Domains, commands, queries, sagas

The domain **key** is the bus namespace. Dots are part of the name (`"MyContext.MyAggregate"`). The transport derives the exchange from the first segment only (`mojkit.MyContext` for `"MyContext.MyAggregate"`). The routing key is `<namespace>.<name>`.

For each entry, `ListenerRegistrar` logs a line:

```
✓ Registered command listener: Order.Management.placeOrder
✓ Registered query listener: Order.Management.getOrder
✓ Registered saga listener: Order.Management -> Billing.Invoice.InvoiceCreated
```

### Commands

The object key is the command name. It is registered as `addCommandListener(namespace, commandName)`.

Call it with `app`:

```typescript
import { app } from "@mojkit/core";

await app.Order.Management.placeOrder({ sku: "WIDGET", quantity: 2 });
```

`app.Order.Management` is the namespace `Order.Management`. `placeOrder` is the command. The object argument is the payload.

The handler receives that payload as its first argument (the CloudEvent `data` field), not the CloudEvent envelope.

Reserved names on the proxy, which cannot be commands: `query`, `on`, `then`, `catch`, `finally`.

Aggregate id, only when the argument is a string or number:

```typescript
await app.Order.Management("order-1").confirm({ by: "staff-9" });
```

An object argument is the command payload, not an aggregate id. `app.Order.Management({ sku: "WIDGET" })` is invalid; call the command method.

### Queries

The object key is the query name passed to `addQueryListener`. It is **not** parsed as `namespace.name`. A key `"User.Auth.GetUser"` would register a query whose name is the whole string `User.Auth.GetUser`.

Use a short name that matches the fluent call:

```typescript
queries: {
  getOrder: async (orderId: string) => {
    return { orderId, status: "open" };
  },
}
```

Handler invocation looks for `message.methods`, where `message` is the query **payload**:

```typescript
{
  methods: [
    { method: "getOrder", args: ["order-1"] },
    { method: "select", args: ["status"] },
  ],
}
```

For a **function** handler:

- the first argument is `methods[0].args[0]`
- `context.methods` is `methods.slice(1)` (the rest of the chain)

For a **class** handler, the class is constructed, `instance.app` is set, and the method name is `methods[0].method`, or `"handle"` when that field is missing. That method is called as `instance[methodName](firstArg, context)`. The remaining methods are shifted onto `context.methods`.

The end-to-end tests build this `{ methods }` payload with `bus.sendQuery`. That is the shape handlers implement against.

The fluent proxy does **not** produce that shape. `@mojkit/app-service` puts the chain in `payload` as an array:

```typescript
await app.Order.Management.query.getOrder("order-1").select("status");
// DispatchObject.payload === [
//   { method: "", args: ["order-1"] },
//   { method: "select", args: ["status"] },
// ]
```

`AppDispatcher` forwards that array as the bus payload. The handler then sees an array, `message.methods` is `undefined`, and a function handler is called with `undefined`. Until the dispatcher wraps the array as `{ methods }`, drive query handlers in tests with `bus.sendQuery` and the object shape above. Do not assume a fluent `app.*.query` chain arrives as `message.methods`.

Two fluent forms, once that wrap exists (this is the app-service contract, not the current dispatcher contract):

```typescript
// Explicit name: property access, then methods. First payload method is the first call.
await app.Users.query.list.filterBy({ active: true }).limit(10);

// Inferred name: calling the name puts { method: "", args } first.
// The first call accepts at most one argument.
await app.Users.query.getOrder("order-1").select("status");
```

A query is not dispatched until at least one step exists after `.query`. `await app.Users.query.getOrder` does not send. `await app.Users.query.getOrder()` does.

Full proxy rules: `app-service/README.md` and `app-service/API.md`.

### Sagas

The object key is `namespace.eventName`. The split is the **last** dot.

| Key | Listens to namespace | Listens to event |
| --- | --- | --- |
| `Order.Management.OrderCreatedEvent` | `Order.Management` | `OrderCreatedEvent` |
| `Billing.Invoice.InvoiceCreated` | `Billing.Invoice` | `InvoiceCreated` |

A key with no dot throws at startup: `Invalid event name format: "...". Expected format: "namespace.eventName"`. Empty sides (`".Event"`, `"Namespace."`) also throw.

The namespace in the key is the namespace the event was **published** on, which is the handler's domain, not a namespace stored inside the event class. A saga on domain `Notifications.Email` can listen to `Order.Management.OrderCreatedEvent`.

The saga function receives the event payload (including `_meta`). Its return value is ignored. It does not reply on the command RPC.

## 7. Handlers

Three forms actually run. Import the context type from `bus/types` inside this repo:

```typescript
import type { HandlerContext } from "../bus/types";
```

### Async function or arrow function

In Bun, `async function` and arrow functions have no `.prototype`, so they stay on the function path.

```typescript
async function placeOrder(
  payload: { sku: string; quantity: number },
  context: HandlerContext,
) {
  return { orderId: "order-1" };
}
```

A non-async `function` declaration **has** a prototype, so it is treated as a class and then fails unless `new` produces an object with `handler` or the expected query method. Write handlers as `async function` or arrows.

### Class constructor

Register the class, not an instance. The invoker rejects non-functions with `Invalid handler type: object`, so `commands: { logout: new LogoutHandler() }` throws when the message arrives.

```typescript
class PlaceOrderHandler {
  app: any;

  async handler(payload: { sku: string }, context: HandlerContext) {
    return { ok: true };
  }
}

// commands: { placeOrder: PlaceOrderHandler }
```

For each message the class is constructed and `instance.app` is set to the `AppDispatcher` singleton (the same object as `context.app`). Command and saga classes must implement `handler(message, context)`. Query classes implement the method named by `methods[0].method`.

`context.app` on the context is the `AppDispatcher` instance. Its `getApp()` method returns the fluent `app` proxy. Class code that wants the proxy uses `this.app.getApp()` after startup has called `AppDispatcher.initialize()`. The proxy is also the package export `app`.

### What the invoker will not call

- A class **instance** (`new Handler()` stored in the config).
- A non-function value (`null`, a plain object, a string).
- A query class method that is not on the instance (`Query handler method '<name>' not found on class`).
- A command/saga class with no `handler` (`Handler class must implement a 'handler' method...`).

`HandlerInvoker` logs the invocation arguments with `console.log` on every message. That is current behavior.

### HandlerContext

Built fresh for every message:

```typescript
interface HandlerContext {
  busMessage: ExecutionContext;   // from @mojkit/bus-rabbitmq; ack/nack live here
  app: AppDispatcher;             // singleton; call getApp() for the fluent proxy
  publishEvent: (event) => Promise<void>;
  reject: (error) => Promise<never>;  // publishes an error event, then throws
  methods?: Array<{ method: string; args?: any[] }>;  // query chains only
}
```

`busMessage.message` is the raw broker message. Correlation id is taken from `body.extensions.correlationId`, then `body.context.correlationId`, then `randomUUID()`.

Do not ack or nack `busMessage` from domain code unless you have a reason to take over the consumer. The transport acks on success and nacks (drop, no requeue) when the handler throws.

Query listeners currently label `publishEvent` / `reject` metadata with `handlerType: "command"`. Saga listeners use `handlerType: "event"`. Command listeners use `"command"`. The `MojkitEventMeta` type also allows `"saga"`, but registration never writes `"saga"`.

## 8. Calling other domains with `app`

`app` is safe to import before startup. Until `AppDispatcher.initialize()` runs, the proxy uses app-service's default dispatcher, which returns the command or query object and does not touch RabbitMQ. Start Mojkit before using `app` to reach a handler.

`AppDispatcher.dispatch` ignores whether the target namespace is local. Both arms go to RabbitMQ.

### Commands

```typescript
await app.Order.Management.placeOrder({ sku: "WIDGET", quantity: 2 });

await app.Order.Management("order-1").confirm({ by: "staff-9" });

await app.Order.Management.placeOrder({ sku: "WIDGET", quantity: 2 })
  .await("OrderCreatedEvent");
```

`awaitResponse` on the bus command is `true` only when `.await()` added event names or `.on()` added listeners. A plain `await app.X.Y.command(payload)` is fire-and-forget: the promise resolves `undefined`, and the handler's return value is discarded by the caller.

`.await("OrderCreatedEvent")` only copies those names onto `options.events`, which the dispatcher stores as `context.events`. The transport copies `context.awaitedEvents` and `context.messageId` into the CloudEvent, not `context.events`. The listener builds an RPC context only when `extensions.messageId`, `extensions.awaitedEvents`, and `extensions.replyQueue` are all set. A normal `app` call therefore does **not** complete when that event is published. What `.await()` does today is flip `awaitResponse` to `true`, so the caller waits for the handler's return value (or its thrown error) on the command reply queue.

`.on(eventName, handler)` is the same: the callback is kept on the in-memory dispatch object and is never invoked by core. It only contributes to `awaitResponse`. The same event name cannot be passed to both `.await()` and `.on()`; app-service throws if you do.

Command payload must be a single object.

### Queries

```typescript
await app.Order.Management.query.getOrder("order-1");
```

`AppDispatcher` calls `bus.sendQuery(message, { timeoutMs: 5000 })`. The transport implementation of `sendQuery` only reads the message argument, so that timeout is ignored. Queries still use the client's own RPC timeout inside `@mojkit/bus-rabbitmq`.

See section 6 for the payload-shape mismatch.

### Inside a handler

```typescript
const proxy = context.app.getApp();
await proxy.Billing.Invoice.issue({ orderId });
```

Or import `app` from `@mojkit/core`. Both are the same proxy after `AppDispatcher.initialize()`.

## 9. Events

Publish from a handler with `context.publishEvent`. Do not call `bus.sendEvent` from domain code; the helper fills metadata and, when an RPC context exists, also writes the reply queue.

### Class event

```typescript
import { MojkitEvent, type HandlerContext } from "@mojkit/core";
// HandlerContext is not exported from the package entry.
// Inside this repo: import type { HandlerContext } from "../bus/types";

class OrderCreatedEvent extends MojkitEvent {
  constructor(payload: { orderId: string; sku: string }) {
    super("OrderCreatedEvent", payload);
  }
}

async function placeOrder(payload: { sku: string }, context: HandlerContext) {
  const event = new OrderCreatedEvent({ orderId: "order-1", sku: payload.sku });
  await context.publishEvent(event);
  event.getMeta(); // set only after publishEvent resolves
  return { orderId: "order-1" };
}
```

Constructor: `(eventName, payload, frontEndPayload?, busOptions?)`.

### Plain object

```typescript
await context.publishEvent({
  name: "OrderCancelledEvent",
  payload: { orderId: "order-1" },
});
```

The fields are `name` and `payload`. `data` is rejected. Anything else throws `Invalid event format. Event must be a MojkitEvent instance or a plain object with "name" and "payload" fields.`

### What is published

`publishEvent` sends:

```typescript
{
  kind: "event",
  namespace: "<domain of the handler that published>",
  name: "<eventName or name>",
  payload: { ...businessPayload, _meta },
  context: { correlationId, frontEndPayload? },
  ...busOptions,
}
```

A non-object payload is wrapped as `{ value: payload, _meta }`.

`_meta`:

```typescript
{
  namespace: string;
  correlationId: string;
  handlerType: "command" | "event"; // "command" for queries too; see section 7
  handlerName: string;              // command name, query name, or full saga key
  publishedAt: string;              // ISO timestamp
}
```

`frontEndPayload` is not mixed into the business payload. It is placed on the bus message `context`. `busOptions` are spread onto the `sendEvent` argument (routing, priority, and any other field the transport accepts).

The event is published on the **handler's** namespace. To receive `OrderCreatedEvent` from a handler in `Order.Management`, the saga key is `Order.Management.OrderCreatedEvent`.

If an RPC context is present and `awaitedEvents` contains the event name, the same payload is also sent to `replyQueue` as `{ type: "event", messageId, eventName, payload }`. `app` does not create that RPC context today (section 8).

Publish after the state change that the event describes. `publishEvent` rejects when the broker rejects; that rejection fails the handler unless you catch it.

More examples: `examples/publish-event-example.ts` and `bus/events/README.md`.

## 10. Error handling

Two mechanisms, with different results on the wire.

| You want | Do this | RPC caller observes | Other services can |
| --- | --- | --- | --- |
| A stable business `code` on the command/query reply | `throw new SerializableError(message, code, context)` | `error.code === code`, `error.context` is the object you passed | Only see the RPC error, no domain event |
| A domain event such as `placeOrderErrorEvent`, then a failed handler | `await context.reject(new MyError(...))` or `await context.reject({ errorCode, message, data })` | A **wrapped** error whose `code` is `COMMAND_HANDLER_ERROR`, `QUERY_HANDLER_ERROR`, or `SAGA_HANDLER_ERROR` | Subscribe to `<namespace>.<handlerName>ErrorEvent` and read `errorCode` from the payload |

Use `SerializableError` when the caller branches on `error.code`. Use `reject` when another domain must react. You can throw `SerializableError` from a handler that also needs a code on the reply; `reject` is the path that emits the error event.

### 10.1 `context.reject`

`reject` always throws. Code after `await context.reject(...)` does not run.

Class form:

```typescript
import { MojkitError } from "@mojkit/core";

class InsufficientInventoryError extends MojkitError {
  constructor(data: { sku: string; requested: number; available: number }) {
    super(
      "INSUFFICIENT_INVENTORY",
      "Not enough inventory",
      data,
    );
  }
}

await context.reject(new InsufficientInventoryError({
  sku: "WIDGET",
  requested: 10,
  available: 2,
}));
```

`MojkitError` constructor: `(errorCode, message, data?, frontEndPayload?, busOptions?)`.

Plain form:

```typescript
await context.reject({
  errorCode: "PAYMENT_DECLINED",
  message: "Payment was declined",
  data: { orderId: "order-1" },
});
```

Both require `errorCode` and `message`. Anything else throws `Invalid error format...` **before** an event is published. That throw is then wrapped like any other handler exception.

On a valid reject, in order:

1. `_meta` is attached (`namespace`, `correlationId`, `handlerType`, `handlerName`, `rejectedAt`). Class errors expose it through `getMeta()` after the call starts publishing. The thrown error has already been tagged if you `catch` it in the same process.
2. If an RPC context exists, `{ type: "error", messageId, error: { errorCode, message, data } }` is sent to the reply queue. `app` does not create that context today.
3. An event is published:

```typescript
{
  kind: "event",
  namespace: "<handler domain>",
  name: "<handlerName>ErrorEvent",
  payload: { errorCode, message, data?, _meta },
  context: { correlationId, frontEndPayload? },
}
```

The event name is the handler name plus `ErrorEvent`. Command `placeOrder` publishes `placeOrderErrorEvent` on the command's domain. A saga whose key is `Order.Management.OrderCreatedEvent` publishes `Order.Management.OrderCreatedEventErrorEvent` (the handler name is the full saga key).

4. If `sendEvent` throws, the failure is logged (`Failed to publish error event:`) and the original rejection still throws.
5. Class errors are rethrown as themselves. Plain objects are rethrown as an anonymous `MojkitError` subclass carrying the same code, message, and data.

Listen for the failure:

```typescript
sagas: {
  "Order.Management.placeOrderErrorEvent": async (payload) => {
    // payload.errorCode, payload.message, payload.data, payload._meta
  },
}
```

`MojkitError` does **not** extend the exported `SerializableError`. They are two different classes (`instanceof` is false). After `reject` throws, the listener's `ErrorHandler` therefore does not keep the `MojkitError`. It builds a new `SerializableError`:

```typescript
new SerializableError(error.message, "COMMAND_HANDLER_ERROR", {
  domain: "Order.Management",
  command: "placeOrder",
  // userId, only if the handler payload has payload.context.userId
});
```

Query wrappers use code `QUERY_HANDLER_ERROR` and context key `query`. Saga wrappers use `SAGA_HANDLER_ERROR` and context key `saga`. The business `errorCode` and `data` are on the published event, not on this wrapped RPC error.

`userId` is read from `message.context?.userId` where `message` is the handler payload. It is not read from CloudEvent extensions. It is usually absent.

Worked examples: `examples/reject-example.ts`.

### 10.2 `throw new SerializableError`

```typescript
import { SerializableError } from "@mojkit/core";

class ValidationError extends SerializableError {
  constructor(field: string, value: unknown) {
    super(`Invalid ${field}`, "VALIDATION_ERROR", { field, value });
  }
}

throw new ValidationError("email", "not-an-email");
```

Constructor: `(message, code?, context?)`. `name` becomes the subclass name. `toWireFormat()` includes `stack` only when `NODE_ENV === "development"`. The transport does not call `toWireFormat()`. It copies `constructor.name`, `message`, `code`, `context`, and (in development) `stack` itself.

Because the error is already an exported `SerializableError`, `ErrorHandler` returns it unchanged. The RPC reply keeps `VALIDATION_ERROR` and your `context`. No error event is published.

`RemoteServiceError` in `bus/errors.ts` is a class you can construct when you already have a wire object. The broker client does **not** throw this class. See 10.4.

### 10.3 Any other throw

`throw new Error("boom")`, a string, or a failed `reject` all go through `ErrorHandler`.

- Message: `error.message`, or `String(error)` for non-`Error` values.
- Code: `COMMAND_HANDLER_ERROR`, `QUERY_HANDLER_ERROR`, or `SAGA_HANDLER_ERROR`.
- Context: `{ domain, command|query|saga, userId? }`.

The original stack is not copied onto the wrapped error.

### 10.4 What the caller catches

The consumer turns a thrown error into a reply when the incoming message has `extensions.correlationId`:

```typescript
{
  kind: "command-response",
  correlationId,
  error: {
    type: string;     // constructor name, e.g. "ValidationError" or "SerializableError"
    message: string;
    code?: string;
    context?: Record<string, any>;
    stack?: string;   // only if NODE_ENV === "development"
  },
  timestamp: string;
}
```

`sendCommand` (when `awaitResponse` is true) and `sendQuery` throw if `response.error` is set. The thrown value is `new Error(message)` with:

```typescript
error.name = "RemoteServiceError";
error.type = errorData.type;
error.code = errorData.code;
error.context = errorData.context;
error.remoteStack = errorData.stack;
```

It is not `instanceof RemoteServiceError` from `@mojkit/core`. Branch on `name`, `code`, and `type`:

```typescript
try {
  await app.Order.Management.placeOrder({ sku: "WIDGET", quantity: 2 }).await("ignored");
} catch (error) {
  if (
    error instanceof Error &&
    error.name === "RemoteServiceError" &&
    "code" in error &&
    (error as { code?: string }).code === "VALIDATION_ERROR"
  ) {
    // SerializableError path. context.field is available as error.context
  }
}
```

This `catch` runs only when the call actually waits: command `.await()` / `.on()`, or any query. A fire-and-forget command does not surface the handler error to the caller. The handler error is still logged by the consumer, and a `reject` still publishes its error event.

Fire-and-forget commands (`awaitResponse` not set) do not wait for a reply. Handler failures there are nack'd and not delivered to the caller.

Sagas have no caller. Their thrown errors are wrapped and nack'd. A `reject` inside a saga still publishes `<fullSagaKey>ErrorEvent` before the throw.

### 10.5 Testing handlers without RabbitMQ

`reject` and `publishEvent` are just functions on the context. A fake `reject` must throw, or the handler will keep running.

```typescript
const rejected: unknown[] = [];
const context = {
  busMessage: {} as HandlerContext["busMessage"],
  app: {} as HandlerContext["app"],
  publishEvent: async () => {},
  reject: async (error: unknown) => {
    rejected.push(error);
    throw error;
  },
};
```

`createPublishEvent` and `createReject` are exported for tests that want the real metadata and `sendEvent` calls against a mock transport. See `__tests__/bus/publishEvent.test.ts` and `__tests__/bus/reject.test.ts`.

## 11. Bus message shape

Domain handlers do not see this envelope. It is what `Bus.get()` sends, and what `busMessage.message.body` contains.

CloudEvent `data` is the Mojkit `payload`. Context fields are copied onto `extensions`, then the transport adds `correlationId` and, for RPC commands, `replyQueue`.

Command, waiting for the handler result:

```typescript
await bus.sendCommand({
  kind: "command",
  namespace: "Order.Management",
  name: "placeOrder",
  payload: { sku: "WIDGET", quantity: 2 },
  awaitResponse: true,
});
```

Without `awaitResponse: true` the command is publish-only and the promise resolves `undefined`.

Query (handler-compatible payload):

```typescript
await bus.sendQuery({
  kind: "query",
  namespace: "Order.Management",
  name: "getOrder",
  payload: {
    methods: [
      { method: "getOrder", args: ["order-1"] },
      { method: "select", args: ["status"] },
    ],
  },
});
```

Event:

```typescript
await bus.sendEvent({
  kind: "event",
  namespace: "Order.Management",
  name: "OrderCreatedEvent",
  payload: { orderId: "order-1" },
});
```

Queue names look like `mojkit.command.queue.<namespace>.<name>`. Exchanges look like `mojkit.<first namespace segment>`.

Transport details and sequence diagrams: `bus/rabbitmq/README.md` and `bus/rabbitmq/docs/`.

## 12. Minimal service

```
my-service/
├── package.json          # depends on @mojkit/core, bun
├── mojkit.config.ts
├── src/orders.ts         # domain object
└── src/main.ts           # await Mojkit.start()
```

`src/main.ts`:

```typescript
import Mojkit from "@mojkit/core";

await Mojkit.start();
```

Run, with the broker up:

```bash
export MOJKIT_CONFIG_MESSAGEBUS_URL=amqp://guest:guest@localhost:5672
bun src/main.ts
```

Confirm the process logs one `Registered command listener` line per command (and the same for queries and sagas). Publish a command from another process with `app` or `bus.sendCommand` using the same namespace and name.

## 13. Tests and resets

Unit tests that touch singletons:

```typescript
import { beforeEach } from "bun:test";
import { Config } from "../../config";
import { Bus } from "../../bus";
import { AppDispatcher } from "../../services/AppDispatcher";
import { Mojkit } from "../../index";

beforeEach(() => {
  Config.reset();
  Bus.reset();
  AppDispatcher.reset();
  Mojkit.reset();
});
```

Delete `MOJKIT_CONFIG_*` variables you set, including `MOJKIT_CONFIG_PATH`. `Config.load()` remembers the path.

E2E tests in `__tests__/e2e/cross-instance.test.ts` construct a small in-process stand-in (`MojkitInstance`) that calls `Config.load`, `Bus.initialize`, and `registerListeners` directly. It does not call `Mojkit.start()`, and it does not give each instance a private connection. `shutdown()` disconnects the shared bus and resets the singletons. Treat a green e2e run as evidence the broker path works, not as evidence that two singletons are isolated.

## 14. Gaps that older docs still describe as features

Do not implement a service against these, and do not "correct" this guide back toward them. They are leftovers in types, comments, or sibling packages.

1. `getConfig` and `ConfigGenerator` are gone. Use `Config.getInstance().load()`.
2. There is no HTTP server in core. `MOJKIT_CONFIG_SERVER_PORT` is only what the generic env parser would produce.
3. `app` always uses RabbitMQ. In-process dispatch is commented out.
4. Plain `await app.Ns.command(payload)` does not return the handler result. Only `.await()` / `.on()` set `awaitResponse`.
5. `.await(eventNames)` does not subscribe to those events. The names are stored on `context.events`, and the transport reads `context.awaitedEvents`.
6. `.on(eventName, handler)` does not call `handler`.
7. Fluent query payloads are arrays of `{ method, args }`. Handlers read `payload.methods`. Those shapes are not converted.
8. The `{ timeoutMs: 5000 }` argument on `sendQuery` is not read by `RabbitMQMojkitTransport.sendQuery`.
9. `context.reject` / `MojkitError` does not preserve `errorCode` on the RPC reply. The reply code becomes `COMMAND_HANDLER_ERROR`, `QUERY_HANDLER_ERROR`, or `SAGA_HANDLER_ERROR`. The business code is on the `<handlerName>ErrorEvent` payload.
10. Broker failures throw `Error` with `name === "RemoteServiceError"`, not the `RemoteServiceError` class.
11. Query `publishEvent` / `reject` metadata uses `handlerType: "command"`. Sagas use `"event"`.
12. Register class constructors, not instances.
13. Saga keys must contain a dot. Query keys must not be written as `namespace.queryName`; the domain key is already the namespace.
14. `examples/listener-registration-example.ts` comments that say query keys are parsed like saga keys are wrong.

## 15. Other documents

| File | What it is for |
| --- | --- |
| `AGENTS.md` | Rules for automated edits in this package |
| `README.md` | Short orientation and links |
| `config/README.md` | `Config` merge rules |
| `bus/events/README.md` | `publishEvent` styles and metadata |
| `bus/handlers/README.md` | Internal registrar/invoker split |
| `bus/handlers/ARCHITECTURE.md` | Historical refactor notes. Line counts and the old `HandlerContext` there are stale |
| `services/APP_DISPATCHER_USAGE.md` | `app` call shapes and the dispatcher |
| `__tests__/e2e/README.md` | How to run cross-process tests |
| `examples/` | Runnable sketches. Prefer this guide when an example comment conflicts |
| `app-service/README.md`, `app-service/API.md` | Fluent proxy grammar |
| `bus/rabbitmq/docs/ERROR_HANDLING.md` | Transport wire format. Its `instanceof RemoteServiceError` samples do not match the client, which throws a plain `Error` |
