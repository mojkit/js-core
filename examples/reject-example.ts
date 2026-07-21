/**
 * Example demonstrating how to use reject in handlers.
 *
 * This example shows:
 * - Class-based errors (type-safe, recommended)
 * - Plain object errors (simpler, less type safety)
 * - Factory function pattern for errors
 * - Rejecting from commands, sagas, and queries
 * - Error event publishing and listening
 * - Testing with mock reject
 */

import { MojkitError, type HandlerContext } from "../index";

// ============================================================================
// 1. Define Class-Based Errors (Recommended)
// ============================================================================

/**
 * Type-safe error for insufficient inventory.
 */
class InsufficientInventoryError extends MojkitError {
  constructor(data: { orderId: string; requestedQty: number; availableQty: number }) {
    super(
      'INSUFFICIENT_INVENTORY',
      'Not enough inventory to fulfill order',
      data
    );
  }
}

/**
 * Type-safe error for payment declined.
 */
class PaymentDeclinedError extends MojkitError {
  constructor(data: { orderId: string; reason: string; transactionId?: string }) {
    super(
      'PAYMENT_DECLINED',
      'Payment was declined by the processor',
      data
    );
  }
}

/**
 * Type-safe error for validation failures.
 */
class ValidationError extends MojkitError {
  constructor(
    data: { field: string; value: any; constraint: string },
    frontEndPayload?: { showToUser: boolean; userMessage: string }
  ) {
    super(
      'VALIDATION_ERROR',
      `Validation failed for field: ${data.field}`,
      data,
      frontEndPayload
    );
  }
}

// ============================================================================
// 2. Factory Function Pattern
// ============================================================================

/**
 * Factory function that returns a MojkitError instance.
 * This pattern is convenient for common errors.
 */
const INSUFFICIENT_INVENTORY = (data: { orderId: string; requestedQty: number; availableQty: number }) =>
  new InsufficientInventoryError(data);

const PAYMENT_DECLINED = (data: { orderId: string; reason: string; transactionId?: string }) =>
  new PaymentDeclinedError(data);

const VALIDATION_FAILED = (data: { field: string; value: any; constraint: string }) =>
  new ValidationError(data, {
    showToUser: true,
    userMessage: `Invalid value for ${data.field}`
  });

// ============================================================================
// 3. Command Handler - Rejecting with Class-Based Errors
// ============================================================================

interface PlaceOrderPayload {
  customerId: string;
  items: Array<{ sku: string; quantity: number; price: number }>;
}

/**
 * Command handler that rejects with structured errors.
 */
async function placeOrderCommand(
  payload: PlaceOrderPayload,
  context: HandlerContext
): Promise<{ orderId: string; total: number }> {
  const { customerId, items } = payload;

  // Validation
  if (!items || items.length === 0) {
    await context.reject(
      VALIDATION_FAILED({
        field: 'items',
        value: items,
        constraint: 'must not be empty'
      })
    );
    // Never reaches here - reject throws
  }

  // Check inventory
  const availableQty = await checkInventory(items[0].sku);
  if (availableQty < items[0].quantity) {
    await context.reject(
      INSUFFICIENT_INVENTORY({
        orderId: 'pending',
        requestedQty: items[0].quantity,
        availableQty
      })
    );
    // Never reaches here
  }

  // Business logic
  const orderId = `order-${Date.now()}`;
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return { orderId, total };
}

async function checkInventory(sku: string): Promise<number> {
  // Simulated inventory check
  return 5;
}

// ============================================================================
// 4. Command Handler - Rejecting with Plain Object Errors
// ============================================================================

interface ProcessPaymentPayload {
  orderId: string;
  amount: number;
  paymentMethod: string;
}

/**
 * Command handler that rejects with plain object errors.
 */
async function processPaymentCommand(
  payload: ProcessPaymentPayload,
  context: HandlerContext
): Promise<{ transactionId: string }> {
  const { orderId, amount, paymentMethod } = payload;

  // Simulate payment processing
  const paymentResult = await processPayment(orderId, amount, paymentMethod);

  if (!paymentResult.success) {
    // Reject with plain object error
    await context.reject({
      errorCode: 'PAYMENT_DECLINED',
      message: 'Payment was declined by the processor',
      data: {
        orderId,
        reason: paymentResult.reason,
        transactionId: paymentResult.transactionId
      }
    });
    // Never reaches here
  }

  return { transactionId: paymentResult.transactionId! };
}

