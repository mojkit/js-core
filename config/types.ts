import type { HandlerContext } from "../bus/listeners";

/**
 * Function-based command handler.
 *
 * @param message - The command message payload
 * @param context - Handler context including busMessage, app, and publishEvent
 */
export type CommandHandlerFunction = (
  message: any,
  context: HandlerContext,
) => Promise<any>;

/**
 * Class-based command handler.
 */
export interface CommandHandlerClass {
  app?: any; // AppDispatcher instance, assigned at runtime
  handler(message: any, context: HandlerContext): Promise<any>;
}

/**
 * Function-based query handler.
 *
 * @param message - The query message payload
 * @param context - Handler context including busMessage, app, and publishEvent
 */
export type QueryHandlerFunction = (
  message: any,
  context: HandlerContext,
) => Promise<any>;

/**
 * Class-based query handler.
 */
export interface QueryHandlerClass {
  app?: any; // AppDispatcher instance, assigned at runtime
  handler(message: any, context: HandlerContext): Promise<any>;
  [key: string]: any; // Allow any method name for query handlers
}

/**
 * Function-based saga (event) handler.
 *
 * @param message - The event message payload
 * @param context - Handler context including busMessage, app, and publishEvent
 */
export type SagaHandlerFunction = (
  message: any,
  context: HandlerContext,
) => Promise<any>;

/**
 * Class-based saga (event) handler.
 */
export interface SagaHandlerClass {
  app?: any; // AppDispatcher instance, assigned at runtime
  handler?(message: any, context: HandlerContext): Promise<any>;
}

export type CommandHandler = CommandHandlerFunction | CommandHandlerClass;
export type QueryHandler = QueryHandlerFunction | QueryHandlerClass;
export type SagaHandler = SagaHandlerFunction | SagaHandlerClass;

// Domain configuration for a single domain module
export interface DomainConfig {
  commands?: Record<string, CommandHandler>;
  queries?: Record<string, QueryHandler>;
  sagas?: Record<string, SagaHandler>;
}

/**
 * Service-level metadata used to identify and categorize the running service.
 */
export interface ServiceConfig {
  /**
   * Human-readable service name (for logging, diagnostics, and registries).
   */
  name?: string;

  /**
   * Runtime environment name (for example `"development"`, `"staging"`, or
   * `"production"`).
   */
  environment?: string;
}

/**
 * Message bus transport configuration.
 *
 * This section is intentionally extensible and will host bus-specific settings
 * (such as connection options, exchange naming, and retry policies) as they
 * are introduced.
 */
export interface MessageBusConfig {
  url?: string;
  prefetchCount?: number;
}

/**
 * Input configuration contract used by `mojkit.config.ts`.
 *
 * The returned object drives startup behavior and runtime wiring. The
 * `domains` map is mandatory so the platform can discover and bootstrap each
 * domain module at startup.
 */
export interface MojkitConfig {
  /**
   * Registered domains keyed by module identifier.
   *
   * Example keys: `"User.Auth"`, `"Billing.Invoice"`.
   */
  domains: Record<string, DomainConfig>;

  /**
   * Optional service metadata.
   */
  service?: ServiceConfig;

  /**
   * Message bus configuration.
   */
  messageBus?: MessageBusConfig;
}

/**
 * Resolved Mojkit configuration with all defaults applied.
 *
 * This is the fully-merged configuration object used at runtime after
 * combining defaults, file config, parameters, and environment variables.
 * All optional fields from MojkitConfig are guaranteed to have values.
 */
export interface ResolvedMojkitConfig {
  /**
   * Registered domains keyed by module identifier.
   *
   * Example keys: `"User.Auth"`, `"Billing.Invoice"`.
   */
  domains: Record<string, DomainConfig>;

  /**
   * Service metadata (always present with defaults).
   */
  service: Required<ServiceConfig>;

  /**
   * Message bus configuration (always present, may be empty object).
   */
  messageBus: MessageBusConfig;
}

/**
 * Default values for required fields in ResolvedMojkitConfig.
 */
export const RESOLVED_DEFAULTS: Omit<ResolvedMojkitConfig, "domains"> = {
  service: {
    name: "mojkit-service",
    environment: "development",
  },
  messageBus: {},
};
