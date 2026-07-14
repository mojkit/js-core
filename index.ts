import { Config } from "./config";
import { Bus } from "./bus";
import { registerListeners } from "./bus/listeners";
import type { ResolvedMojkitConfig } from "./config/types";

// Export configuration types
export type { MojkitConfig, ResolvedMojkitConfig, DomainConfig } from "./config/types";

// Export event publishing API
export * from "./bus/events";

// Export error rejection API
export * from "./bus/errors";

export class Mojkit {
  private static instance: Mojkit | null = null;


  private constructor() {}

  static getInstance(): Mojkit {
    if (!Mojkit.instance) {
      Mojkit.instance = new Mojkit();
    }
    return Mojkit.instance;
  }

  static async starat() {
    try {
      const mojkit = Mojkit.getInstance();
      await mojkit.initialize();
    } catch (err) {
      console.error("Failed to initialize Mojkit:", err);
      process.exit(1);
    }
  }

  get config(): ResolvedMojkitConfig {
    return Config.getInstance().get();
  }

  async initialize(): Promise<void> {
    await Config.getInstance().load();

    await Bus.getInstance().initialize({
      url: process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672",
      prefetchCount: process.env.RABBITMQ_PREFETCH_COUNT
        ? Number(process.env.RABBITMQ_PREFETCH_COUNT)
        : undefined,
    });

    // Register all bus listeners based on configuration
    await registerListeners(Config.getInstance().get());
  }

  static reset(): void {
    Mojkit.instance = null;
  }
}

export default Mojkit;