async function processPayment(orderId: string, amount: number, method: string) {
  // Simulated payment processing
  return {
    success: false,
    reason: 'insufficient_funds',
    transactionId: 'txn-123'
  };
}

// ============================================================================
// 5. Saga Handler - Listening to Error Events
// ============================================================================

interface PlaceOrderErrorEventPayload {
  errorCode: string;
  message: string;
  data: {
    orderId: string;
    requestedQty: number;
    availableQty: number;
  };
  _meta: {
    namespace: string;
    correlationId: string;
    handlerType: string;
    handlerName: string;
    rejectedAt: string;
  };
}

/**
 * Saga that listens to PlaceOrderErrorEvent and handles the failure.
 */
async function orderErrorSaga(
  payload: PlaceOrderErrorEventPayload,
  context: HandlerContext
): Promise<void> {
  const { errorCode, message, data, _meta } = payload;

  console.log(`Order placement failed in ${_meta.handlerName}:`, errorCode);
  console.log('Error details:', data);

  // Handle different error types
  switch (errorCode) {
    case 'INSUFFICIENT_INVENTORY':
      // Send notification to customer
      await sendNotification(data.orderId, 'We are out of stock');
      // Trigger restock process
      await triggerRestock(data);
      break;

    case 'PAYMENT_DECLINED':
      // Send payment failure notification
      await sendNotification(data.orderId, 'Payment was declined');
      break;

    case 'VALIDATION_ERROR':
      // Log validation error for analytics
      console.log('Validation error:', data);
      break;

    default:
      console.log('Unknown error type:', errorCode);
  }
}

async function sendNotification(orderId: string, message: string) {
  console.log(`Notification for ${orderId}: ${message}`);
}

async function triggerRestock(data: any) {
  console.log('Triggering restock process:', data);
}

// ============================================================================
// 6. Saga Handler - Rejecting from Saga
// ============================================================================

interface OrderCreatedEventPayload {
  orderId: string;
  customerId: string;
  total: number;
}

/**
 * Saga that processes order and may reject with errors.
 */
async function processOrderSaga(
  payload: OrderCreatedEventPayload,
  context: HandlerContext
): Promise<void> {
  const { orderId, customerId, total } = payload;

  // Validate customer credit limit
  const creditLimit = await getCreditLimit(customerId);
  if (total > creditLimit) {
    await context.reject({
      errorCode: 'CREDIT_LIMIT_EXCEEDED',
      message: 'Order total exceeds customer credit limit',
      data: {
        orderId,
        customerId,
        total,
        creditLimit
      }
    });
    // Never reaches here
  }

  // Continue processing
  console.log(`Processing order ${orderId}`);
}

async function getCreditLimit(customerId: string): Promise<number> {
  return 1000;
}

// ============================================================================
// 7. Query Handler - Rejecting from Query
// ============================================================================

interface GetOrderPayload {
  orderId: string;
}

/**
 * Query handler that rejects if order not found.
 */
async function getOrderQuery(
  payload: GetOrderPayload,
  context: HandlerContext
): Promise<{ orderId: string; status: string }> {
  const { orderId } = payload;

  const order = await findOrder(orderId);

  if (!order) {
    await context.reject({
      errorCode: 'ORDER_NOT_FOUND',
      message: `Order ${orderId} not found`,
      data: { orderId }
    });
    // Never reaches here
  }

  return order;
}

async function findOrder(orderId: string) {
  // Simulated database lookup
  return null;
}

// ============================================================================
// 8. Accessing Error Metadata
// ============================================================================

async function exampleWithMetadata(context: HandlerContext) {
  const error = new InsufficientInventoryError({
    orderId: 'order-123',
    requestedQty: 10,
    availableQty: 5
  });

  try {
    await context.reject(error);
  } catch (e) {
    // After rejection, metadata is populated
    const meta = error.getMeta();
    console.log('Error rejected at:', meta?.rejectedAt);
    console.log('From handler:', meta?.handlerName);
    console.log('Correlation ID:', meta?.correlationId);
  }
}

// ============================================================================
// 9. Testing with Mock reject
// ============================================================================

/**
 * Example of testing a handler with a mock reject function.
 */
