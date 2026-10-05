import { Config } from "./config";
import { Bus } from "./bus";
import { registerListeners } from "./bus/listeners";
import type { ResolvedMojkitConfig } from "./config/types";
import { AppDispatcher } from "./services/AppDispatcher";

// Export configuration types
export type { MojkitConfig, DomainConfig } from "./config/types";

// Export event publishing API
export * from "./bus/events";

// Export error rejection API
export * from "./bus/errors";

// Export services
export { app } from './services/AppDispatcher'

export class Mojkit {
  private static instance: Mojkit | null = null;

  private constructor() {}

  static getInstance(): Mojkit {
    if (!Mojkit.instance) {
      Mojkit.instance = new Mojkit();
    }
    return Mojkit.instance;
  }

  static async start(): Promise<Mojkit> {
    try {
      const mojkit = Mojkit.getInstance();
      await mojkit.initialize();
      return mojkit;
    } catch (err) {
      console.error("Failed to initialize Mojkit:", err);
      process.exit(1);
    }
  }

  get config(): ResolvedMojkitConfig {
    return Config.getInstance().get();
  }

  async initialize(): Promise<void> {
    const config = await Config.getInstance().load();

    await Bus.getInstance().initialize(config.messageBus);

    // initialize the app service
    AppDispatcher.getInstance();
    AppDispatcher.initialize();

    // Register all bus listeners based on configuration
    await registerListeners(config);
  }

  static reset(): void {
    Mojkit.instance = null;
  }
}

export default Mojkit;
