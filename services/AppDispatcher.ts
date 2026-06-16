import app, { setDispatcher, type DispatchObject } from "@wave/app-service";
import { Config } from "../config";
import { Bus } from "../bus";

/**
 * AppDispatcher class configures the dispatcher for @wave/app-service
 * and provides a configured app instance.
 */
export class AppDispatcher {
  private static instance: AppDispatcher | null = null;
  private static initialized = false;

  private constructor() {}

  /**
   * Get the singleton instance of AppDispatcher.
   */
  static getInstance(): AppDispatcher {
    if (!AppDispatcher.instance) {
      AppDispatcher.instance = new AppDispatcher();
    }
    return AppDispatcher.instance;
  }

  /**
   * Initializes the dispatcher with custom logic based on Wave configuration.
   * This should be called once during application startup.
   */
  static initialize(): void {
    if (this.initialized) {
      return;
    }

    setDispatcher(this.dispatch.bind(this));
    this.initialized = true;
  }

  /**
   * Get the configured app instance.
   * This provides access to the app proxy for making command and query calls.
   * 
   * @returns The app instance from @wave/app-service
   */
  getApp() {
    return app;
  }

  /**
   * Custom dispatcher logic that routes commands/queries based on namespace.
   *
   * @param obj - The command or query object to dispatch
   * @returns Promise resolving to the dispatch result
   */
  private static async dispatch(obj: DispatchObject): Promise<any> {
    if (!obj) return;
    const config = Config.getInstance().get();
    const { namespace } = obj;

    // Check if namespace exists in configured domains
    if (namespace in config.domains) {
      // Placeholder for future implementation
      // This block will handle local domain dispatch
    } else {
      // Send RabbitMQ message for external domains
      const bus = Bus.getInstance().get();

     if (obj.kind === 'query') {
       // Transform QueryObject to bus-rabbitmq query format
       return await bus.sendQuery(
         {
           kind: 'query',
           namespace: obj.namespace,
            name: obj.name,
           payload: obj.payload,
         },
         { timeoutMs: 5000 }
       );
      } else if (obj.kind === 'command') {
        // Transform CommandObject to bus-rabbitmq command format
        return await bus.sendCommand(
          {
            id: obj.id,
            kind: 'command',
            namespace: obj.namespace,
            name: obj.name,
            payload: obj.payload,
            context: {
              aggregateId: obj.options.aggregateId,
              events: obj.options.events,
            },
            // Enable RPC response when events are awaited or listeners are registered
            awaitResponse: (obj.options.events && obj.options.events.length > 0) ||
                          (obj.options.listeners && obj.options.listeners.length > 0),
          }
        );
      }
    }
  }

  /**
   * Reset the singleton instance (useful for testing).
   */
  static reset(): void {
    AppDispatcher.instance = null;
    AppDispatcher.initialized = false;
  }
}

// Export the configured app instance for convenience
export { app };

/**
 * Get the singleton AppDispatcher instance.
 * This is a convenience export that always returns the current singleton instance.
 */
export function getAppDispatcher(): AppDispatcher {
  return AppDispatcher.getInstance();
}