async function testPlaceOrderCommand() {
  const rejectedErrors: any[] = [];

  // Create mock context
  const mockContext: HandlerContext = {
    busMessage: {} as any,
    app: {} as any,
    publishEvent: async () => {},
    reject: async (error: any) => {
      rejectedErrors.push(error);
      throw error; // Must throw to match real behavior
    },
  };

  // Test validation error
  try {
    await placeOrderCommand(
      {
        customerId: 'customer-123',
        items: [], // Empty items should trigger validation error
      },
      mockContext
    );
  } catch (error) {
    // Expected to throw
  }

  // Assert
  console.assert(rejectedErrors.length === 1, 'Should reject 1 error');
  console.assert(
    rejectedErrors[0].errorCode === 'VALIDATION_ERROR',
    'Should reject with VALIDATION_ERROR'
  );
}

// ============================================================================
// 10. Domain Configuration
// ============================================================================

export const exampleConfig = {
  domains: {
    'Order.Management': {
      commands: {
        placeOrder: placeOrderCommand,
        processPayment: processPaymentCommand,
      },
      queries: {
        getOrder: getOrderQuery,
      },
      sagas: {
        // Listen to error events from placeOrder command
        'Order.Management.placeOrderErrorEvent': orderErrorSaga,
        // Listen to order created and process
        'Order.Management.OrderCreatedEvent': processOrderSaga,
      },
    },
  },
};

// ============================================================================
// 11. Error Event Structure
// ============================================================================

/**
 * When reject is called in placeOrderCommand, it publishes:
 *
 * Event name: "placeOrderErrorEvent"
 * Namespace: "Order.Management"
 * Payload: {
 *   errorCode: 'INSUFFICIENT_INVENTORY',
 *   message: 'Not enough inventory to fulfill order',
 *   data: {
 *     orderId: 'pending',
 *     requestedQty: 10,
 *     availableQty: 5
 *   },
 *   _meta: {
 *     namespace: 'Order.Management',
 *     correlationId: 'abc-123',
 *     handlerType: 'command',
 *     handlerName: 'placeOrder',
 *     rejectedAt: '2024-05-24T10:30:00.000Z'
 *   }
 * }
 */

// ============================================================================
// 12. Best Practices
// ============================================================================

/**
 * BEST PRACTICES:
 *
 * 1. Use class-based errors for type safety
 *    - Extend MojkitError
 *    - Define typed data in constructor
 *    - IDE autocomplete and compile-time checks
 *
 * 2. Use factory functions for common errors
 *    - Convenient and consistent
 *    - Easy to reuse across handlers
 *    - Can include default frontEndPayload
 *
 * 3. Use plain object errors for simplicity
 *    - Quick prototyping
 *    - Simple error structures
 *    - No need for class definitions
 *
 * 4. Error naming conventions
 *    - Use UPPER_SNAKE_CASE for error codes: INSUFFICIENT_INVENTORY
 *    - Be specific: PAYMENT_DECLINED, not PAYMENT_ERROR
 *    - Include domain context in error code
 *
 * 5. Error events are auto-named
 *    - Pattern: ${handlerName}ErrorEvent
 *    - placeOrder → placeOrderErrorEvent
 *    - processPayment → processPaymentErrorEvent
 *
 * 6. Metadata is auto-populated
 *    - Don't manually set _meta fields
 *    - Use getMeta() to read metadata after rejection
 *    - Metadata includes: namespace, correlationId, handlerType, handlerName, rejectedAt
 *
 * 7. Listen to error events in sagas
 *    - Handle failures gracefully
 *    - Send notifications, trigger compensating actions
 *    - Log for analytics and monitoring
 *
 * 8. Testing
 *    - Mock reject in tests
 *    - Verify errors are rejected with correct data
 *    - Test error event publishing
 *    - Remember: reject always throws
 *
 * 9. Frontend data
 *    - Use frontEndPayload for UI-specific information
 *    - Keep business logic in data field
 *    - Frontend can subscribe to error events and show notifications
 *
 * 10. Correlation tracking
 *     - correlationId is automatically propagated
 *     - All errors in a flow share the same correlationId
 *     - Useful for distributed tracing and debugging
 */

export {
  InsufficientInventoryError,
  PaymentDeclinedError,
  ValidationError,
  INSUFFICIENT_INVENTORY,
  PAYMENT_DECLINED,
  VALIDATION_FAILED,
  placeOrderCommand,
  processPaymentCommand,
  orderErrorSaga,
  processOrderSaga,
  getOrderQuery,
  testPlaceOrderCommand,
};
