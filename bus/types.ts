import type { ExecutionContext } from "@mojkit/bus-rabbitmq";
import { AppDispatcher } from "../services/AppDispatcher";
import type { PublishEventFunction } from "./events";
import type { RejectFunction } from "./errors/createReject";

/**
 * Context object passed to all handler methods.
 *
 * This context provides access to:
 * - busMessage: The execution context from the message bus (RabbitMQ)
 * - app: The AppDispatcher instance for making cross-domain calls
 * - publishEvent: Function for publishing domain events with auto-populated metadata
 * - reject: Function for rejecting with structured errors (publishes error event + throws)
 */
export interface HandlerContext {
  /**
   * The message context from the bus-triggered event.
   * Provides access to ack(), nack(), and raw message metadata.
   */
  busMessage: ExecutionContext;

  /**
   * The current instance of AppDispatcher.
   * For class-based handlers, this should be assigned to this.app.
   */
  app: AppDispatcher;

  /**
   * Function for publishing domain events.
   * Automatically populates metadata (namespace, correlationId, handlerType, etc.).
   * Supports both class-based events and plain objects.
   */
  publishEvent: PublishEventFunction;

  /**
   * Function for rejecting with structured domain errors.
   * Automatically publishes an error event (e.g., PlaceOrderErrorEvent) with metadata,
   * then throws the error to fail the handler.
   * Supports both class-based errors and plain objects.
   */
  reject: RejectFunction;

  /**
   * Chained methods for query handlers (excludes the first method).
   * Only present for query handlers.
   */
  methods?: Array<{ method: string; args?: any[] }>;
}
