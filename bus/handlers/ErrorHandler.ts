import { SerializableError } from "../errors";

/**
 * Service responsible for handling and transforming errors
 * from domain handlers into serializable format.
 */
export class ErrorHandler {
  /**
   * Transform domain errors into serializable format with context.
   */
  transformError(
    error: unknown,
    errorType: "COMMAND" | "QUERY" | "SAGA",
    context: {
      domain: string;
      handlerName: string;
      userId?: string;
    },
  ): SerializableError {
    // Already in correct format
    if (error instanceof SerializableError) {
      return error;
    }

    // Extract error message
    const message = error instanceof Error ? error.message : String(error);

    // Determine error code based on type
    const errorCode = `${errorType}_HANDLER_ERROR`;

    // Build error metadata
    const metadata = {
      domain: context.domain,
      [errorType.toLowerCase()]: context.handlerName,
      ...(context.userId && { userId: context.userId }),
    };

    return new SerializableError(message, errorCode, metadata);
  }

  /**
   * Create a command handler error wrapper.
   */
  wrapCommandError(
    error: unknown,
    domain: string,
    commandName: string,
    userId?: string,
  ): SerializableError {
    return this.transformError(error, "COMMAND", {
      domain,
      handlerName: commandName,
      userId,
    });
  }

  /**
   * Create a query handler error wrapper.
   */
  wrapQueryError(
    error: unknown,
    domain: string,
    queryName: string,
    userId?: string,
  ): SerializableError {
    return this.transformError(error, "QUERY", {
      domain,
      handlerName: queryName,
      userId,
    });
  }

  /**
   * Create a saga handler error wrapper.
   */
  wrapSagaError(
    error: unknown,
    domain: string,
    eventName: string,
    userId?: string,
  ): SerializableError {
    return this.transformError(error, "SAGA", {
      domain,
      handlerName: eventName,
      userId,
    });
  }
}
