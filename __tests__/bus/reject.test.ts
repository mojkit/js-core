import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  WaveError,
  createReject,
  type RejectContext,
  type WaveErrorMeta,
} from "../../bus/errors";
import type { WaveTransport } from "@mojkit/bus-rabbitmq";

// ============================================================================
// Test Error Classes
// ============================================================================

class TestError extends WaveError {
  constructor(data: { id: string; value: number }) {
    super("TEST_ERROR", "Test error message", data);
  }
}

class TestErrorWithFrontEndData extends WaveError {
  constructor(
    data: { id: string },
    frontEndData: { message: string }
  ) {
    super("TEST_ERROR_WITH_FRONTEND", "Test error with frontend data", data, frontEndData);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("WaveError", () => {
  it("should create an error with errorCode, message, and data", () => {
    const error = new TestError({ id: "test-1", value: 42 });

    expect(error.errorCode).toBe("TEST_ERROR");
    expect(error.message).toBe("Test error message");
    expect(error.data).toEqual({ id: "test-1", value: 42 });
  });

  it("should extend SerializableError", () => {
    const error = new TestError({ id: "test-1", value: 42 });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("TEST_ERROR");
  });

  it("should have undefined _meta before rejection", () => {
    const error = new TestError({ id: "test-1", value: 42 });

    expect(error.getMeta()).toBeUndefined();
    expect(error._meta).toBeUndefined();
  });

  it("should support frontEndData", () => {
    const error = new TestErrorWithFrontEndData(
      { id: "test-1" },
      { message: "Hello" }
    );

    expect(error.frontEndData).toEqual({ message: "Hello" });
  });

  it("should support busOptions", () => {
    class ErrorWithOptions extends WaveError {
      constructor(data: any) {
        super("ERROR_WITH_OPTIONS", "Error with options", data, undefined, { priority: "high" });
      }
    }

    const error = new ErrorWithOptions({ id: "test-1" });
    expect(error.busOptions).toEqual({ priority: "high" });
  });
});

describe("createReject", () => {
  let mockBus: WaveTransport;
  let sendEventMock: ReturnType<typeof mock>;
  let context: RejectContext;

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

  it("should create a reject function", () => {
    const reject = createReject(context, mockBus);

    expect(typeof reject).toBe("function");
  });

  it("should publish error event and throw for class-based errors", async () => {
    const reject = createReject(context, mockBus);
    const error = new TestError({ id: "test-1", value: 42 });

    await expect(reject(error)).rejects.toThrow();

    expect(sendEventMock).toHaveBeenCalledTimes(1);
    const call = sendEventMock.mock.calls[0][0];

    expect(call.kind).toBe("event");
    expect(call.namespace).toBe("Test.Domain");
    expect(call.name).toBe("testCommandErrorEvent");
    expect(call.payload.errorCode).toBe("TEST_ERROR");
    expect(call.payload.message).toBe("Test error message");
    expect(call.payload.data).toEqual({ id: "test-1", value: 42 });
    expect(call.context.correlationId).toBe("corr-123");
  });

  it("should publish error event and throw for plain object errors", async () => {
    const reject = createReject(context, mockBus);

    await expect(
      reject({
        errorCode: "PLAIN_ERROR",
        message: "Plain error message",
        data: { id: "test-1", status: "failed" },
      })
    ).rejects.toThrow();

    expect(sendEventMock).toHaveBeenCalledTimes(1);
    const call = sendEventMock.mock.calls[0][0];

    expect(call.kind).toBe("event");
    expect(call.namespace).toBe("Test.Domain");
    expect(call.name).toBe("testCommandErrorEvent");
    expect(call.payload.errorCode).toBe("PLAIN_ERROR");
    expect(call.payload.message).toBe("Plain error message");
  });

  it("should auto-populate _meta for class-based errors", async () => {
    const reject = createReject(context, mockBus);
    const error = new TestError({ id: "test-1", value: 42 });

    expect(error.getMeta()).toBeUndefined();

    try {
      await reject(error);
    } catch (e) {
      // Expected to throw
    }

    const meta = error.getMeta();
    expect(meta).toBeDefined();
    expect(meta?.namespace).toBe("Test.Domain");
    expect(meta?.correlationId).toBe("corr-123");
    expect(meta?.handlerType).toBe("command");
    expect(meta?.handlerName).toBe("testCommand");
    expect(meta?.rejectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  });

  it("should auto-populate _meta for plain object errors", async () => {
    const reject = createReject(context, mockBus);
    const error = {
      errorCode: "PLAIN_ERROR",
      message: "Plain error message",
      data: { id: "test-1" },
    };

    try {
      await reject(error);
    } catch (e) {
      // Expected to throw
    }

    expect(error._meta).toBeDefined();
    expect(error._meta?.namespace).toBe("Test.Domain");
    expect(error._meta?.correlationId).toBe("corr-123");
    expect(error._meta?.handlerType).toBe("command");
    expect(error._meta?.handlerName).toBe("testCommand");
  });

  it("should include _meta in the payload sent to bus", async () => {
    const reject = createReject(context, mockBus);
    const error = new TestError({ id: "test-1", value: 42 });

    try {
      await reject(error);
    } catch (e) {
      // Expected
    }

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

    const reject = createReject(customContext, mockBus);
    const error = new TestError({ id: "test-1", value: 42 });

    try {
      await reject(error);
    } catch (e) {
      // Expected
    }

    const meta = error.getMeta();
    expect(meta?.correlationId).toBe("custom-corr-456");

    const call = sendEventMock.mock.calls[0][0];
    expect(call.context.correlationId).toBe("custom-corr-456");
  });

  it("should handle different handler types", async () => {
    const sagaContext: RejectContext = {
      namespace: "Test.Domain",
      correlationId: "corr-123",
      handlerType: "saga",
      handlerName: "testSaga",
    };

    const reject = createReject(sagaContext, mockBus);
    const error = new TestError({ id: "test-1", value: 42 });

    try {
      await reject(error);
    } catch (e) {
      // Expected
    }

    const meta = error.getMeta();
    expect(meta?.handlerType).toBe("saga");
    expect(meta?.handlerName).toBe("testSaga");
  });

  it("should handle eventListener handler type", async () => {
    const listenerContext: RejectContext = {
      namespace: "Test.Domain",
      correlationId: "corr-123",
      handlerType: "eventListener",
      handlerName: "Order.OrderCreatedEvent",
    };

    const reject = createReject(listenerContext, mockBus);
    const error = new TestError({ id: "test-1", value: 42 });

    try {
      await reject(error);
    } catch (e) {
      // Expected
    }

    const meta = error.getMeta();
    expect(meta?.handlerType).toBe("eventListener");
    expect(meta?.handlerName).toBe("Order.OrderCreatedEvent");
  });

  it("should include frontEndData in context", async () => {
    const reject = createReject(context, mockBus);
    const error = new TestErrorWithFrontEndData(
      { id: "test-1" },
      { message: "Hello" }
    );

    try {
      await reject(error);
    } catch (e) {
      // Expected
    }

    const call = sendEventMock.mock.calls[0][0];
    expect(call.context.frontEndData).toEqual({ message: "Hello" });
  });

  it("should merge busOptions into sendEvent call", async () => {
    class ErrorWithOptions extends WaveError {
      constructor(data: any) {
        super("ERROR_WITH_OPTIONS", "Error with options", data, undefined, {
          priority: "high",
          ttl: 5000,
        });
      }
    }

    const reject = createReject(context, mockBus);
    const error = new ErrorWithOptions({ id: "test-1" });

    try {
      await reject(error);
    } catch (e) {
      // Expected
    }

    const call = sendEventMock.mock.calls[0][0];
    expect(call.priority).toBe("high");
    expect(call.ttl).toBe(5000);
  });

  it("should throw error for invalid error format", async () => {
    const reject = createReject(context, mockBus);

    // Invalid error (missing 'errorCode' or 'message')
    const invalidError = { data: { id: "test-1" } } as any;

    await expect(reject(invalidError)).rejects.toThrow(
      "Invalid error format"
    );
  });

  it("should generate ISO timestamp for rejectedAt", async () => {
    const reject = createReject(context, mockBus);
    const error = new TestError({ id: "test-1", value: 42 });

    const beforeReject = new Date();
    try {
      await reject(error);
    } catch (e) {
      // Expected
    }
    const afterReject = new Date();

    const meta = error.getMeta();
    const rejectedAt = new Date(meta!.rejectedAt);

    expect(rejectedAt.getTime()).toBeGreaterThanOrEqual(beforeReject.getTime());
    expect(rejectedAt.getTime()).toBeLessThanOrEqual(afterReject.getTime());
  });

  it("should generate error event name as ${handlerName}ErrorEvent", async () => {
    const reject = createReject(context, mockBus);
    const error = new TestError({ id: "test-1", value: 42 });

    try {
      await reject(error);
    } catch (e) {
      // Expected
    }

    const call = sendEventMock.mock.calls[0][0];
    expect(call.name).toBe("testCommandErrorEvent");
  });

  it("should always throw after publishing", async () => {
    const reject = createReject(context, mockBus);
    const error = new TestError({ id: "test-1", value: 42 });

    let didThrow = false;
    try {
      await reject(error);
    } catch (e) {
      didThrow = true;
      expect(e).toBeInstanceOf(WaveError);
    }

    expect(didThrow).toBe(true);
  });

  it("should throw WaveError instance for class-based errors", async () => {
    const reject = createReject(context, mockBus);
    const error = new TestError({ id: "test-1", value: 42 });

    try {
      await reject(error);
    } catch (e) {
      expect(e).toBe(error); // Same instance
      expect(e).toBeInstanceOf(TestError);
    }
  });

  it("should wrap and throw plain object errors as WaveError", async () => {
    const reject = createReject(context, mockBus);

    try {
      await reject({
        errorCode: "PLAIN_ERROR",
        message: "Plain error message",
        data: { id: "test-1" },
      });
    } catch (e) {
      expect(e).toBeInstanceOf(WaveError);
      expect((e as WaveError).errorCode).toBe("PLAIN_ERROR");
      expect((e as WaveError).message).toBe("Plain error message");
    }
  });

  it("should handle errors without data field", async () => {
    const reject = createReject(context, mockBus);

    try {
      await reject({
        errorCode: "SIMPLE_ERROR",
        message: "Simple error without data",
      });
    } catch (e) {
      // Expected
    }

    const call = sendEventMock.mock.calls[0][0];
    expect(call.payload.errorCode).toBe("SIMPLE_ERROR");
    expect(call.payload.data).toBeUndefined();
  });

  it("should continue throwing even if event publishing fails", async () => {
    const failingBus = {
      sendEvent: mock(async () => {
        throw new Error("Bus failure");
      }),
    } as any;

    const reject = createReject(context, failingBus);
    const error = new TestError({ id: "test-1", value: 42 });

    // Should still throw the original error even if publishing fails
    await expect(reject(error)).rejects.toThrow("Test error message");
  });
});

describe("Error event structure", () => {
  it("should have correct event structure for command errors", async () => {
    const sendEventMock = mock(async () => {});
    const mockBus = { sendEvent: sendEventMock } as any;

    const reject = createReject(
      {
        namespace: "Order.Management",
        correlationId: "order-corr-123",
        handlerType: "command",
        handlerName: "placeOrder",
      },
      mockBus
    );

    try {
      await reject(new TestError({ id: "order-123", value: 100 }));
    } catch (e) {
      // Expected
    }

    const call = sendEventMock.mock.calls[0][0];
    expect(call.namespace).toBe("Order.Management");
    expect(call.name).toBe("placeOrderErrorEvent");
    expect(call.payload._meta.handlerType).toBe("command");
    expect(call.payload._meta.handlerName).toBe("placeOrder");
  });

  it("should have correct event structure for saga errors", async () => {
    const sendEventMock = mock(async () => {});
    const mockBus = { sendEvent: sendEventMock } as any;

    const reject = createReject(
      {
        namespace: "Inventory.Management",
        correlationId: "saga-corr-456",
        handlerType: "eventListener",
        handlerName: "Order.OrderCreatedEvent",
      },
      mockBus
    );

    try {
      await reject({
        errorCode: "INVENTORY_CHECK_FAILED",
        message: "Failed to check inventory",
        data: { orderId: "order-123" },
      });
    } catch (e) {
      // Expected
    }

    const call = sendEventMock.mock.calls[0][0];
    expect(call.name).toBe("Order.OrderCreatedEventErrorEvent");
    expect(call.payload._meta.handlerType).toBe("eventListener");
  });
});
