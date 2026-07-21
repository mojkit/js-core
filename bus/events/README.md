# Mojkit Events - publishEvent API

The `publishEvent` API provides a clean, type-safe way for handlers to publish domain events without directly accessing
the bus. It automatically populates metadata for tracing and debugging.

## Overview

Every handler (command, query, saga) receives a `publishEvent` function in its context. This function:

- **Auto-populates metadata**: namespace, correlationId, handlerType, handlerName, publishedAt
- **Supports two event styles**: class-based (type-safe) and plain objects (simple)
- **Preserves correlation tracking**: all events in a flow share the same correlationId
- **Works seamlessly with the bus**: no need to import or configure the bus directly

## Quick Start

### Class-Based Events (Recommended)

```typescript
import { MojkitEvent, type HandlerContext } from '@mojkit/core';

// Define your event
class OrderCreatedEvent extends MojkitEvent {
  constructor(payload: { orderId: string; amount: number }) {
    super('OrderCreatedEvent', payload);
  }
}

// Use in a handler
async function placeOrderCommand(
  payload: { items: any[] },
  context: HandlerContext
) {
  // ... business logic
  
  await context.publishEvent(
    new OrderCreatedEvent({ orderId: '123', amount: 100 })
  );
  
  return { success: true };
}
```

### Plain Object Events (Simple)

```typescript
async function cancelOrderCommand(
  payload: { orderId: string },
  context: HandlerContext
) {
  // ... business logic
  
  await context.publishEvent({
    name: 'OrderCancelledEvent',
    data: { orderId: payload.orderId, reason: 'customer request' }
  });
  
  return { success: true };
}
```

## Event Metadata (_meta)

Every published event automatically includes a `_meta` field with:

```typescript
{
  namespace: string;        // e.g., "Order.Management"
  correlationId: string;    // e.g., "abc-123-def-456"
  handlerType: 'command' | 'saga' | 'event';
  handlerName: string;      // e.g., "placeOrder"
  publishedAt: string;      // ISO timestamp
}
```

### Accessing Metadata

For class-based events, use `getMeta()`:

```typescript
const event = new OrderCreatedEvent({ orderId: '123', amount: 100 });
await context.publishEvent(event);

const meta = event.getMeta();
console.log(meta.correlationId); // "abc-123-def-456"
console.log(meta.publishedAt);   // "2024-05-24T10:30:00.000Z"
```

For plain objects, access `_meta` directly:

```typescript
const event = {
  name: 'OrderCancelledEvent',
  data: { orderId: '123' }
};

await context.publishEvent(event);
console.log(event._meta.namespace); // "Order.Management"
```

**Note**: `_meta` is read-only. It's populated by `publishEvent` and should not be manually modified.

## Event Styles Comparison

### Class-Based Events

**Pros:**
- Type-safe: compile-time checks for payload structure
- IDE-friendly: autocomplete and refactoring support
- Encapsulation: event logic can be encapsulated in the class
- Follows DDD patterns

**Cons:**
- Requires class definition
- Slightly more boilerplate

**When to use:**
- Production code
- Complex event structures
- When type safety is important
- When working in a team

### Plain Object Events

**Pros:**
- Simple and quick
- No class definition needed
- Less boilerplate

**Cons:**
- No compile-time type checking
- Easy to make typos in event names
- No IDE autocomplete for payload fields

**When to use:**
- Prototyping
- Simple event structures
- One-off events
- Quick scripts

## Advanced Features

### Frontend Data

Include UI-specific data that doesn't belong in the business payload:

```typescript
class PaymentProcessedEvent extends MojkitEvent {
  constructor(
    payload: { orderId: string; amount: number },
    frontEndData?: { showNotification: boolean; message: string }
  ) {
    super('PaymentProcessedEvent', payload, frontEndData);
  }
}

await context.publishEvent(
  new PaymentProcessedEvent(
    { orderId: '123', amount: 100 },
    { showNotification: true, message: 'Payment successful!' }
  )
);
```

### Bus Options

Pass bus-level options like priority or TTL:

```typescript
class UrgentAlertEvent extends MojkitEvent {
  constructor(payload: { message: string }) {
    super('UrgentAlertEvent', payload, undefined, {
      priority: 'high',
      ttl: 5000
    });
  }
}
```

## Usage in Different Handler Types

### Commands

Commands typically publish events after successfully executing business logic:

```typescript
async function placeOrderCommand(
  payload: PlaceOrderPayload,
  context: HandlerContext
) {
  // Validate input
  // Execute business logic
  const orderId = createOrder(payload);
  
  // Publish domain event
  await context.publishEvent(
    new OrderCreatedEvent({ orderId, ...payload })
  );
  
  return { orderId };
}
```

### Sagas (Event Listeners)

Sagas react to events and may publish follow-up events:

```typescript
async function orderCreatedSaga(
  payload: OrderCreatedEventPayload,
  context: HandlerContext
) {
  // React to OrderCreatedEvent
  const items = await reserveInventory(payload.orderId);
  
  // Publish follow-up event
  await context.publishEvent(
    new InventoryReservedEvent({ orderId: payload.orderId, items })
  );
}
```

### Queries

Queries typically shouldn't publish events (they're read-only), but it's supported for analytics:

