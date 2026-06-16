import type { HandlerContext } from "../types";
import type {
  CommandHandler,
  QueryHandler,
  SagaHandler,
} from "../../config/types";

/**
 * Service responsible for invoking different types of handlers
 * (function-based, class-based, or instance-based).
 */
export class HandlerInvoker {
  /**
   * Invoke a handler regardless of whether it is a plain function or a
   * class instance / class constructor that exposes a handler method.
   */
  async invoke(
    handler: CommandHandler | QueryHandler | SagaHandler,
    message: any,
    context: HandlerContext,
    isQuery: boolean = false,
  ): Promise<any> {
    const { firstArg, chainedMethods } = this.extractQueryParams(
      message,
      isQuery,
    );

    const enrichedContext = this.enrichContext(context, chainedMethods);

    console.log({
      invokeHandler: { firstArg, chainedMethods, handlerType: typeof handler },
    });

    return this.executeHandler(handler, message, enrichedContext, isQuery, firstArg);
  }

  /**
   * Extract first argument and chained methods for query handlers.
   */
  private extractQueryParams(
    message: any,
    isQuery: boolean,
  ): { firstArg: any; chainedMethods: Array<{ method: string; args?: any[] }> } {
    if (!isQuery || !message.methods) {
      return { firstArg: undefined, chainedMethods: [] };
    }

    const firstArg = message.methods[0]?.args?.[0];
    const chainedMethods = message.methods.slice(1);

    return { firstArg, chainedMethods };
  }

  /**
   * Enrich context with chained methods for query handlers.
   */
  private enrichContext(
    context: HandlerContext,
    chainedMethods: Array<{ method: string; args?: any[] }>,
  ): HandlerContext {
    if (chainedMethods.length === 0) {
      return context;
    }

    return { ...context, methods: chainedMethods };
  }

  /**
   * Execute the handler based on its type (function, class, or instance).
   */
  private async executeHandler(
    handler: any,
    message: any,
    context: HandlerContext,
    isQuery: boolean,
    firstArg: any,
  ): Promise<any> {
    console.log('executeHandler', { handler, message, context, isQuery, firstArg });
    if (typeof handler !== "function" || handler === null) {
      throw new Error(`Invalid handler type: ${typeof handler}`);
    }

    // Check if handler is an instance with a handler method
    if (typeof handler.handler === "function") {
      return this.invokeInstanceHandler(handler, message, context, isQuery, firstArg);
    }

    // Check if handler is a class constructor
    if (this.isClassConstructor(handler)) {
      return this.invokeClassHandler(handler, message, context, isQuery, firstArg);
    }

    // Plain function handler
    return this.invokeFunctionHandler(handler, message, context, isQuery, firstArg);
  }

  /**
   * Check if a handler is a class constructor.
   */
  private isClassConstructor(handler: any): boolean {
    return typeof handler === "function" && handler.prototype !== undefined;
  }

  /**
   * Invoke an instance-based handler (object with handler method).
   */
  private async invokeInstanceHandler(
    instance: any,
    message: any,
    context: HandlerContext,
    isQuery: boolean,
    firstArg: any,
  ): Promise<any> {
    const arg = isQuery ? firstArg : message;
    return instance.handler(arg, context);
  }

  /**
   * Invoke a class-based handler (instantiate and call method).
   */
  private async invokeClassHandler(
    HandlerClass: any,
    message: any,
    context: HandlerContext,
    isQuery: boolean,
    firstArg: any,
  ): Promise<any> {
    console.log('invoke class handler')
    const instance = new HandlerClass();

    // Assign app to the instance for class-based handlers
    if (context.app) {
      instance.app = context.app;
    }

    if (isQuery) {
      return this.invokeQueryMethod(instance, message, context, firstArg);
    }

    if (typeof instance.handler !== "function") {
      throw new Error(
        `Handler class must implement a 'handler' method or the specified query method`,
      );
    }

    return instance.handler(message, context);
  }

  /**
   * Invoke a query method on a class instance.
   */
  private async invokeQueryMethod(
    instance: any,
    message: any,
    context: HandlerContext,
    firstArg: any,
  ): Promise<any> {
    const methodName = message.methods?.[0]?.method || "handle";

    if (typeof instance[methodName] !== "function") {
      throw new Error(
        `Query handler method '${methodName}' not found on class`,
      );
    }
    message.methods.shift()
    context.methods = message.methods
    return instance[methodName](firstArg, context);
  }

  /**
   * Invoke a plain function handler.
   */
  private async invokeFunctionHandler(
    handler: Function,
    message: any,
    context: HandlerContext,
    isQuery: boolean,
    firstArg: any,
  ): Promise<any> {
    const arg = isQuery ? firstArg : message;
    return handler(arg, context);
  }
}
