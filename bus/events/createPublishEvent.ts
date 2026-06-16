/**
 * @file createPublishEvent.ts - Factory for creating publishEvent functions.
 *
 * This module provides the factory that creates bound publishEvent functions
 * for each handler invocation, automatically populating metadata.
 */

import { randomUUID } from 'crypto';
import type { WaveTransport } from '@wave/bus-rabbitmq';
import type {
  PublishableEvent,
  WaveEventMeta,
  WaveEvent,
  PlainWaveEvent,
} from './WaveEvent';
import { isWaveEventInstance, isPlainWaveEvent } from './WaveEvent';

/**
 * Context information bound to a publishEvent function.
 * This context is captured at handler invocation time.
 */
export interface PublishEventContext {
  /** Namespace of the handler publishing the event */
  namespace: string;

  /** Correlation ID for tracing */
  correlationId: string;

  /** Type of handler */
  handlerType: 'command' | 'saga' | 'eventListener';

  /** Name of the handler */
  handlerName: string;
}

/**
 * RPC context for routing events to reply queues.
 * When present, publishEvent will send matching events to the reply queue
 * in addition to normal event bus routing.
 */
export interface RPCContext {
  /** Unique message ID for this RPC call */
  messageId: string;

  /** List of event names that should be sent to the reply queue */
  awaitedEvents: string[];

  /** Name of the reply queue to send RPC responses to */
  replyQueue: string;
}

/**
 * Function type for publishing events from handlers.
 */
export type PublishEventFunction = (event: PublishableEvent) => Promise<void>;

/**
 * Create a publishEvent function bound to a specific handler context.
 *
 * The returned function automatically populates _meta with namespace,
 * correlationId, handlerType, handlerName, and publishedAt timestamp.
 * If an RPCContext is provided, matching events are also sent to the reply queue.
 *
 * @param context - Handler context (namespace, correlationId, etc.)
 * @param bus - Wave transport instance for sending events
 * @param rpcContext - Optional RPC context for reply queue routing
 * @returns A bound publishEvent function
 *
 * @example
 * ```typescript
 * const publishEvent = createPublishEvent(
 *   {
 *     namespace: 'Order.Management',
 *     correlationId: 'abc-123',
 *     handlerType: 'command',
 *     handlerName: 'PlaceOrder'
 *   },
 *   bus
 * );
 *
 * await publishEvent(new OrderCreatedEvent({ orderId: '123' }));
 * ```
 */
export function createPublishEvent(
  context: PublishEventContext,
  bus: WaveTransport,
  rpcContext?: RPCContext
): PublishEventFunction {
  return async (event: PublishableEvent): Promise<void> => {
    // Extract event name and payload based on event type
    let eventName: string;
    let payload: unknown;
    let frontEndData: unknown | undefined;
    let busOptions: Record<string, any> | undefined;

    if (isWaveEventInstance(event)) {
      // Class-based event
      eventName = event.eventName;
      payload = event.payload;
      frontEndData = event.frontEndData;
      busOptions = event.busOptions;
    } else if (isPlainWaveEvent(event)) {
      // Plain object event
      eventName = event.name;
      payload = event.data;
      frontEndData = event.frontEndData;
      busOptions = event.busOptions;
    } else {
      throw new Error(
        'Invalid event format. Event must be a WaveEvent instance or a plain object with "name" and "data" fields.'
      );
    }

    // Create metadata
    const meta: WaveEventMeta = {
      namespace: context.namespace,
      correlationId: context.correlationId,
      handlerType: context.handlerType,
      handlerName: context.handlerName,
      publishedAt: new Date().toISOString(),
    };

    // Attach metadata to the event (for read-only access)
    if (isWaveEventInstance(event)) {
      event._meta = meta;
    } else {
      (event as PlainWaveEvent)._meta = meta;
    }

    // Prepare the payload with metadata
    const payloadWithMeta = {
      ...(typeof payload === 'object' && payload !== null ? payload : { value: payload }),
      _meta: meta,
    };

    // If RPC context is present and this event is awaited, send to reply queue
    if (rpcContext && rpcContext.awaitedEvents.includes(eventName)) {
      await bus.sendToReplyQueue(rpcContext.replyQueue, {
        type: 'event',
        messageId: rpcContext.messageId,
        eventName,
        payload: payloadWithMeta,
      });
    }

    // Send the event via the bus
    await bus.sendEvent({
      kind: 'event',
      namespace: context.namespace,
      name: eventName,
      payload: payloadWithMeta,
      context: {
        correlationId: context.correlationId,
        ...(frontEndData ? { frontEndData } : {}),
      },
      ...(busOptions || {}),
    });
  };
}
