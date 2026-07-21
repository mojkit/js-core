import type { ResolvedMojkitConfig } from "../../config/types";
import type { ExecutionContext } from "@mojkit/bus-rabbitmq";
import { randomUUID } from "crypto";
import { Bus } from "../index";
import { AppDispatcher } from "../../services/AppDispatcher";
import { HandlerInvoker } from "./HandlerInvoker";
import { ErrorHandler } from "./ErrorHandler";
import { EventNameParser } from "./EventNameParser";
import type { HandlerContext } from "../types";
import { createPublishEvent } from "../events";
import { createReject } from "../errors/createReject";
import type { RPCContext } from "../events/createPublishEvent";

/**
 * Service responsible for registering all bus listeners
 * (commands, queries, and sagas) based on the configuration.
 */
export class ListenerRegistrar {
  private readonly handlerInvoker: HandlerInvoker;
  private readonly errorHandler: ErrorHandler;
  private readonly eventNameParser: EventNameParser;

  constructor() {
    this.handlerInvoker = new HandlerInvoker();
    this.errorHandler = new ErrorHandler();
    this.eventNameParser = new EventNameParser();
  }

  /**
   * Register all bus listeners based on the configuration.
   */
  async registerAll(config: ResolvedMojkitConfig): Promise<void> {
    const bus = Bus.getInstance().get();
    const appDispatcher = AppDispatcher.getInstance();

    for (const [domainNamespace, domainConfig] of Object.entries(
      config.domains,
    )) {
      await this.registerCommandListeners(
        bus,
        appDispatcher,
        domainNamespace,
        domainConfig,
      );

      await this.registerQueryListeners(
        bus,
        appDispatcher,
        domainNamespace,
        domainConfig,
      );

      await this.registerSagaListeners(
        bus,
        appDispatcher,
        domainNamespace,
        domainConfig,
      );
    }
  }

  /**
   * Register command listeners for a domain.
   */
  private async registerCommandListeners(
    bus: any,
    appDispatcher: AppDispatcher,
    domainNamespace: string,
    domainConfig: any,
  ): Promise<void> {
    if (!domainConfig.commands) {
      return;
    }

    for (const [commandName, commandHandler] of Object.entries(
      domainConfig.commands,
    )) {
      await bus.addCommandListener(
        domainNamespace,
        commandName,
        async (message: any, busMessage: ExecutionContext) => {
          // Extract correlationId from the message or generate a new one
          const correlationId =
            busMessage.message.body?.extensions?.correlationId ??
            busMessage.message.body?.context?.correlationId ??
            randomUUID();

          // Extract RPC context from message extensions if present
          let rpcContext: RPCContext | undefined;
          const extensions = busMessage.message.body?.extensions;
          if (
            extensions?.messageId &&
            extensions?.awaitedEvents &&
            extensions?.replyQueue
          ) {
            rpcContext = {
              messageId: extensions.messageId,
              awaitedEvents: extensions.awaitedEvents,
              replyQueue: extensions.replyQueue,
            };
          }

          // Create publishEvent function bound to this handler context
          const publishEvent = createPublishEvent(
            { namespace: domainNamespace, correlationId, handlerType: 'command', handlerName: commandName },
            bus,
            rpcContext
          );

          // Create reject function bound to this handler context
          const reject = createReject(
            { namespace: domainNamespace, correlationId, handlerType: 'command', handlerName: commandName },
            bus,
            rpcContext
          );

          const context: HandlerContext = {
            busMessage,
            app: appDispatcher,
            publishEvent,
            reject,
          };

          try {
            const result = await this.handlerInvoker.invoke(
              commandHandler,
              message,
              context,
              false,
            );

            // If RPC context is present and no events were awaited, send result
            if (rpcContext && (!rpcContext.awaitedEvents || rpcContext.awaitedEvents.length === 0)) {
              await bus.sendToReplyQueue(rpcContext.replyQueue, {
                type: 'result',
                messageId: rpcContext.messageId,
                payload: result,
              });
            }

            return result;
          } catch (error) {
            throw this.errorHandler.wrapCommandError(
              error,
              domainNamespace,
              commandName,
              message.context?.userId,
            );
          }
        },
      );

      console.log(
        `✓ Registered command listener: ${domainNamespace}.${commandName}`,
      );
    }
  }

