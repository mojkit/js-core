Here is the updated prompt with that constraint applied throughout:

---

# Event-Driven RPC — Implementation Prompt

## Context

You are adding **event-driven RPC** to the Wave framework. `publishEvent` and `reject` are already implemented and injected into handler context. This feature builds on top of them — do not modify their core logic, only extend `publishEvent`'s routing behavior when an RPC context is present.

---

## What Already Exists

```ts
// Already in handler context — do not change this interface
interface WaveHandlerContext<TPayload = unknown> {
  payload: TPayload
  logger: WaveLogger
  messageId: string
  publishEvent: (event: WaveEvent) => Promise<void>
  reject: (error: WaveError) => Promise<never>
}
```

```ts
// Already implemented
function createPublishEvent(ambientCtx: WaveAmbientContext, bus: WaveBus): PublishEventFn
function createReject(ambientCtx: WaveAmbientContext, bus: WaveBus): RejectFn
```

**`WaveHandlerContext` is not modified.** `awaitedEvents` and `rpcReplyTo` are never added to it. The handler author never sees or touches RPC routing details.

---

## What You Are Adding

The RPC context is captured **only inside the closures** of `publishEvent` and `reject` at the time they are created for an RPC invocation. It is never exposed on the context object.

---

## Step 1 — Wire Protocol

Define these four types. They are the only messages that cross the bus for RPC.

```ts
interface RpcRequestMessage {
  messageId: string
  commandName: string
  payload: unknown
  awaitedEvents: string[]
  timeoutMs: number
  replyTo: string
}

interface RpcEventResponse {
  messageId: string
  type: 'event'
  eventName: string
  data: unknown
}

interface RpcResultResponse {
  messageId: string
  type: 'result'
  data: unknown
}

interface RpcErrorResponse {
  messageId: string
  type: 'error'
  error: {
    code: string
    message: string
    details?: unknown
  }
}

type RpcResponse = RpcEventResponse | RpcResultResponse | RpcErrorResponse
```

---

## Step 2 — Handler-Side: Extend `publishEvent` and `reject` via Closure

### Factory signatures

The factories receive one additional optional parameter. When the incoming message is a plain command (non-RPC), this parameter is omitted and behavior is identical to today.

```ts
function createPublishEvent(
  ambientCtx: WaveAmbientContext,
  bus: WaveBus,
  rpcCtx?: {
    messageId: string
    awaitedEvents: string[]
    replyTo: string
  }
): PublishEventFn

function createReject(
  ambientCtx: WaveAmbientContext,
  bus: WaveBus,
  rpcCtx?: {
    messageId: string
    replyTo: string
  }
): RejectFn
```

The `rpcCtx` is captured in the closure at creation time. The handler context object itself is unchanged — it still only exposes `publishEvent` and `reject` as plain functions.

### `publishEvent` routing logic (inside the closure)

if rpcCtx is present AND event.eventName is in rpcCtx.awaitedEvents:
→ send RpcEventResponse to rpcCtx.replyTo queue
→ do NOT publish to the normal event bus
else:
→ publish normally (existing behavior, unchanged)


The handler calls `await publishEvent(new OrderCreatedEvent(...))` exactly as before. The routing decision is invisible to the handler author.

### `reject` routing logic (inside the closure)

if rpcCtx is present:
→ send RpcErrorResponse to rpcCtx.replyTo queue
→ then return Promise.reject(error) as before
else:
→ existing behavior unchanged


### Handler return value

After the handler function resolves, the **framework dispatcher** (not the handler) checks:

if rpcCtx is present AND awaitedEvents is empty:
→ send RpcResultResponse to replyTo queue with the handler's return value


The dispatcher already has access to `rpcCtx` because it created the `publishEvent` and `reject` closures. No new context fields are needed.

---

## Step 3 — Client-Side Builder

### Core behavior

`.execute()` does the following in order:

1. Generate a `messageId` (uuid v4)
2. Create a temporary reply queue bound to `messageId`
3. Validate mutual exclusivity between `.await()` and `.on()` event lists — throw if overlap
4. Send `RpcRequestMessage` to the command queue
5. Subscribe to the reply queue
6. On each incoming `RpcResponse`:
  - `type === 'error'` → reject the main Promise, clean up
  - `type === 'event'` and `eventName` is in awaited list → resolve the main Promise with `data`, clean up RPC subscription (listeners stay alive)
  - `type === 'event'` and `eventName` is in listener map → call the listener, do not resolve/reject
  - `type === 'result'` → resolve the main Promise with `data`, clean up
7. If `timeoutMs` elapses before resolution → reject with a timeout error, clean up

### Cleanup

"Clean up" means: unsubscribe from the reply queue, cancel the RPC timeout. Listener timeouts are cancelled only when their own timeout fires or the listener explicitly unsubscribes.

### Builder interface

