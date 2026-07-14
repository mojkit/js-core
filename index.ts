import { Config } from "./config";
import { Bus } from "./bus";
import { registerListeners } from "./bus/listeners";
import type { ResolvedWaveConfig } from "./config/types";

// Export configuration types
export type { WaveConfig, ResolvedWaveConfig, DomainConfig } from "./config/types";

// Export event publishing API
export * from "./bus/events";

// Export error rejection API
export * from "./bus/errors";

export class Wave {
  private static instance: Wave | null = null;


  private constructor() {}

  static getInstance(): Wave {
    if (!Wave.instance) {
      Wave.instance = new Wave();
    }
    return Wave.instance;
  }

  static async starat() {
    try {
      const wave = Wave.getInstance();
      await wave.initialize();
    } catch (err) {
      console.error("Failed to initialize Wave:", err);
      process.exit(1);
    }
  }

  get config(): ResolvedWaveConfig {
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
    Wave.instance = null;
  }
}

export default Wave;
