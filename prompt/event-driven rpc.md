# Event-Driven RPC — Requirements

## Context

The Wave framework already has `publishEvent` and `reject` implemented and injected into handler context.
This feature extends their internal routing behavior when an RPC context is present,
without changing any interface visible to handler authors.

---

## Existing Constraints

The @wave/bus-rabbitmq package in bus/rabbitmq path manage RabbitMQ connection. Use the existing features as possible.
The @wave/app-service package in app-service path generate the required object.

`WaveHandlerContext` is not modified. No new fields are added to it.
Handler authors continue to call `publishEvent` and `reject` exactly as they do today.
All RPC routing details are invisible to them.

---

## Handler-Side Behavior

### RPC Context via Closure

When the handler processes an incoming message that is an RPC request message,
it creates the `publishEvent` and `reject` functions with an RPC context captured in their closures.
This context includes the message ID, the list of awaited events, and the reply queue name.

### `publishEvent` Routing

When `publishEvent` is called inside a handler:

- If an RPC context is present and the event name is in the awaited events list, in addition to published to the normal event bus, the event is sent to the reply queue.
- Otherwise, it is published normally with no change to existing behavior.

### `reject` Routing

When `reject` is called inside a handler:

- If an RPC context is present, an RPC error response is sent to the reply queue before the Promise is rejected.
- Otherwise, existing behavior is unchanged.

### Handler Return Value

After the handler resolves, the dispatcher checks whether an RPC context is present and the awaited events list is empty.
If both are true, the return value is sent as an RPC result response to the reply queue. The handler itself is unaware of this.

---

## Client-Side Builder

### Purpose

The app-service package provides a fluent API for sending RPC calls and handling responses. It is directly awaitable.

### Methods

- **`.await(...eventNames)`** — registers one or more event names that can resolve the RPC Promise. The first matching event received wins.
- **`.on(eventName, handler, options?)`** — registers a side-effect listener for an event. The listener fires for every emission of that event and does not affect Promise resolution. Supports an independent per-listener timeout.
- **`.send()`** — sends the request, subscribes to the reply queue, manages timeouts, and returns a Promise that resolves or rejects based on incoming responses.
- **`.then()` / `.catch()`** — the builder is directly awaitable without calling `.send()` explicitly.

### Execution Behavior

When the call is executed:

1. A unique message ID is generated.
2. A temporary, ephemeral reply queue is created for this call.
3. Mutual exclusivity between `.await()` and `.on()` event lists is validated. If any event appears in both, an error is thrown immediately with a clear message identifying the conflicting event name.
4. The RPC request message is sent to the command queue.
5. The reply queue is subscribed to.
6. Incoming responses are handled as follows:
  - An error response rejects the main Promise and triggers cleanup.
  - An event response whose name is in the awaited list resolves the main Promise and triggers cleanup of the RPC subscription. Listener subscriptions remain active.
  - An event response whose name matches a registered listener calls that listener. It does not resolve or reject the main Promise.
  - A result response resolves the main Promise and triggers cleanup.
7. If the RPC timeout elapses before resolution, the main Promise is rejected with a timeout error and cleanup runs.

### Cleanup

Cleanup means unsubscribing from the reply queue and cancelling the RPC timeout. Per-listener timeouts are independent and are only cancelled when they fire or the listener unsubscribes.

---

## Behavioral Rules

- The same event cannot appear in both `.await()` and `.on()` for the same call. This is validated at call time.
- The first awaited event received resolves the Promise. Subsequent responses are ignored after resolution.
- Side-effect listeners receive every emission of their registered event.
- Calling `reject()` sends an error response directly to the reply queue.
- If no events are awaited, the handler's return value is the result.
- The RPC timeout and per-listener timeouts are fully independent.
- When no RPC context is present, `publishEvent` and `reject` behave exactly as they do today.

---

## Out of Scope

- Any modification to `WaveHandlerContext`
- Any change to `publishEvent` or `reject` as seen by handler authors
- Ordering guarantees for RabbitMQ message delivery
- Persistent reply queues
- Retry logic at the RPC layer

---

Q1: A
Q2: C. the existing client reply queue create one queue per bounded context
Q3: C
Q4: A
Q5: A
