# Agents working in `@mojkit/core`

Read `docs/GUIDE.md` before adding a service, a handler, a config sample, or an edit to startup, dispatch, events, or errors. That file is the contract. This file is the checklist. When they disagree, `docs/GUIDE.md` wins and this file should be updated to match it.

## What this package is

`@mojkit/core` starts one Bun process: load `mojkit.config.ts`, connect to RabbitMQ, register command/query/saga listeners, and expose the `app` proxy from `@mojkit/app-service`. Domain code talks to other domains only through that bus.

## Invariants

- Start with `Mojkit.start()` from `index.ts`. The RabbitMQ connection is the resolved `messageBus` (`url`, `prefetchCount`). An omitted `url` falls back to `RABBITMQ_URL`, then `amqp://guest:guest@localhost:5672`. An omitted `prefetchCount` falls back to `2`.
- Config merge order is env (`MOJKIT_CONFIG_*`) > `Config.getInstance().load(params)` > config file > defaults. There is no `getConfig` and no `ConfigGenerator`.
- The config file's default export must be a function returning `{ domains }`. A missing file is legal and means no domains.
- Domain map key = bus namespace (`"Order.Management"`). Command and query keys are bare names. Saga keys are `namespace.eventName`, split on the last dot. A saga key without a dot throws at startup.
- Handlers are `async function` / arrows, or class **constructors**. `new Handler()` stored in the config throws `Invalid handler type: object`. A non-async `function` declaration is treated as a class.
- `context.publishEvent` accepts a `MojkitEvent` subclass or `{ name, payload }`. The field is `payload`, not `data`. Events are published on the **handler's** namespace.
- `context.reject(...)` publishes `<handlerName>ErrorEvent`, then throws. It does not preserve `errorCode` on the RPC reply. `ErrorHandler` re-wraps `MojkitError` as `COMMAND_HANDLER_ERROR`, `QUERY_HANDLER_ERROR`, or `SAGA_HANDLER_ERROR` because `MojkitError` is not `instanceof` the exported `SerializableError`.
- Throw `new SerializableError(message, code, context)` when the RPC caller must see `error.code`.
- The bus client throws `new Error` with `name === "RemoteServiceError"`. Do not write `instanceof RemoteServiceError` for that failure.
- `AppDispatcher` sends every command and query to RabbitMQ. Plain `await app.Ns.command(payload)` is fire-and-forget (`awaitResponse` is false) and resolves `undefined`.
- `.await(eventNames)` and `.on(...)` only flip `awaitResponse`. They do not wait for those events and do not invoke `.on` callbacks. The transport looks for `context.awaitedEvents`; the dispatcher writes `context.events`.
- Fluent queries put an array of `{ method, args }` on `payload`. Handlers read `payload.methods`. `AppDispatcher` does not convert one into the other. Tests that exercise chains call `bus.sendQuery` with `{ methods: [...] }`.
- Query listeners set `handlerType: "command"` on event/reject metadata. Sagas set `"event"`.
- Reset `Config`, `Bus`, `AppDispatcher`, and `Mojkit` between tests. Do not assume two objects in one process have two bus connections.

## Do not

- Reintroduce `server.host` / `server.port` as framework config. Startup does not open an HTTP server.
- Document or generate `getConfig()`, `ConfigGenerator`, or `publishEvent({ name, data })`.
- Register query names as `"Namespace.QueryName"`. The namespace is the domain key.
- Claim class instances, in-process dispatch, event-await RPC, or query timeouts of 5000ms work. See section 14 of `docs/GUIDE.md`.
- Copy comments in `examples/listener-registration-example.ts` that say query keys are parsed like saga keys.
- Edit `bus/rabbitmq` or `app-service` behavior from a core-doc task unless the user asked for that change.

## Where to change code

| Task | Files |
| --- | --- |
| Startup | `index.ts` |
| Config merge | `config/index.ts`, `config/types.ts` |
| Listener registration | `bus/handlers/ListenerRegistrar.ts` |
| How a handler is called | `bus/handlers/HandlerInvoker.ts` |
| RPC error wrap | `bus/handlers/ErrorHandler.ts` |
| `publishEvent` | `bus/events/createPublishEvent.ts`, `bus/events/MojkitEvent.ts` |
| `reject` | `bus/errors/createReject.ts`, `bus/errors/MojkitError.ts` |
| `app` → bus | `services/AppDispatcher.ts` |
| Saga key grammar | `bus/handlers/EventNameParser.ts` |

After a behavior change, update `docs/GUIDE.md` in the same edit, then the satellite README that mentions that behavior (`config/README.md`, `bus/events/README.md`, `services/APP_DISPATCHER_USAGE.md`). Leave `bus/handlers/ARCHITECTURE.md` as history unless the user asks to refresh it.

## Verify

```bash
bun test
```

E2E needs RabbitMQ (`bus/rabbitmq/docker-compose.test.yml`) and skips when it is down. Do not treat a skip as a pass you caused.
