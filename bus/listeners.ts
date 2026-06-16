import type { ResolvedWaveConfig } from "../config/types";
import { ListenerRegistrar } from "./handlers";

// Re-export types for backward compatibility
export type { HandlerContext } from "./types";

/**
 * Register all bus listeners based on the configuration.
 * This includes command listeners, query listeners, and event listeners (sagas).
 *
 * @param config - Resolved Wave configuration
 */
export async function registerListeners(
  config: ResolvedWaveConfig,
): Promise<void> {
  const registrar = new ListenerRegistrar();
  await registrar.registerAll(config);
}
