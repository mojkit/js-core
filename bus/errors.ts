/**
 * Base class for serializable domain errors.
 * 
 * Domain errors that extend this class will be automatically transformed
 * into a wire-compatible format by the bus listener layer before being
 * sent across service boundaries.
 * 
 * @example
 * ```typescript
 * class ValidationError extends SerializableError {
 *   constructor(message: string, field: string) {
 *     super(message, 'VALIDATION_ERROR');
 *     this.context = { field };
 *   }
 * }
 * ```
 */
export class SerializableError extends Error {
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
 * Error thrown when a remote service returns an error response.
 * 
 * This error is reconstructed on the client side when receiving
 * an error response from an RPC call.
 */
export class RemoteServiceError extends Error {
  public readonly type: string;
  public readonly code?: string;
  public readonly context?: Record<string, any>;
  public readonly remoteStack?: string;

  constructor(errorResponse: {
    type: string;
    message: string;
    code?: string;
    context?: Record<string, any>;
    stack?: string;
  }) {
    super(errorResponse.message);
    this.name = 'RemoteServiceError';
    this.type = errorResponse.type;
    this.code = errorResponse.code;
    this.context = errorResponse.context;
    this.remoteStack = errorResponse.stack;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Re-export WaveError types
export * from './errors/WaveError';
export * from './errors/createReject';
