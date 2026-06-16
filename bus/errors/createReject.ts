/**
 * @file createReject.ts - Factory for creating reject functions.
 *
 * This module provides the factory that creates bound reject functions
 * for each handler invocation, automatically populating metadata and
 * publishing error events before throwing.
 */

import type { WaveTransport } from '@wave/bus-rabbitmq';
import type {
  RejectableError,
  WaveErrorMeta,
  PlainWaveError,
} from './WaveError';
import { WaveError, isWaveErrorInstance, isPlainWaveError } from './WaveError';

import type { RPCContext } from '../events/createPublishEvent';

/**
 * Context information bound to a reject function.
 * This context is captured at handler invocation time.
 */
export interface RejectContext {
  /** Namespace of the handler rejecting */
  namespace: string;

  /** Correlation ID for tracing */
  correlationId: string;

  /** Type of handler */
  handlerType: 'command' | 'saga' | 'eventListener';

  /** Name of the handler */
  handlerName: string;
}

/**
 * Function type for rejecting from handlers.
 * Always throws after publishing the error event.
 */
export type RejectFunction = (error: RejectableError) => Promise<never>;

/**
 * Create a reject function bound to a specific handler context.
 *
 * The returned function automatically:
 * 1. Populates _meta with namespace, correlationId, handlerType, handlerName, rejectedAt
 * 2. Publishes an error event (e.g., PlaceOrderErrorEvent) and sends to reply queue if RPC context present
 * 3. Throws the error
 *
 * @param context - Handler context (namespace, correlationId, etc.)
 * @param bus - Wave transport instance for sending error events
 * @param rpcContext - Optional RPC context for reply queue routing
 * @returns A bound reject function
 *
 * @example
 * ```typescript
 * const reject = createReject(
 *   {
 *     namespace: 'Order.Management',
 *     correlationId: 'abc-123',
 *     handlerType: 'command',
 *     handlerName: 'PlaceOrder'
 *   },
 *   bus
 * );
 *
 * await reject(new InsufficientInventoryError({ orderId: '123' }));
 * // Publishes "PlaceOrderErrorEvent" and throws
 * ```
 */
export function createReject(
  context: RejectContext,
  bus: WaveTransport,
  rpcContext?: RPCContext
): RejectFunction {
  return async (error: RejectableError): Promise<never> => {
    // Extract error properties based on error type
    let errorCode: string;
    let message: string;
    let data: unknown | undefined;
    let frontEndData: unknown | undefined;
    let busOptions: Record<string, any> | undefined;

    if (isWaveErrorInstance(error)) {
      // Class-based error
      errorCode = error.errorCode;
      message = error.message;
      data = error.data;
      frontEndData = error.frontEndData;
      busOptions = error.busOptions;
    } else if (isPlainWaveError(error)) {
      // Plain object error
      errorCode = error.errorCode;
      message = error.message;
      data = error.data;
      frontEndData = error.frontEndData;
      busOptions = error.busOptions;
    } else {
      throw new Error(
        'Invalid error format. Error must be a WaveError instance or a plain object with "errorCode" and "message" fields.'
      );
    }

    // Create metadata
    const meta: WaveErrorMeta = {
      namespace: context.namespace,
      correlationId: context.correlationId,
      handlerType: context.handlerType,
      handlerName: context.handlerName,
      rejectedAt: new Date().toISOString(),
    };

    // Attach metadata to the error (for read-only access)
    if (isWaveErrorInstance(error)) {
      error._meta = meta;
    } else {
      (error as PlainWaveError)._meta = meta;
    }

    // Determine error event name based on handler type
    // Pattern: ${handlerName}ErrorEvent
    const errorEventName = `${context.handlerName}ErrorEvent`;

    // Prepare the error payload with metadata
    const errorPayload = {
      errorCode,
      message,
      ...(data !== undefined && { data }),
      _meta: meta,
    };

    // If RPC context is present, send error response to reply queue
    if (rpcContext) {
      await bus.sendToReplyQueue(rpcContext.replyQueue, {
        type: 'error',
        messageId: rpcContext.messageId,
        error: {
          errorCode,
          message,
          data,
        },
      });
    }

    // Publish error event via the bus
    try {
      await bus.sendEvent({
        kind: 'event',
        namespace: context.namespace,
        name: errorEventName,
        payload: errorPayload,
        context: {
          correlationId: context.correlationId,
          ...(frontEndData ? { frontEndData } : {}),
        },
        ...(busOptions || {}),
      });
    } catch (publishError) {
      // Log but don't fail if event publishing fails
      console.error('Failed to publish error event:', publishError);
    }

    // Always throw the error after publishing
    if (isWaveErrorInstance(error)) {
      throw error;
    } else {
      // Wrap plain object in WaveError for consistent error handling
      const wrappedError = new (class extends WaveError {
        constructor() {
          super(errorCode, message, data, frontEndData, busOptions);
          this._meta = meta;
        }
      })();
      throw wrappedError;
    }
  };
}
