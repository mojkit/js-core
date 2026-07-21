import createBus from "@mojkit/bus-rabbitmq";
import type { MojkitTransport } from "@mojkit/bus-rabbitmq";
import type { MessageBusConfig } from "../config/types.ts";
export type { MessageBusConfig } from "../config/types.ts";

export { SerializableError, RemoteServiceError } from "./errors";

/**
 * Singleton Bus manager for the Mojkit framework.
 *
 * Manages the message bus connection and provides access to the transport layer.
 * The bus is initialized once during application startup and reused throughout
 * the application lifecycle.
 */
export class Bus {
  private static instance: Bus | null = null;
  private transport: MojkitTransport | null = null;
  private config: MessageBusConfig | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of Bus.
   */
  static getInstance(): Bus {
    if (!Bus.instance) {
      Bus.instance = new Bus();
    }
    return Bus.instance;
  }

  /**
   * Initialize the bus with the provided configuration.
   * This method should be called once during application startup.
   *
   * @param config - Bus configuration options
   * @returns Promise that resolves when the bus is connected
   */
  async initialize(config: MessageBusConfig): Promise<void> {
    if (this.transport) {
      // Already initialized, check if config changed
      if (
        this.config?.url === config.url &&
        this.config?.prefetchCount === config.prefetchCount
      ) {
        return; // Same config, no need to reinitialize
      }
      // Config changed, disconnect and reinitialize
      await this.disconnect();
    }

    this.config = config;

    // Dynamically import to avoid loading the module during tests
    // const { default: createBus } = await import("@mojkit/bus-rabbitmq");
    this.transport = createBus({
      url: config.url,
      prefetchCount: config.prefetchCount,
    });

    await this.transport.ensureConnected();
  }

  /**
   * Get the transport instance.
   * Throws an error if the bus has not been initialized.
   *
   * @returns The MojkitTransport instance
   */
  get(): MojkitTransport {
    if (!this.transport) {
      throw new Error(
        "Bus has not been initialized. Call Bus.getInstance().initialize() first.",
      );
    }
    return this.transport;
  }

  /**
   * Check if the bus is initialized.
   *
   * @returns True if the bus is initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.transport !== null;
  }

  /**
   * Disconnect from the message bus.
   * This is useful for cleanup during shutdown or testing.
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      // Assuming the transport has a disconnect/close method
      await this.transport.beforeShutdown()
      // If not available, we just set it to null
      this.transport = null;
      this.config = null;
    }
  }

  /**
   * Reset the singleton instance (useful for testing).
   */
  static reset(): void {
    Bus.instance = null;
  }
}
