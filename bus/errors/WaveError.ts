/**
 * @file WaveError.ts - Base class and types for Wave domain errors.
 *
 * This module provides the foundation for rejecting handlers with structured errors.
 * Errors can be either class-based (extending WaveError) or plain objects.
 */

/**
 * Metadata automatically populated by reject.
 * This metadata tracks the origin and context of the error.
 */
export interface WaveErrorMeta {
  /** The namespace of the handler that rejected with this error */
  namespace: string;

  /** Correlation ID for tracing related errors across services */
  correlationId: string;

  /** Type of handler that rejected */
  handlerType: 'command' | 'saga' | 'eventListener';

  /** Name of the handler that rejected */
  handlerName: string;

  /** ISO timestamp when the error was rejected */
  rejectedAt: string;
}

/**
 * Base class for serializable domain errors.
 * Copied from SerializableError to avoid circular dependency.
 */
class SerializableError extends Error {
  public readonly code?: string;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    code?: string,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts this error into a wire-compatible format.
   */
  toWireFormat(): {
    type: string;
    message: string;
    code?: string;
    context?: Record<string, any>;
    stack?: string;
  } {
    return {
      type: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    };
  }
}

/**
 * Base class for domain errors that can be rejected from handlers.
 *
 * Extend this class to create type-safe, IDE-friendly domain errors.
 * When rejected, these errors are published as error events before being thrown.
 *
 * @example
 * ```typescript
 * class InsufficientInventoryError extends WaveError {
 *   constructor(data: { orderId: string; requestedQty: number; availableQty: number }) {
 *     super(
 *       'INSUFFICIENT_INVENTORY',
 *       'Not enough inventory to fulfill order',
 *       data
 *     );
 *   }
 * }
 *
 * // In a handler:
 * await context.reject(new InsufficientInventoryError({ orderId: '123', requestedQty: 10, availableQty: 5 }));
 * ```
 */
export class WaveError extends SerializableError {
  /** Business error code (e.g., 'INSUFFICIENT_INVENTORY') */
  public readonly errorCode: string;

  /** Error-specific data */
  public readonly data?: unknown;

  /** Optional frontend-specific data */
  public readonly frontEndData?: unknown;

  /** Optional bus-level options */
  public readonly busOptions?: Record<string, any>;

  /** Internal metadata (populated by reject) */
  public _meta?: WaveErrorMeta;

  constructor(
    errorCode: string,
    message: string,
    data?: unknown,
    frontEndData?: unknown,
    busOptions?: Record<string, any>
  ) {
    super(message, errorCode, typeof data === 'object' && data !== null ? data as Record<string, any> : { value: data });
    this.errorCode = errorCode;
    this.data = data;
    this.frontEndData = frontEndData;
    this.busOptions = busOptions;
  }

  /**
   * Get the metadata populated by reject.
   * Returns undefined if the error hasn't been rejected yet.
   */
  getMeta(): WaveErrorMeta | undefined {
    return this._meta;
  }
}

/**
 * Plain object representation of a Wave error.
 * Use this for simpler scenarios where class-based errors are overkill.
 *
 * @example
 * ```typescript
 * await context.reject({
 *   errorCode: 'PAYMENT_DECLINED',
 *   message: 'Payment was declined by the processor',
 *   data: { orderId: '123', reason: 'insufficient_funds' }
 * });
 * ```
 */
export interface PlainWaveError {
  /** Business error code */
  errorCode: string;

  /** Human-readable error message */
  message: string;

  /** Error-specific data */
  data?: unknown;

  /** Optional frontend-specific data */
  frontEndData?: unknown;

  /** Optional bus-level options */
  busOptions?: Record<string, any>;

  /** Internal metadata (populated by reject) */
  _meta?: WaveErrorMeta;
}

/**
 * Union type for all rejectable error formats.
 */
export type RejectableError = WaveError | PlainWaveError;

/**
 * Type guard to check if an error is class-based.
 */
export function isWaveErrorInstance(error: RejectableError): error is WaveError {
  return error instanceof WaveError;
}

/**
 * Type guard to check if an error is a plain object.
 */
export function isPlainWaveError(error: RejectableError): error is PlainWaveError {
  return !isWaveErrorInstance(error) && 'errorCode' in error && 'message' in error;
}
