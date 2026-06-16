کارهایی که باید برای تکمیل AppDispatcher انجام بدم:
- توی کوئری باید بشه event رو فرستاد.
- برای کامند توی command handler باید این مدیریت انجام بشه که اگه event مشخص شده بود، همون به عنوان response برگرده، در غیر این صورت مقدار return باید برگردونده بشه.

---

All builder logics that exist in the bus package, should be in the app-service package.
The bus should only work with an incoming object message.

The @wave/bus-rabbitmq is not responsible for generate message with 'await' and 'on' method (builder logics).
The @wave/app-service should generate this message and pass it to core, and then bus pass it to bus.

I'm not sure about `CommandBuilder.execute`. This method could be in the bus package that already is.
But we can move all of it logics to core package. In there we can add more additional logic that needed.

The first parameter of the 'reject' method should accept an object.
This object should contains code, message and details.

The 'context.awaitedEvents' is not needed. The complete command message is enough.
The 'context.emit' and 'context.reject' methods are nice, but they should work out of incoming command.
Each command can publish (emit) and event, or reject it.
The reject emit an event too.

---

# Feature Implementation Prompt: Event-Driven RPC System

## Objective
Create a complete implementation of an event-driven RPC system that allows requesters to:
1. Make standard RPC calls that return handler results
2. Await specific events emitted by handlers to resolve the RPC Promise
3. Register side-effect listeners for events without blocking the RPC
4. Handle errors through a structured rejection mechanism

## Core Requirements

### 1. Message Protocol
The four message types for RabbitMQ communication:

**Request Message** must contain:
- Unique message identifier for correlation
- Command name identifier
- Command payload data
- Array of event names the requester wants to await
- Timeout duration in milliseconds

**Event Response** must contain:
- Message identifier for correlation
- Type indicator marking it as an event
- Event name
- Event payload data

**Standard RPC Response** must contain:
- Message identifier for correlation
- Type indicator marking it as a result
- Handler return value data

**Error Response** must contain:
- Message identifier for correlation
- Type indicator marking it as an error
- Structured error object with code, message, and optional details

### 2. Handler-Side API
Create a command handler context that provides:

**Properties:**
- Access to the message identifier
- Access to the array of events the requester is awaiting

**Methods:**
- Method to emit events with name and data
- Method to reject with structured error that always rejects the Promise and halts execution

**Handler Behavior:**
- Handlers should check which events are being awaited before doing expensive operations
- Handlers can conditionally emit different events based on business logic
- Handlers can emit events and return early, or return standard results
- Rejection should bypass all event routing and immediately send error response
- return the data part of the event if the return results is an event

### 3. Client-Side API
Implement a fluent API builder pattern with these capabilities:

**Await Method:**
- Accept variable number of event names
- Add events to the list that can resolve the Promise
- Validate no overlap with side-effect listener events
- Return self for method chaining

**Side-Effect Listener Method ('on'):**
- Accept event name, handler function, and optional configuration with timeout
- Register listeners that receive all emissions without blocking RPC
- Validate no overlap with awaited events
- Support independent timeout per listener
- Return self for method chaining

**Execute Method:**
- Send the RPC request with collected await events
- Set up message subscriptions for responses
- Handle timeout with proper cleanup
- Resolve Promise on first matching awaited event
- Fire all registered listeners for matching events
- Reject Promise on error messages
- Clean up subscriptions and timers on completion

**Awaitable Behavior:**
- Make the builder object directly awaitable without explicit execute call
- Implement Promise-like interface for seamless async/await usage

### 4. Type Safety
Implement TypeScript generics for compile-time type checking:

**Command Definition:**
- Create utility to define commands with payload type and event map
- Infer return types based on awaited events

**Type Inference:**
- Listener method should infer correct payload type for each event
- Result type should be union of all awaited event payload types
- Compile-time errors for overlapping events between await and listeners

## Critical Behavioral Rules

### Rule 1: Mutual Exclusivity
An event cannot be used in both the await list and as a side-effect listener for the same RPC call.
The system must validate this at call time and throw a descriptive error if overlap is detected.
This prevents ambiguous behavior where it's unclear whether an event should resolve the Promise or just trigger a listener.

### Rule 2: Event Consumption
Events in the await list consume the first matching emission and resolve the Promise.
Side-effect listeners receive all emissions of their registered events.
Events that resolve the Promise are not re-dispatched to any listeners.
This ensures clean separation between Promise resolution and side-effect handling.

### Rule 3: Event Ordering
Events may arrive in any order due to RabbitMQ routing, network latency, and concurrent processing.
The system makes no guarantees about emission order matching reception order.
Handlers should include sequence numbers or timestamps in event payloads if ordering matters to the business logic.

### Rule 4: Timeout Semantics
The RPC timeout is set at command invocation and applies to the entire RPC call including awaited events.
Side-effect listener timeouts are independent per listener and can outlive the RPC completion.
Awaited events use the RPC timeout without separate configuration.
Listeners can continue receiving events after the main RPC resolves or times out.

### Rule 5: Empty Await Array
When no events are specified in the await list, the system operates in standard RPC mode.
The handler's return value is sent as the result message.
Emitted events are ignored unless there are registered side-effect listeners.

### Rule 6: Error Handling
Handler rejection always rejects the Promise regardless of awaited events or listeners.
Error messages bypass event routing and go directly to Promise rejection.
Errors must use the structured format with code, message, and optional details.
This ensures errors are never lost or misrouted.