```ts
class WaveRpcBuilder<TResult = unknown> {
  constructor(private bus: WaveBus, private commandName: string, private payload: unknown) {}

  await<K extends string>(...eventNames: K[]): WaveRpcBuilder<TResult>

  on<K extends string>(
    eventName: K,
    handler: (data: unknown) => void,
    options?: { timeoutMs?: number }
  ): WaveRpcBuilder<TResult>

  execute(): Promise<TResult>

  then<TFulfilled = TResult, TRejected = never>(
    onfulfilled?: (value: TResult) => TFulfilled | PromiseLike<TFulfilled>,
    onrejected?: (reason: unknown) => TRejected | PromiseLike<TRejected>
  ): Promise<TFulfilled | TRejected>

  catch<TRejected = never>(
    onrejected?: (reason: unknown) => TRejected | PromiseLike<TRejected>
  ): Promise<TResult | TRejected>
}
```

---

## Step 4 — Type Safety

### `defineCommand`

```ts
function defineCommand<
  TName extends string,
  TPayload,
  TEvents extends Record<string, unknown>
>(config: {
  name: TName
  payload: TPayload
  events: TEvents
}): CommandDefinition<TName, TPayload, TEvents>
```

### Inferred result type

When `.await('orderCreated')` is called on a builder that knows the event map, the result type narrows to the payload of that event. Multiple awaited events produce a union.

```ts
const PlaceOrderCommand = defineCommand({
  name: 'placeOrder',
  payload: {} as { orderId: string },
  events: {
    orderCreated: {} as { orderId: string; createdAt: string },
    orderQueued:  {} as { orderId: string; queuePosition: number },
  }
})

// result: { orderId: string; createdAt: string }
const result = await wave
  .command(PlaceOrderCommand, { orderId: '123' })
  .await('orderCreated')

// result: { orderId: string; createdAt: string } | { orderId: string; queuePosition: number }
const result2 = await wave
  .command(PlaceOrderCommand, { orderId: '123' })
  .await('orderCreated', 'orderQueued')
```

### Mutual exclusivity

TypeScript cannot enforce this at compile time for dynamic lists. Enforce it at runtime with a clear error:

Error: Event 'orderCreated' cannot appear in both .await() and .on() for the same RPC call.


---

## Step 5 — Entry Point

```ts
class WaveClient {
  command<TName extends string, TPayload, TEvents extends Record<string, unknown>>(
    definition: CommandDefinition<TName, TPayload, TEvents>,
    payload: TPayload
  ): WaveRpcBuilder<unknown, TEvents>

  // Untyped overload
  command(name: string, payload: unknown): WaveRpcBuilder<unknown>
}
```

---

## Behavioral Rules

| Rule | Behavior |
|------|----------|
| Mutual exclusivity | Same event in `.await()` and `.on()` → throw at call time |
| First match wins | First awaited event received resolves the Promise; subsequent are ignored |
| Listeners receive all | `.on()` handler fires for every emission of that event |
| No cross-dispatch | An event that resolves the RPC Promise is not also sent to a listener |
| Error bypasses routing | `reject()` sends `RpcErrorResponse`; no event routing occurs |
| Standard RPC fallback | Empty `awaitedEvents` → handler return value is the result |
| Timeout independence | RPC timeout and per-listener timeouts are independent |
| Non-RPC handlers | `rpcCtx` is `undefined`; all existing behavior unchanged |
| Context unchanged | `WaveHandlerContext` has no new fields; RPC context lives only in closures |

---

## Acceptance Criteria

- [ ] `WaveHandlerContext` is not modified — no `awaitedEvents` or `rpcReplyTo` fields added
- [ ] RPC context is captured only in the `publishEvent` and `reject` closures
- [ ] `publishEvent` routes to reply queue when event is in `awaitedEvents`, publishes normally otherwise
- [ ] `reject` sends `RpcErrorResponse` to reply queue in RPC mode, existing behavior in non-RPC mode
- [ ] Handler return value sent as `RpcResultResponse` when `awaitedEvents` is empty and `rpcCtx` is present
- [ ] `.await()` / `.on()` / `.execute()` chain works end-to-end
- [ ] Builder is directly awaitable via `then` / `catch`
- [ ] Mutual exclusivity enforced with a clear error message
- [ ] First-match-wins resolves the RPC Promise
- [ ] Listeners fire independently and receive all emissions
- [ ] RPC timeout and listener timeouts are independent
- [ ] `defineCommand` produces correct inferred types for awaited events
- [ ] Non-RPC handlers require zero changes
- [ ] All new code is mockable via constructor/factory injection
- [ ] Test coverage ≥ 90%

---

## Out of Scope

- Modifying `WaveHandlerContext` in any way
- Modifying `publishEvent` or `reject` signatures as seen by handler authors
- Ordering guarantees for RabbitMQ message delivery
- Persistent reply queues (reply queues are ephemeral, per-call)
- Retry logic on the RPC layer
