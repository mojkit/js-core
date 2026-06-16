import { describe, it, expect, beforeEach, mock } from "bun:test";
import { WaveEvent } from "../../bus/events";
import { ListenerRegistrar } from "../../bus/handlers/ListenerRegistrar";
import type { ResolvedWaveConfig } from "../../config/types";
import type { HandlerContext } from "../../bus/types";

/**
 * Integration test to verify publishEvent works end-to-end
 * with the ListenerRegistrar and handler invocation.
 */

class TestOrderCreatedEvent extends WaveEvent {
  constructor(payload: { orderId: string; amount: number }) {
    super("OrderCreatedEvent", payload);
  }
}

describe("publishEvent integration", () => {
  it("should inject publishEvent into command handler context", async () => {
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
    expect(capturedContext?.publishEvent).toBeDefined();
    expect(typeof capturedContext?.publishEvent).toBe("function");
    expect(capturedContext?.app).toBe(mockAppDispatcher);
  });

  it("should allow handler to publish events using publishEvent", async () => {
    const publishedEvents: any[] = [];

    // Command handler that publishes an event
    const commandHandler = async (message: any, context: HandlerContext) => {
      const event = new TestOrderCreatedEvent({
        orderId: "order-123",
        amount: 100,
      });

      await context.publishEvent(event);

      return { success: true };
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

        await handler({ test: "data" }, mockBusMessage);
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

    // Verify event was published
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].kind).toBe("event");
    expect(publishedEvents[0].namespace).toBe("Order.Management");
    expect(publishedEvents[0].name).toBe("OrderCreatedEvent");
    expect(publishedEvents[0].payload.orderId).toBe("order-123");
    expect(publishedEvents[0].payload.amount).toBe(100);
    expect(publishedEvents[0].payload._meta).toBeDefined();
    expect(publishedEvents[0].payload._meta.handlerType).toBe("command");
    expect(publishedEvents[0].payload._meta.handlerName).toBe("placeOrder");
    expect(publishedEvents[0].payload._meta.correlationId).toBe("test-corr-456");
  });

  it("should inject publishEvent into saga handler context", async () => {
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
    expect(capturedContext?.publishEvent).toBeDefined();
    expect(typeof capturedContext?.publishEvent).toBe("function");
  });

  it("should propagate correlationId through event chain", async () => {
    const publishedEvents: any[] = [];
    const originalCorrelationId = "chain-corr-999";

    const commandHandler = async (message: any, context: HandlerContext) => {
      await context.publishEvent(
        new TestOrderCreatedEvent({ orderId: "order-123", amount: 100 })
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

        await handler({}, mockBusMessage);
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
});
