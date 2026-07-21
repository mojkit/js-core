/**
 * Example demonstrating how to use publishEvent in handlers.
 *
 * This example shows:
 * - Class-based events (type-safe, recommended)
 * - Plain object events (simpler, less type safety)
 * - Publishing from commands, sagas, and queries
 * - Accessing _meta after publishing
 */

import { MojkitEvent, type HandlerContext } from "../index";

// ============================================================================
// 1. Define Class-Based Events (Recommended)
// ============================================================================

/**
 * Type-safe event for order creation.
 */
class OrderCreatedEvent extends MojkitEvent {
  constructor(payload: { orderId: string; amount: number; customerId: string }) {
    super('OrderCreatedEvent', payload);
  }
}

/**
 * Type-safe event for inventory reservation.
 */
class InventoryReservedEvent extends MojkitEvent {
  constructor(payload: { orderId: string; items: Array<{ sku: string; quantity: number }> }) {
    super('InventoryReservedEvent', payload);
  }
}

/**
 * Type-safe event for payment processing.
 */
class PaymentProcessedEvent extends MojkitEvent {
  constructor(
    payload: { orderId: string; amount: number; transactionId: string },
    frontEndData?: { showNotification: boolean; message: string }
  ) {
    super('PaymentProcessedEvent', payload, frontEndData);
  }
}

// ============================================================================
// 2. Command Handler - Publishing Class-Based Events
// ============================================================================

interface PlaceOrderPayload {
  customerId: string;
  items: Array<{ sku: string; quantity: number; price: number }>;
}

/**
 * Command handler that publishes events after placing an order.
 */
async function placeOrderCommand(
  payload: PlaceOrderPayload,
  context: HandlerContext
): Promise<{ orderId: string; total: number }> {
  const { customerId, items } = payload;

  // Business logic
  const orderId = `order-${Date.now()}`;
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Publish domain event using class-based event
  const event = new OrderCreatedEvent({
    orderId,
    amount: total,
    customerId,
  });

  await context.publishEvent(event);

  // Access metadata after publishing (read-only)
  const meta = event.getMeta();
  console.log('Event published with metadata:', meta);
  // Output: { namespace: 'Order.Management', correlationId: '...', handlerType: 'command', handlerName: 'placeOrder', publishedAt: '2024-...' }

  return { orderId, total };
}

// ============================================================================
// 3. Command Handler - Publishing Plain Object Events
// ============================================================================

interface CancelOrderPayload {
  orderId: string;
  reason: string;
}

/**
 * Command handler that publishes a plain object event.
 */
async function cancelOrderCommand(
  payload: CancelOrderPayload,
  context: HandlerContext
): Promise<{ success: boolean }> {
  const { orderId, reason } = payload;

  // Business logic
  // ... cancel the order

  // Publish domain event using plain object
  await context.publishEvent({
    name: 'OrderCancelledEvent',
    data: {
      orderId,
      reason,
      cancelledAt: new Date().toISOString(),
    },
  });

  return { success: true };
}

// ============================================================================
// 4. Saga Handler - Publishing Events in Response to Other Events
// ============================================================================

interface OrderCreatedEventPayload {
  orderId: string;
  amount: number;
  customerId: string;
}

/**
 * Saga that listens to OrderCreatedEvent and publishes InventoryReservedEvent.
 */
async function orderCreatedSaga(
  payload: OrderCreatedEventPayload,
  context: HandlerContext
): Promise<void> {
  const { orderId } = payload;

  // Business logic - reserve inventory
  const items = [
    { sku: 'WIDGET-001', quantity: 2 },
    { sku: 'GADGET-002', quantity: 1 },
  ];

  // Publish follow-up event
  await context.publishEvent(
    new InventoryReservedEvent({
      orderId,
      items,
    })
  );

  console.log(`Inventory reserved for order ${orderId}`);
}

// ============================================================================
// 5. Saga Handler - Publishing Events with Frontend Data
// ============================================================================

interface PaymentReceivedEventPayload {
  orderId: string;
  amount: number;
  transactionId: string;
}

/**
 * Saga that publishes an event with frontend-specific data.
 */
