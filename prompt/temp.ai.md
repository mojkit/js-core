# Event-Driven RPC System Implementation Plan

## Overview

Implement an event-driven RPC system that extends the existing Wave RabbitMQ transport to support awaiting handler-emitted events, side-effect listeners, and structured error handling while
maintaining backward compatibility.

## Architecture Summary

### Message Flow

Client → sendCommand() → Builder → execute() → RabbitMQ → Handler
↓
emit(event)
↓
Handler ← RabbitMQ ← Event Response ← Client (resolves Promise + fires listeners)

### Key Design Decisions (Confirmed)

- Location: Extend RabbitMQWaveTransport class
- Protocol: Extend CloudEvent format with event response type
- API: Fluent builder pattern with chainable methods
- Context: Extend ExecutionContext with emit() and reject()
- Typing: Command definition utility for full type inference
- Empty await: Standard RPC mode (return handler result)
- Multi-emit: First-match-wins for awaited events
- Errors: Always reject Promise, never treated as events
- Timeout: RPC timeout rejects Promise, listeners continue independently

———

## Phase 1: Core Type Definitions & Protocol

### 1.1 Message Protocol Types

File: ./bus/rabbitmq/src/WaveTransport.ts

Add new message response types:

/**
* Discriminated union for response message types
  */
  export type WaveResponseType = 'result' | 'event' | 'error';

/**
* Event response message sent from handler to requester
  */
  export interface WaveEventResponse<TPayload = unknown> {
  type: 'event';
  correlationId: string;
  eventName: string;
  eventData: TPayload;
  }

/**
* Standard RPC result response
  */
  export interface WaveResultResponse<TData = unknown> {
  type: 'result';
  correlationId: string;
  data: TData;
  }

/**
* Error response (already exists, extend if needed)
  */
  export interface WaveErrorResponse {
  type: 'error';
  correlationId: string;
  code: string;
  message: string;
  details?: Record<string, any>;
  }

### 1.2 Command Definition Utility

File: ./bus/rabbitmq/src/CommandDefinition.ts (new)

Create type-safe command definition utility:

/**
* Event map for a command - maps event names to payload types
  */
  export type EventMap = Record<string, any>;

/**
* Command definition with payload and event types
  */
  export interface CommandDefinition<
  TPayload = unknown,
  TEvents extends EventMap = EventMap
> {
payload: TPayload;
events: TEvents;
}

/**
* Utility to define a command with full type inference
  */
  export function defineCommand<
  TPayload,
  TEvents extends EventMap
>(): CommandDefinition<TPayload, TEvents> {
return {} as CommandDefinition<TPayload, TEvents>;
}

/**
* Extract event payload type from command definition
  */
  export type EventPayload<
  TCmd extends CommandDefinition<any, any>,
  TEventName extends keyof TCmd['events']
> = TCmd['events'][TEventName];

/**
* Extract union of event payload types for awaited events
  */
  export type AwaitedEventPayloads<
  TCmd extends CommandDefinition<any, any>,
  TEventNames extends (keyof TCmd['events'])[]
> = TCmd['events'][TEventNames[number]];

### 1.3 Extended Execution Context

File: ./bus/rabbitmq/src/WaveTransport.ts

Extend ExecutionContext interface:

export interface ExecutionContext {
// Existing methods
ack(): number;
nack(requeue?: boolean): number;
message: Record<string, any>;

    // New event-driven RPC methods
    /**
     * List of event names the requester is awaiting
     * Empty array means standard RPC mode
     */
    awaitedEvents?: string[];

    /**
     * Emit an event to the requester
     * Only sends if requester is awaiting this event or has listeners
     */
    emit?(eventName: string, eventData: any): Promise<void>;

    /**
     * Reject the RPC with a structured error
     * Immediately sends error response and halts execution
     */
    reject?(code: string, message: string, details?: Record<string, any>): never;
}

———

## Phase 2: Handler-Side Implementation

### 2.1 Enhanced Command Listener Setup

File: ./bus/rabbitmq/src/RabbitMQWaveTransport.ts

Modify addCommandListener to inject event emission capabilities:

public async addCommandListener(
namespace: string,
name: string,
handler: BaseMessageHandler,
options?: ListenerOptions
): Promise<Unsubscribe> {
// ... existing setup code ...

    const wrappedHandler = async (envelope: Envelope) => {
      const cloudEvent = envelope.body as CloudEventV1;
      const message = this.extractWaveMessage(cloudEvent);

      // Extract awaited events from context
      const awaitedEvents = message.context?.events ?? [];
      const correlationId = cloudEvent.extensions?.correlationId;
      const replyQueue = cloudEvent.extensions?.replyQueue;

      // Create enhanced execution context
      const executionContext: ExecutionContext = {
        ack: () => envelope.ack(),
        nack: (requeue) => envelope.nack(requeue),
        message: envelope,
        awaitedEvents,

        // Emit event implementation
        emit: async (eventName: string, eventData: any) => {
          if (!replyQueue || !correlationId) return;

          // Send event response
          const eventResponse: WaveEventResponse = {
            type: 'event',
            correlationId,
            eventName,
            eventData,
          };

          await this.sendToReplyQueue(replyQueue, eventResponse);
        },

        // Reject implementation
        reject: (code: string, message: string, details?: any) => {
          if (replyQueue && correlationId) {
            const errorResponse: WaveErrorResponse = {
              type: 'error',
              correlationId,
              code,
              message,
              details,
            };

            // Send error and throw to halt execution
            this.sendToReplyQueue(replyQueue, errorResponse);
          }

          throw new Error(`[${code}] ${message}`);
        },
      };

      try {
        const result = await handler(message, executionContext);

        // If no awaited events, send standard result
        if (awaitedEvents.length === 0 && replyQueue && correlationId) {
          const resultResponse: WaveResultResponse = {
            type: 'result',
            correlationId,
            data: result,
          };

          await this.sendToReplyQueue(replyQueue, resultResponse);
        }

        return result;
      } catch (error) {
        // Handle errors not caught by reject()
        if (replyQueue && correlationId) {
          const errorResponse: WaveErrorResponse = {
            type: 'error',
            correlationId,
            code: 'HANDLER_ERROR',
            message: error.message,
            details: { stack: error.stack },
          };

          await this.sendToReplyQueue(replyQueue, errorResponse);
        }

        throw error;
      }
    };

    // ... rest of listener setup ...
}

### 2.2 Reply Queue Helper

File: ./bus/rabbitmq/src/RabbitMQWaveTransport.ts

Add helper method for sending to reply queues:

private async sendToReplyQueue(
replyQueue: string,
response: WaveEventResponse | WaveResultResponse | WaveErrorResponse
): Promise<void> {
const publisher = await this.getOrCreatePublisher('reply');

    await publisher.send(
      { routingKey: replyQueue },
      response,
      { contentType: 'application/json' }
    );
}

———

## Phase 3: Client-Side Fluent Builder

### 3.1 Command Builder Class

File: ./bus/rabbitmq/src/CommandBuilder.ts (new)

Create fluent builder for event-driven commands:

export class CommandBuilder<
TPayload,
TCmd extends CommandDefinition<TPayload, any>,
TAwaitedEvents extends (keyof TCmd['events'])[] = []
> {
private awaitedEvents: Set<string> = new Set();
private listeners: Map<string, ListenerConfig> = new Map();
private timeoutMs: number = 30