```typescript
async function getOrderQuery(
  payload: { orderId: string },
  context: HandlerContext
) {
  const order = await fetchOrder(payload.orderId);
  
  // Optional: publish analytics event
  await context.publishEvent({
    name: 'OrderViewedEvent',
    data: { orderId: payload.orderId, viewedAt: new Date().toISOString() }
  });
  
  return order;
}
```

## Testing

Mock `publishEvent` in your tests:

```typescript
import { describe, it, expect } from 'bun:test';

describe('placeOrderCommand', () => {
  it('should publish OrderCreatedEvent', async () => {
    const publishedEvents: any[] = [];
    
    const mockContext = {
      busMessage: {} as any,
      app: {} as any,
      publishEvent: async (event: any) => {
        publishedEvents.push(event);
      }
    };
    
    await placeOrderCommand(
      { items: [{ sku: 'WIDGET', quantity: 1 }] },
      mockContext
    );
    
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].eventName).toBe('OrderCreatedEvent');
  });
});
```

## Best Practices

### 1. Event Naming

- Use past tense: `OrderCreatedEvent`, not `CreateOrderEvent`
- Be specific: `UserRegisteredEvent`, not `UserEvent`

### 2. Event Payload

- Keep payloads focused and minimal
- Include only data relevant to the event
- Use typed interfaces for payloads

```typescript
// Good
class OrderCreatedEvent extends MojkitEvent {
  constructor(payload: { orderId: string; customerId: string; total: number }) {
    super('OrderCreatedEvent', payload);
  }
}

// Avoid
class OrderCreatedEvent extends MojkitEvent {
  constructor(payload: any) { // Too loose
    super('OrderCreatedEvent', payload);
  }
}
```

### 3. Correlation Tracking

- Don't manually set correlationId
- It's automatically propagated from the incoming message
- All events in a flow share the same correlationId

### 4. Metadata

- Don't manually populate `_meta`
- Use `getMeta()` to read metadata after publishing
- Metadata is for observability, not business logic

### 5. Error Handling

- `publishEvent` is async and can throw
- Handle errors appropriately in your handler
- Consider whether event publishing failure should fail the handler

```typescript
async function placeOrderCommand(payload: any, context: HandlerContext) {
  const orderId = createOrder(payload);
  
  try {
    await context.publishEvent(new OrderCreatedEvent({ orderId }));
  } catch (error) {
    console.error('Failed to publish event:', error);
    // Decide: should we fail the command or just log?
  }
  
  return { orderId };
}
```

## Migration Guide

### From Direct Bus Access

**Before:**
```typescript
import { Bus } from '@mojkit/core';

async function placeOrderCommand(payload: any) {
  const orderId = createOrder(payload);
  
  const bus = Bus.getInstance().get();
  await bus.sendEvent({
    kind: 'event',
    namespace: 'Order.Management',
    name: 'OrderCreatedEvent',
    payload: { orderId }
  });
  
  return { orderId };
}
```

**After:**
```typescript
import { MojkitEvent, type HandlerContext } from '@mojkit/core';

class OrderCreatedEvent extends MojkitEvent {
  constructor(payload: { orderId: string }) {
    super('OrderCreatedEvent', payload);
  }
}

async function placeOrderCommand(
  payload: any,
  context: HandlerContext
) {
  const orderId = createOrder(payload);
  
  await context.publishEvent(new OrderCreatedEvent({ orderId }));
  
  return { orderId };
}
```

**Benefits:**
- No need to import or access Bus singleton
- Metadata automatically populated
- Type-safe event definitions
- Easier to test (mock `publishEvent` instead of Bus)

## API Reference

### `MojkitEvent` (abstract class)

Base class for domain events.

**Constructor:**
```typescript
constructor(
  eventName: string,
  payload: unknown,
  frontEndData?: unknown,
  busOptions?: Record<string, any>
)
```

**Methods:**
- `getMeta(): MojkitEventMeta | undefined` - Get metadata after publishing

### `PlainMojkitEvent` (interface)

Plain object event format.

```typescript
interface PlainMojkitEvent {
  name: string;
  data: unknown;
  frontEndData?: unknown;
  busOptions?: Record<string, any>;
  _meta?: MojkitEventMeta;
}
```

### `PublishEventFunction` (type)

```typescript
type PublishEventFunction = (event: PublishableEvent) => Promise<void>;
```

### `MojkitEventMeta` (interface)

```typescript
interface MojkitEventMeta {
  namespace: string;
  correlationId: string;
  handlerType: 'command' | 'saga' | 'event';
  handlerName: string;
  publishedAt: string;
}
```

## Troubleshooting

### "Invalid event format" error

Make sure your event is either:
- A class extending `MojkitEvent`, or
- A plain object with `name` and `data` fields

### Metadata is undefined

`_meta` is only populated after calling `publishEvent`. If you access it before publishing, it will be undefined.

### Events not being received

Check that:
- The event name matches the saga listener configuration
- The namespace is correct
- The bus is properly initialized
- Listeners are registered before publishing

### Type errors with context

Make sure your handler signature includes `context: HandlerContext`:

```typescript
// Correct
async function myCommand(payload: any, context: HandlerContext) { }

// Wrong
async function myCommand(payload: any, context?: HandlerContext) { }
```