async function paymentReceivedSaga(
  payload: PaymentReceivedEventPayload,
  context: HandlerContext
): Promise<void> {
  const { orderId, amount, transactionId } = payload;

  // Publish event with frontend notification data
  await context.publishEvent(
    new PaymentProcessedEvent(
      { orderId, amount, transactionId },
      {
        showNotification: true,
        message: `Payment of $${amount} processed successfully!`,
      }
    )
  );
}

// ============================================================================
// 6. Query Handler - Publishing Events (Less Common)
// ============================================================================

interface GetOrderPayload {
  orderId: string;
}

/**
 * Query handler that publishes an event when an order is accessed.
 * Note: Queries typically shouldn't publish events, but it's supported.
 */
async function getOrderQuery(
  payload: GetOrderPayload,
  context: HandlerContext
): Promise<{ orderId: string; status: string }> {
  const { orderId } = payload;

  // Fetch order
  const order = { orderId, status: 'shipped' };

  // Optionally publish an analytics event
  await context.publishEvent({
    name: 'OrderViewedEvent',
    data: { orderId, viewedAt: new Date().toISOString() },
  });

  return order;
}

// ============================================================================
// 7. Testing with Mock publishEvent
// ============================================================================

/**
 * Example of testing a handler with a mock publishEvent function.
 */
async function testPlaceOrderCommand() {
  const publishedEvents: any[] = [];

  // Create mock context
  const mockContext: HandlerContext = {
    busMessage: {} as any,
    app: {} as any,
    publishEvent: async (event: any) => {
      publishedEvents.push(event);
    },
  };

  // Call handler
  const result = await placeOrderCommand(
    {
      customerId: 'customer-123',
      items: [{ sku: 'WIDGET-001', quantity: 2, price: 10 }],
    },
    mockContext
  );

  // Assert
  console.assert(result.total === 20, 'Total should be 20');
  console.assert(publishedEvents.length === 1, 'Should publish 1 event');
  console.assert(
    publishedEvents[0].eventName === 'OrderCreatedEvent',
    'Should publish OrderCreatedEvent'
  );
}

// ============================================================================
// 8. Domain Configuration
// ============================================================================

export const exampleConfig = {
  domains: {
    'Order.Management': {
      commands: {
        placeOrder: placeOrderCommand,
        cancelOrder: cancelOrderCommand,
      },
      queries: {
        getOrder: getOrderQuery,
      },
      sagas: {
        'Order.Management.OrderCreatedEvent': orderCreatedSaga,
        'Payment.Gateway.PaymentReceivedEvent': paymentReceivedSaga,
      },
    },
  },
};

// ============================================================================
// 9. Best Practices
// ============================================================================

/**
 * BEST PRACTICES:
 *
 * 1. Use class-based events for type safety
 *    - Extend MojkitEvent
 *    - Define typed payload in constructor
 *    - IDE autocomplete and compile-time checks
 *
 * 2. Use plain object events for simplicity
 *    - Quick prototyping
 *    - Simple event structures
 *    - No need for class definitions
 *
 * 3. Event naming conventions
 *    - Use past tense: OrderCreatedEvent, PaymentProcessedEvent
 *    - Be specific: UserRegisteredEvent, not UserEvent
 *    - Include domain context in name
 *
 * 4. Metadata is auto-populated
 *    - Don't manually set _meta fields
 *    - Use getMeta() to read metadata after publishing
 *    - Metadata includes: namespace, correlationId, handlerType, handlerName, publishedAt
 *
 * 5. Testing
 *    - Mock publishEvent in tests
 *    - Verify events are published with correct data
 *    - Test event chaining in sagas
 *
 * 6. Frontend data
 *    - Use frontEndData for UI-specific information
 *    - Keep business logic in payload
 *    - Frontend can subscribe to events and show notifications
 *
 * 7. Correlation tracking
 *    - correlationId is automatically propagated
 *    - All events in a flow share the same correlationId
 *    - Useful for distributed tracing and debugging
 */

export {
  OrderCreatedEvent,
  InventoryReservedEvent,
  PaymentProcessedEvent,
  placeOrderCommand,
  cancelOrderCommand,
  orderCreatedSaga,
  paymentReceivedSaga,
  getOrderQuery,
  testPlaceOrderCommand,
};
