import { describe, it, expect, beforeEach, mock } from "bun:test";
import { WaveError } from "../../bus/errors";
import { ListenerRegistrar } from "../../bus/handlers/ListenerRegistrar";
import type { ResolvedWaveConfig } from "../../config/types";
import type { HandlerContext } from "../../bus/types";

/**
 * Integration test to verify reject works end-to-end
 * with the ListenerRegistrar and handler invocation.
 */

class TestInsufficientInventoryError extends WaveError {
  constructor(data: { orderId: string; requestedQty: number; availableQty: number }) {
    super("INSUFFICIENT_INVENTORY", "Not enough inventory", data);
  }
}

describe("reject integration", () => {
  it("should inject reject into command handler context", async () => {
    let capturedContext: HandlerContext | null = null;

    // Mock command handler that captures the context
    const commandHandler = async (message: any, context: HandlerContext) => {
      capturedContext = context;
      return { success: true };
    };

    // Mock bus
    const mockBus = {
      addCommandListener: mock(async (namespace: string, name: string, handler: any) => {
        // Simulate calling the handler
        const mockBusMessage = {
          message: {
            body: {
              extensions: { correlationId: "test-corr-123" },
            },
          },
          ack: () => 1,
          nack: () => 1,
        };

        await handler({ test: "data" }, mockBusMessage);
      }),
      addQueryListener: mock(async () => {}),
      addEventListener: mock(async () => {}),
      sendEvent: mock(async () => {}),
    };

    // Mock AppDispatcher
    const mockAppDispatcher = {} as any;

    // Create config
    const config: ResolvedWaveConfig = {
      domains: {
        "Test.Domain": {
          commands: {
            testCommand: commandHandler,
          },
        },
      },
      service: {
        name: "test-service",
        environment: "test",
      },
      messageBus: {},
    };

    // Register listeners
    const registrar = new ListenerRegistrar();
    await (registrar as any).registerCommandListeners(
      mockBus,
      mockAppDispatcher,
      "Test.Domain",
      config.domains["Test.Domain"]
    );

    // Verify context was captured
    expect(capturedContext).not.toBeNull();
    expect(capturedContext?.reject).toBeDefined();
    expect(typeof capturedContext?.reject).toBe("function");
    expect(capturedContext?.app).toBe(mockAppDispatcher);
  });

  it("should allow handler to reject with errors using reject", async () => {
    const publishedEvents: any[] = [];
    let thrownError: any = null;

    // Command handler that rejects with an error
    const commandHandler = async (message: any, context: HandlerContext) => {
      const error = new TestInsufficientInventoryError({
        orderId: "order-123",
        requestedQty: 10,
        availableQty: 5,
      });

      await context.reject(error);

      return { success: true }; // Never reaches here
    };

    // Mock bus that captures published events
    const mockBus = {
      addCommandListener: mock(async (namespace: string, name: string, handler: any) => {
        const mockBusMessage = {
          message: {
            body: {
              extensions: { correlationId: "test-corr-456" },
            },
          },
          ack: () => 1,
          nack: () => 1,
        };

        try {
          await handler({ test: "data" }, mockBusMessage);
        } catch (error) {
          thrownError = error;
        }
      }),
      sendEvent: mock(async (event: any) => {
        publishedEvents.push(event);
      }),
      addQueryListener: mock(async () => {}),
      addEventListener: mock(async () => {}),
    };

    const mockAppDispatcher = {} as any;

    const config: ResolvedWaveConfig = {
      domains: {
        "Order.Management": {
          commands: {
            placeOrder: commandHandler,
          },
        },
      },
      service: {
        name: "test-service",
        environment: "test",
      },
      messageBus: {},
    };

    const registrar = new ListenerRegistrar();
    await (registrar as any).registerCommandListeners(
      mockBus,
      mockAppDispatcher,
      "Order.Management",
      config.domains["Order.Management"]
    );

    // Verify error event was published
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].kind).toBe("event");
    expect(publishedEvents[0].namespace).toBe("Order.Management");
    expect(publishedEvents[0].name).toBe("placeOrderErrorEvent");
    expect(publishedEvents[0].payload.errorCode).toBe("INSUFFICIENT_INVENTORY");
    expect(publishedEvents[0].payload.message).toBe("Not enough inventory");
    expect(publishedEvents[0].payload.data.orderId).toBe("order-123");
    expect(publishedEvents[0].payload._meta).toBeDefined();
    expect(publishedEvents[0].payload._meta.handlerType).toBe("command");
    expect(publishedEvents[0].payload._meta.handlerName).toBe("placeOrder");
    expect(publishedEvents[0].payload._meta.correlationId).toBe("test-corr-456");

    // Verify error was thrown
    expect(thrownError).not.toBeNull();
    // Note: ErrorHandler wraps all errors in SerializableError
    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError.message).toBe("Not enough inventory");
  });

  it("should inject reject into saga handler context", async () => {
    let capturedContext: HandlerContext | null = null;

    const sagaHandler = async (message: any, context: HandlerContext) => {
      capturedContext = context;
    };

    const mockBus = {
      addEventListener: mock(async (namespace: string, name: string, handler: any) => {
        const mockBusMessage = {
          message: {
            body: {
              context: { correlationId: "saga-corr-789" },
            },
          },
          ack: () => 1,
          nack: () => 1,
        };

        await handler({ orderId: "order-123" }, mockBusMessage);
      }),
      addCommandListener: mock(async () => {}),
      addQueryListener: mock(async () => {}),
      sendEvent: mock(async () => {}),
    };

    const mockAppDispatcher = {} as any;

    const config: ResolvedWaveConfig = {
      domains: {
        "Inventory.Management": {
          sagas: {
            "Order.Management.OrderCreatedEvent": sagaHandler,
          },
        },
      },
      service: {
        name: "test-service",
        environment: "test",
      },
      messageBus: {},
    };

    const registrar = new ListenerRegistrar();
    await (registrar as any).registerSagaListeners(
      mockBus,
      mockAppDispatcher,
      "Inventory.Management",
      config.domains["Inventory.Management"]
    );

    expect(capturedContext).not.toBeNull();
    expect(capturedContext?.reject).toBeDefined();
    expect(typeof capturedContext?.reject).toBe("function");
  });

  it("should propagate correlationId through error events", async () => {
    const publishedEvents: any[] = [];
    const originalCorrelationId = "chain-corr-999";

    const commandHandler = async (message: any, context: HandlerContext) => {
      await context.reject(
        new TestInsufficientInventoryError({
          orderId: "order-123",
          requestedQty: 10,
          availableQty: 5,
        })
      );
    };

    const mockBus = {
      addCommandListener: mock(async (namespace: string, name: string, handler: any) => {
        const mockBusMessage = {
          message: {
            body: {
              extensions: { correlationId: originalCorrelationId },
            },
          },
          ack: () => 1,
          nack: () => 1,
        };

        try {
          await handler({}, mockBusMessage);
        } catch (error) {
          // Expected
        }
      }),
      sendEvent: mock(async (event: any) => {
        publishedEvents.push(event);
      }),
      addQueryListener: mock(async () => {}),
      addEventListener: mock(async () => {}),
    };

    const mockAppDispatcher = {} as any;

    const config: ResolvedWaveConfig = {
      domains: {
        "Order.Management": {
          commands: {
            placeOrder: commandHandler,
          },
        },
      },
      service: {
        name: "test-service",
        environment: "test",
      },
      messageBus: {},
    };

    const registrar = new ListenerRegistrar();
    await (registrar as any).registerCommandListeners(
      mockBus,
      mockAppDispatcher,
      "Order.Management",
      config.domains["Order.Management"]
    );

    // Verify correlationId is propagated
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].context.correlationId).toBe(originalCorrelationId);
    expect(publishedEvents[0].payload._meta.correlationId).toBe(originalCorrelationId);
  });

  it("should handle plain object errors in handlers", async () => {
    const publishedEvents: any[] = [];

    const commandHandler = async (message: any, context: HandlerContext) => {
      await context.reject({
        errorCode: "PAYMENT_DECLINED",
        message: "Payment was declined",
        data: { orderId: "order-123", reason: "insufficient_funds" },
      });
    };

    const mockBus = {
      addCommandListener: mock(async (namespace: string, name: string, handler: any) => {
        const mockBusMessage = {
          message: {
            body: {
              extensions: { correlationId: "test-corr-999" },
            },
          },
          ack: () => 1,
          nack: () => 1,
        };

        try {
          await handler({}, mockBusMessage);
        } catch (error) {
          // Expected
        }
      }),
      sendEvent: mock(async (event: any) => {
        publishedEvents.push(event);
      }),
      addQueryListener: mock(async () => {}),
      addEventListener: mock(async () => {}),
    };

    const mockAppDispatcher = {} as any;

    const config: ResolvedWaveConfig = {
      domains: {
        "Payment.Gateway": {
          commands: {
            processPayment: commandHandler,
          },
        },
      },
      service: {
        name: "test-service",
        environment: "test",
      },
      messageBus: {},
    };

    const registrar = new ListenerRegistrar();
    await (registrar as any).registerCommandListeners(
      mockBus,
      mockAppDispatcher,
      "Payment.Gateway",
      config.domains["Payment.Gateway"]
    );

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].name).toBe("processPaymentErrorEvent");
    expect(publishedEvents[0].payload.errorCode).toBe("PAYMENT_DECLINED");
  });
});
