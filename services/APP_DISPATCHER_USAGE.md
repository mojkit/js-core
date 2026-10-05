# App dispatcher

`AppDispatcher` installs the process-wide dispatcher behind the `app` proxy from `@mojkit/app-service`. `Mojkit.start()` calls `AppDispatcher.initialize()` before listeners are registered. Before that call, `app` uses app-service's default dispatcher and returns the command or query object instead of sending it to RabbitMQ.

The full contract (payload shapes, `.await()`, errors) is [docs/GUIDE.md](../docs/GUIDE.md). Fluent grammar is `app-service/README.md`.

## Import

```typescript
import { app } from "@mojkit/core";
```

The same proxy is `AppDispatcher.getInstance().getApp()` and `getAppDispatcher().getApp()` from `services/AppDispatcher.ts`. Those class exports are not on the package entry.

Inside a class handler, startup assigns `this.app` to the `AppDispatcher` singleton. The proxy is `this.app.getApp()`, not `this.app` itself.

## What dispatch does

Every command and query is sent with `Bus.get()` to RabbitMQ. The branch that would handle a namespace registered in this process is commented out, so a local domain is not called in-process.

Commands:

```typescript
await bus.sendCommand({
  id: obj.id,
  kind: "command",
  namespace: obj.namespace,
  name: obj.name,
  payload: obj.payload,
  context: {
    aggregateId: obj.options.aggregateId,
    events: obj.options.events,
  },
  awaitResponse:
    (obj.options.events?.length ?? 0) > 0 ||
    (obj.options.listeners?.length ?? 0) > 0,
});
```

`awaitResponse` is false for a plain call. The promise resolves `undefined`. The handler return value is not returned to the caller.

`.await("OrderCreatedEvent")` stores those names on `options.events`, which becomes `context.events`. The transport only copies `context.awaitedEvents` and `context.messageId` onto the CloudEvent. The listener builds an RPC context only when `messageId`, `awaitedEvents`, and `replyQueue` are all present. So `.await()` does not complete when that event is published. It does set `awaitResponse`, and the caller then waits for the handler return value or thrown error.

`.on(eventName, handler)` is not invoked. Its presence only sets `awaitResponse`.

Queries:

```typescript
await bus.sendQuery(
  { kind: "query", namespace, name, payload: obj.payload },
  { timeoutMs: 5000 },
);
```

`RabbitMQMojkitTransport.sendQuery` does not read the second argument, so `timeoutMs` is ignored.

`obj.payload` for a fluent query is an array of `{ method, args? }`. Handlers look for `payload.methods`. Those are different shapes, and nothing wraps the array. Chains that the unit of the e2e suite asserts against are sent as `{ methods: [...] }` through `bus.sendQuery`, not through `app`.

## Calls that match the proxy

Namespace `Order.Management` is `app.Order.Management`. A string or number call is an aggregate id. An object call is a command payload.

```typescript
await app.Order.Management.placeOrder({ sku: "WIDGET", quantity: 2 });

await app.Order.Management("order-1").confirm({ by: "staff-9" });

await app.Order.Management.placeOrder({ sku: "WIDGET", quantity: 2 })
  .await("OrderCreatedEvent");
```

Query forms from app-service (the dispatcher still forwards the array as-is):

```typescript
await app.Users.query.list.filterBy({ active: true }).limit(10);

await app.Users.query.getOrder("order-1").select("status");

await app.Users("user-1").query.getProfile.withRelations("orders");
```

Do not write `app.Users.query.listUsers().filterBy(...)`. Calling `listUsers()` makes the query name `listUsers` and the first payload step `{ method: "", args }`. Property access (`listUsers.filterBy`) keeps the name and records `filterBy` as a step. The first invoked method accepts at most one argument.

`query`, `on`, `then`, `catch`, and `finally` are reserved and cannot be command names.

## Tests

```typescript
import { AppDispatcher } from "../services/AppDispatcher";

beforeEach(() => {
  AppDispatcher.reset();
});
```

`reset()` clears the singleton and the `initialized` flag. It does not uninstall a dispatcher already passed to `setDispatcher` from a previous `initialize()` in the same process.