## Acceptance Criteria
The implementation is complete when:
1. All message types are defined and properly serializable
2. Handler context provides emit and reject functionality
3. Client API supports await, listener registration, and chaining
4. Mutual exclusivity validation throws clear errors
5. First-match-wins behavior works for awaited events
6. All emissions are received by registered listeners
7. Timeouts work correctly for RPC and listeners independently
8. Error handling via rejection bypasses event routing
9. Empty await list triggers standard RPC mode
10. Type safety works with full inference
11. All tests pass with over 90% coverage
12. Documentation is complete and clear
13. Integration with existing Wave framework is seamless
14. Backward compatibility is maintained

## Implementation Tasks

### Task 1: Message Router
Create a RabbitMQ message router component that:
- Generates unique message identifiers using UUID v4
- Sends request messages to appropriate command queues
- Subscribes to response queues using message identifier correlation
- Routes incoming messages to correct Promise resolvers and listeners
- Handles cleanup on timeout or completion
- Manages RabbitMQ connection pooling and channel management
- Implements retry logic for transient failures
- Logs message flow for debugging

### Task 2: Command Context
Implement the handler-side context that:
- Parses awaited events from incoming request
- Tracks which events have registered listeners on the client side
- Implements emit method that only sends messages when needed
- Implements reject method that sends error and throws to halt handler
- Maintains message identifier for correlation
- Integrates with existing Wave framework handler patterns
- Provides access to request metadata

### Task 3: RPC Call Builder
Implement the client-side fluent API that:
- Collects awaited events through chaining
- Registers side-effect listeners with handlers and timeouts
- Validates mutual exclusivity between await and listeners
- Sends request with collected configuration
- Sets up RabbitMQ subscriptions for responses
- Implements first-match-wins resolution for awaited events
- Fires all listeners for matching events
- Handles RPC timeout with cleanup
- Handles per-listener timeouts independently
- Rejects on error messages
- Cleans up all subscriptions and timers
- Implements Promise interface for awaitable behavior

### Task 4: Type Safety Integration
Implement TypeScript generic system that:
- Defines command with payload type and event map
- Infers available event names from event map
- Restricts await method to valid event names
- Restricts listener method to valid event names
- Infers correct payload type for each listener
- Computes result type as union of awaited event payloads
- Provides compile-time error for overlapping events
- Integrates with existing Wave framework type system

### Task 5: Testing
Create comprehensive test suites covering:
- Standard RPC mode with empty await list
- Single event await with resolution
- Multiple event await with first-match-wins
- Side-effect listeners receiving all emissions
- Hybrid mode with different events in await and listeners
- Mutual exclusivity validation and error messages
- RPC timeout behavior and cleanup
- Independent listener timeout behavior
- Error handling via rejection
- Event ordering non-determinism scenarios
- Cleanup on completion and timeout
- Concurrent RPC calls with events
- Edge cases like duplicate events, invalid event names
- Integration with existing Wave framework components

### Task 6: Documentation
Generate comprehensive documentation covering:
- API reference for all public interfaces and methods
- Behavioral rules with clear explanations
- Usage patterns for different scenarios
- Error handling best practices
- Performance optimization guidelines
- Handler optimization based on awaited events
- Migration guide from standard RPC
- Troubleshooting common issues
- Architecture diagrams showing message flow
- Sequence diagrams for different patterns

## File Structure
Organize implementation into logical modules:
- Core message routing and RabbitMQ integration
- Handler-side context implementation
- Client-side fluent API builder
- Message protocol type definitions
- Decorators for command handlers
- Utility functions for UUID generation and timeouts
- Comprehensive test suites
- Usage examples demonstrating patterns
- Integration with existing Wave framework structure


## Implementation Guidelines
- Study existing Wave framework patterns for decorators, dependency injection, and error handling
- Integrate with existing RabbitMQ connection pool and channel management
- Follow Wave's naming conventions and code organization
- Ensure backward compatibility with existing standard RPC calls
- Optimize handler performance by checking awaited events before expensive operations
- Add comprehensive logging for debugging message flow
- Use existing Wave utilities where applicable
- Follow TypeScript best practices for generics and type inference
- Write tests that match existing Wave test patterns
- Generate examples that demonstrate real-world usage patterns

## Success Metrics
- Zero breaking changes to existing RPC calls
- Minimal performance overhead for event routing (target under 5ms)
- Support for high concurrency (1000+ concurrent RPC calls with events)
- Clear, actionable error messages for validation failures
- Developer-friendly API requiring minimal boilerplate
- Comprehensive type safety catching errors at compile time
- Complete test coverage for all behavioral rules
- Clear documentation enabling quick adoption

## Implementation Approach
Start by examining the existing Wave framework codebase to understand:
- Current RPC implementation patterns
- RabbitMQ integration and message handling
- Command handler decorator implementation
- Type system and generic usage patterns
- Testing patterns and utilities
- Error handling conventions

Then implement in this order:
1. Define message protocol types matching Wave conventions
2. Build message router integrating with existing RabbitMQ infrastructure
3. Implement handler context following Wave handler patterns
4. Create client API builder with fluent interface
5. Add TypeScript generics for type safety
6. Write comprehensive tests for each component
7. Perform integration testing with existing Wave components
8. Generate documentation and usage examples
9. Validate backward compatibility
10. Optimize performance and add logging

---

**Examine the existing codebase first to understand patterns, then implement each component following Wave framework conventions. Test thoroughly at each stage before moving to the next component.**
