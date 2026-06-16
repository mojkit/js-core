import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  WaveEvent,
  createPublishEvent,
  type PublishEventContext,
  type WaveEventMeta,
} from "../../bus/events";
import type { WaveTransport } from "@wave/bus-rabbitmq";

// ============================================================================
// Test Event Classes
// ============================================================================

class TestEvent extends WaveEvent {
  constructor(payload: { id: string; value: number }) {
    super("TestEvent", payload);
  }
}

class TestEventWithFrontEndData extends WaveEvent {
  constructor(
    payload: { id: string },
    frontEndData: { message: string }
  ) {
    super("TestEventWithFrontEndData", payload, frontEndData);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("WaveEvent", () => {
  it("should create an event with eventName and payload", () => {
    const event = new TestEvent({ id: "test-1", value: 42 });

    expect(event.eventName).toBe("TestEvent");
    expect(event.payload).toEqual({ id: "test-1", value: 42 });
  });

  it("should have undefined _meta before publishing", () => {
    const event = new TestEvent({ id: "test-1", value: 42 });

    expect(event.getMeta()).toBeUndefined();
    expect(event._meta).toBeUndefined();
  });

  it("should support frontEndData", () => {
    const event = new TestEventWithFrontEndData(
      { id: "test-1" },
      { message: "Hello" }
    );

    expect(event.frontEndData).toEqual({ message: "Hello" });
  });

  it("should support busOptions", () => {
    class EventWithOptions extends WaveEvent {
      constructor(payload: any) {
        super("EventWithOptions", payload, undefined, { priority: "high" });
      }
    }

    const event = new EventWithOptions({ id: "test-1" });
    expect(event.busOptions).toEqual({ priority: "high" });
  });
});

describe("createPublishEvent", () => {
  let mockBus: WaveTransport;
  let sendEventMock: ReturnType<typeof mock>;
  let context: PublishEventContext;

  beforeEach(() => {
    sendEventMock = mock(async () => {});
    mockBus = {
      sendEvent: sendEventMock,
    } as any;

    context = {
      namespace: "Test.Domain",
      correlationId: "corr-123",
      handlerType: "command",
      handlerName: "testCommand",
    };
  });

  it("should create a publishEvent function", () => {
    const publishEvent = createPublishEvent(context, mockBus);

    expect(typeof publishEvent).toBe("function");
  });

  it("should publish class-based events", async () => {
    const publishEvent = createPublishEvent(context, mockBus);
    const event = new TestEvent({ id: "test-1", value: 42 });

    await publishEvent(event);

    expect(sendEventMock).toHaveBeenCalledTimes(1);
    const call = sendEventMock.mock.calls[0][0];

    expect(call.kind).toBe("event");
    expect(call.namespace).toBe("Test.Domain");
    expect(call.name).toBe("TestEvent");
    expect(call.payload).toMatchObject({
      id: "test-1",
      value: 42,
    });
    expect(call.context.correlationId).toBe("corr-123");
  });

  it("should publish plain object events", async () => {
    const publishEvent = createPublishEvent(context, mockBus);

    await publishEvent({
      name: "PlainEvent",
      data: { id: "test-1", status: "active" },
    });

    expect(sendEventMock).toHaveBeenCalledTimes(1);
    const call = sendEventMock.mock.calls[0][0];

    expect(call.kind).toBe("event");
    expect(call.namespace).toBe("Test.Domain");
    expect(call.name).toBe("PlainEvent");
    expect(call.payload).toMatchObject({
      id: "test-1",
      status: "active",
    });
  });

  it("should auto-populate _meta for class-based events", async () => {
    const publishEvent = createPublishEvent(context, mockBus);
    const event = new TestEvent({ id: "test-1", value: 42 });

    expect(event.getMeta()).toBeUndefined();

    await publishEvent(event);

    const meta = event.getMeta();
    expect(meta).toBeDefined();
    expect(meta?.namespace).toBe("Test.Domain");
    expect(meta?.correlationId).toBe("corr-123");
    expect(meta?.handlerType).toBe("command");
    expect(meta?.handlerName).toBe("testCommand");
    expect(meta?.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  });

  it("should auto-populate _meta for plain object events", async () => {
    const publishEvent = createPublishEvent(context, mockBus);
    const event = {
      name: "PlainEvent",
      data: { id: "test-1" },
    };

    await publishEvent(event);

    expect(event._meta).toBeDefined();
    expect(event._meta?.namespace).toBe("Test.Domain");
    expect(event._meta?.correlationId).toBe("corr-123");
    expect(event._meta?.handlerType).toBe("command");
    expect(event._meta?.handlerName).toBe("testCommand");
  });

  it("should include _meta in the payload sent to bus", async () => {
    const publishEvent = createPublishEvent(context, mockBus);
    const event = new TestEvent({ id: "test-1", value: 42 });

    await publishEvent(event);

    const call = sendEventMock.mock.calls[0][0];
    expect(call.payload._meta).toBeDefined();
    expect(call.payload._meta.namespace).toBe("Test.Domain");
    expect(call.payload._meta.correlationId).toBe("corr-123");
  });

  it("should preserve correlationId from context", async () => {
    const customContext = {
      ...context,
      correlationId: "custom-corr-456",
    };

    const publishEvent = createPublishEvent(customContext, mockBus);
    const event = new TestEvent({ id: "test-1", value: 42 });

    await publishEvent(event);

    const meta = event.getMeta();
    expect(meta?.correlationId).toBe("custom-corr-456");

    const call = sendEventMock.mock.calls[0][0];
    expect(call.context.correlationId).toBe("custom-corr-456");
  });

  it("should handle different handler types", async () => {
    const sagaContext: PublishEventContext = {
      namespace: "Test.Domain",
      correlationId: "corr-123",
      handlerType: "saga",
      handlerName: "testSaga",
    };

    const publishEvent = createPublishEvent(sagaContext, mockBus);
    const event = new TestEvent({ id: "test-1", value: 42 });

    await publishEvent(event);

    const meta = event.getMeta();
    expect(meta?.handlerType).toBe("saga");
    expect(meta?.handlerName).toBe("testSaga");
  });

  it("should handle eventListener handler type", async () => {
    const listenerContext: PublishEventContext = {
      namespace: "Test.Domain",
      correlationId: "corr-123",
      handlerType: "eventListener",
      handlerName: "Order.OrderCreatedEvent",
    };

    const publishEvent = createPublishEvent(listenerContext, mockBus);
    const event = new TestEvent({ id: "test-1", value: 42 });

    await publishEvent(event);

    const meta = event.getMeta();
    expect(meta?.handlerType).toBe("eventListener");
    expect(meta?.handlerName).toBe("Order.OrderCreatedEvent");
  });

  it("should include frontEndData in context", async () => {
    const publishEvent = createPublishEvent(context, mockBus);
    const event = new TestEventWithFrontEndData(
      { id: "test-1" },
      { message: "Hello" }
    );

    await publishEvent(event);

    const call = sendEventMock.mock.calls[0][0];
    expect(call.context.frontEndData).toEqual({ message: "Hello" });
  });

  it("should merge busOptions into sendEvent call", async () => {
    class EventWithOptions extends WaveEvent {
      constructor(payload: any) {
        super("EventWithOptions", payload, undefined, {
          priority: "high",
          ttl: 5000,
        });
      }
    }

    const publishEvent = createPublishEvent(context, mockBus);
    const event = new EventWithOptions({ id: "test-1" });

    await publishEvent(event);

    const call = sendEventMock.mock.calls[0][0];
    expect(call.priority).toBe("high");
    expect(call.ttl).toBe(5000);
  });

  it("should throw error for invalid event format", async () => {
    const publishEvent = createPublishEvent(context, mockBus);

    // Invalid event (missing 'name' or 'eventName')
    const invalidEvent = { data: { id: "test-1" } } as any;

    await expect(publishEvent(invalidEvent)).rejects.toThrow(
      "Invalid event format"
    );
  });

  it("should handle primitive payloads", async () => {
    const publishEvent = createPublishEvent(context, mockBus);

    await publishEvent({
      name: "PrimitiveEvent",
      data: "simple string",
    });

    const call = sendEventMock.mock.calls[0][0];
    expect(call.payload.value).toBe("simple string");
    expect(call.payload._meta).toBeDefined();
  });

  it("should generate ISO timestamp for publishedAt", async () => {
    const publishEvent = createPublishEvent(context, mockBus);
    const event = new TestEvent({ id: "test-1", value: 42 });

    const beforePublish = new Date();
    await publishEvent(event);
    const afterPublish = new Date();

    const meta = event.getMeta();
    const publishedAt = new Date(meta!.publishedAt);

    expect(publishedAt.getTime()).toBeGreaterThanOrEqual(beforePublish.getTime());
    expect(publishedAt.getTime()).toBeLessThanOrEqual(afterPublish.getTime());
  });

  it("should allow multiple events to be published from same context", async () => {
    const publishEvent = createPublishEvent(context, mockBus);

    const event1 = new TestEvent({ id: "test-1", value: 1 });
    await publishEvent(event1);
    
    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const event2 = new TestEvent({ id: "test-2", value: 2 });
    await publishEvent(event2);

    expect(sendEventMock).toHaveBeenCalledTimes(2);

    // Both events should have the same correlationId
    expect(event1.getMeta()?.correlationId).toBe("corr-123");
    expect(event2.getMeta()?.correlationId).toBe("corr-123");

    // But different timestamps
    expect(event1.getMeta()?.publishedAt).not.toBe(
      event2.getMeta()?.publishedAt
    );
  });
});

describe("Integration with handlers", () => {
  it("should work in a command handler context", async () => {
    const sendEventMock = mock(async () => {});
    const mockBus = { sendEvent: sendEventMock } as any;

    const publishEvent = createPublishEvent(
      {
        namespace: "Order.Management",
        correlationId: "order-corr-123",
        handlerType: "command",
        handlerName: "placeOrder",
      },
      mockBus
    );

    // Simulate command handler
    const commandHandler = async (payload: any) => {
      const event = new TestEvent({ id: payload.orderId, value: payload.amount });
      await publishEvent(event);
      return { success: true };
    };

    await commandHandler({ orderId: "order-123", amount: 100 });

    expect(sendEventMock).toHaveBeenCalledTimes(1);
    const call = sendEventMock.mock.calls[0][0];
    expect(call.namespace).toBe("Order.Management");
    expect(call.payload._meta.handlerType).toBe("command");
  });

  it("should work in a saga handler context", async () => {
    const sendEventMock = mock(async () => {});
    const mockBus = { sendEvent: sendEventMock } as any;

    const publishEvent = createPublishEvent(
      {
        namespace: "Inventory.Management",
        correlationId: "saga-corr-456",
        handlerType: "eventListener",
        handlerName: "Order.OrderCreatedEvent",
      },
      mockBus
    );

    // Simulate saga handler
    const sagaHandler = async (payload: any) => {
      await publishEvent({
        name: "InventoryReservedEvent",
        data: { orderId: payload.orderId, items: payload.items },
      });
    };

    await sagaHandler({ orderId: "order-123", items: ["item-1", "item-2"] });

    expect(sendEventMock).toHaveBeenCalledTimes(1);
    const call = sendEventMock.mock.calls[0][0];
    expect(call.payload._meta.handlerType).toBe("eventListener");
    expect(call.payload._meta.handlerName).toBe("Order.OrderCreatedEvent");
  });
});