  /**
   * Register query listeners for a domain.
   */
  private async registerQueryListeners(
    bus: any,
    appDispatcher: AppDispatcher,
    domainNamespace: string,
    domainConfig: any,
  ): Promise<void> {
    if (!domainConfig.queries) {
      return;
    }

    for (const [queryName, queryHandler] of Object.entries(
      domainConfig.queries,
    )) {
      await bus.addQueryListener(
        domainNamespace,
        queryName,
        async (message: any, busMessage: ExecutionContext) => {
          // Extract correlationId from the message or generate a new one
          const correlationId =
            busMessage.message.body?.extensions?.correlationId ??
            busMessage.message.body?.context?.correlationId ??
            randomUUID();

          // Extract RPC context from message extensions if present
          let rpcContext: RPCContext | undefined;
          const extensions = busMessage.message.body?.extensions;
          if (
            extensions?.messageId &&
            extensions?.awaitedEvents &&
            extensions?.replyQueue
          ) {
            rpcContext = {
              messageId: extensions.messageId,
              awaitedEvents: extensions.awaitedEvents,
              replyQueue: extensions.replyQueue,
            };
          }

          // Create publishEvent function bound to this handler context
          const publishEvent = createPublishEvent(
            { namespace: domainNamespace, correlationId, handlerType: 'command', handlerName: queryName },
            bus,
            rpcContext
          );

          // Create reject function bound to this handler context
          const reject = createReject(
            { namespace: domainNamespace, correlationId, handlerType: 'command', handlerName: queryName },
            bus,
            rpcContext
          );

          const context: HandlerContext = {
            busMessage,
            app: appDispatcher,
            publishEvent,
            reject,
          };

          try {
            const result = await this.handlerInvoker.invoke(
              queryHandler,
              message,
              context,
              true,
            );

            // If RPC context is present and no events were awaited, send result
            if (rpcContext && (!rpcContext.awaitedEvents || rpcContext.awaitedEvents.length === 0)) {
              await bus.sendToReplyQueue(rpcContext.replyQueue, {
                type: 'result',
                messageId: rpcContext.messageId,
                payload: result,
              });
            }

            return result;
          } catch (error) {
            throw this.errorHandler.wrapQueryError(
              error,
              domainNamespace,
              queryName,
              message.context?.userId,
            );
          }
        },
      );

      console.log(
        `✓ Registered query listener: ${domainNamespace}.${queryName}`,
      );
    }
  }

  /**
   * Register saga listeners (event listeners) for a domain.
   */
  private async registerSagaListeners(
    bus: any,
    appDispatcher: AppDispatcher,
    domainNamespace: string,
    domainConfig: any,
  ): Promise<void> {
    if (!domainConfig.sagas) {
      return;
    }

    for (const [fullEventName, sagaHandler] of Object.entries(
      domainConfig.sagas,
    )) {
      const { namespace: eventNamespace, eventName } =
        this.eventNameParser.parse(fullEventName);

      await bus.addEventListener(
        eventNamespace,
        eventName,
        async (message: any, busMessage: ExecutionContext) => {
          // Extract correlationId from the message or generate a new one
          const correlationId =
            busMessage.message.body?.extensions?.correlationId ??
            busMessage.message.body?.context?.correlationId ??
            randomUUID();

          // Extract RPC context from message extensions if present
          let rpcContext: RPCContext | undefined;
          const extensions = busMessage.message.body?.extensions;
          if (
            extensions?.messageId &&
            extensions?.awaitedEvents &&
            extensions?.replyQueue
          ) {
            rpcContext = {
              messageId: extensions.messageId,
              awaitedEvents: extensions.awaitedEvents,
              replyQueue: extensions.replyQueue,
            };
          }

          // Create publishEvent function bound to this handler context
          const publishEvent = createPublishEvent(
            { namespace: domainNamespace, correlationId, handlerType: 'event', handlerName: fullEventName },
            bus,
            rpcContext
          );

          // Create reject function bound to this handler context
          const reject = createReject(
            { namespace: domainNamespace, correlationId, handlerType: 'event', handlerName: fullEventName },
            bus,
            rpcContext
          );

          const context: HandlerContext = {
            busMessage,
            app: appDispatcher,
            publishEvent,
            reject,
          };

          try {
            await this.handlerInvoker.invoke(sagaHandler, message, context, false);
          } catch (error) {
            throw this.errorHandler.wrapSagaError(
              error,
              domainNamespace,
              fullEventName,
              message.context?.userId,
            );
          }
        },
      );

      console.log(
        `✓ Registered saga listener: ${domainNamespace} -> ${fullEventName}`,
      );
    }
  }
}
