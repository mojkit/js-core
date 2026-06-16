/**
 * @file WaveEvent.ts - Base class and types for Wave domain events.
 *
 * This module provides the foundation for publishing domain events from handlers.
 * Events can be either class-based (extending WaveEvent) or plain objects.
 */

/**
 * Metadata automatically populated by publishEvent.
 * This metadata tracks the origin and context of the event.
 */
export interface WaveEventMeta {
  /** The namespace of the handler that published this event */
  namespace: string;

  /** Correlation ID for tracing related events across services */
  correlationId: string;

  /** Type of handler that published this event */
  handlerType: 'command' | 'saga' | 'eventListener';

  /** Name of the handler that published this event */
  handlerName: string;

  /** ISO timestamp when the event was published */
  publishedAt: string;
}

/**
 * Options for creating a WaveEvent.
 */
export interface WaveEventOptions {
  /** Name of the event (e.g., 'OrderCreatedEvent') */
  eventName: string;

  /** Business payload of the event */
  payload: unknown;

  /** Optional frontend-specific data */
  frontEndData?: unknown;

  /** Optional bus-level options (e.g., routing, priority) */
  busOptions?: Record<string, any>;
}

/**
 * Abstract base class for domain events.
 *
 * Extend this class to create type-safe, IDE-friendly domain events.
 *
 * @example
 * ```typescript
 * class OrderCreatedEvent extends WaveEvent {
 *   constructor(payload: { orderId: string; amount: number }) {
 *     super('OrderCreatedEvent', payload);
 *   }
 * }
 *
 * // In a handler:
 * await publishEvent(new OrderCreatedEvent({ orderId: '123', amount: 100 }));
 * ```
 */
export abstract class WaveEvent {
  /** Name of the event */
  public readonly eventName: string;

  /** Business payload */
  public readonly payload: unknown;

  /** Optional frontend-specific data */
  public readonly frontEndData?: unknown;

  /** Optional bus-level options */
  public readonly busOptions?: Record<string, any>;

  /** Internal metadata (populated by publishEvent) */
  public _meta?: WaveEventMeta;

  constructor(
    eventName: string,
    payload: unknown,
    frontEndData?: unknown,
    busOptions?: Record<string, any>
  ) {
    this.eventName = eventName;
    this.payload = payload;
    this.frontEndData = frontEndData;
    this.busOptions = busOptions;
  }

  /**
   * Get the metadata populated by publishEvent.
   * Returns undefined if the event hasn't been published yet.
   */
  getMeta(): WaveEventMeta | undefined {
    return this._meta;
  }
}

/**
 * Plain object representation of a Wave event.
 * Use this for simpler scenarios where class-based events are overkill.
 *
 * @example
 * ```typescript
 * await publishEvent({
 *   name: 'OrderCancelledEvent',
 *   data: { orderId: '123', reason: 'customer request' }
 * });
 * ```
 */
export interface PlainWaveEvent {
  /** Name of the event */
  name: string;

  /** Business payload */
  data: unknown;

  /** Optional frontend-specific data */
  frontEndData?: unknown;

  /** Optional bus-level options */
  busOptions?: Record<string, any>;

  /** Internal metadata (populated by publishEvent) */
  _meta?: WaveEventMeta;
}

/**
 * Union type for all publishable event formats.
 */
export type PublishableEvent = WaveEvent | PlainWaveEvent;

/**
 * Type guard to check if an event is class-based.
 */
export function isWaveEventInstance(event: PublishableEvent): event is WaveEvent {
  return event instanceof WaveEvent;
}

/**
 * Type guard to check if an event is a plain object.
 */
export function isPlainWaveEvent(event: PublishableEvent): event is PlainWaveEvent {
  return !isWaveEventInstance(event) && 'name' in event && 'data' in event;
}
