# Bus Handlers

This directory contains modular services for handling bus listener registration and invocation.

## Architecture

The refactored listener system follows the Single Responsibility Principle by separating concerns into dedicated services:

### Core Services

#### `HandlerInvoker`
Responsible for invoking different types of handlers (function-based, class-based, or instance-based).

**Key responsibilities:**
- Extract query parameters and chained methods
- Determine handler type (function, class, or instance)
- Invoke handlers with appropriate arguments
- Handle query method resolution

#### `ErrorHandler`
Transforms domain errors into serializable format with proper context.

**Key responsibilities:**
- Wrap errors with domain context
- Create consistent error codes
- Preserve error metadata (userId, domain, handler name)
- Support different handler types (command, query, saga)

#### `EventNameParser`
Parses full event names into namespace and event name components.

**Key responsibilities:**
- Validate event name format
- Extract namespace and event name
- Provide clear error messages for invalid formats

#### `ListenerRegistrar`
Orchestrates the registration of all bus listeners based on configuration.

**Key responsibilities:**
- Register command listeners
- Register query listeners
- Register saga listeners (event listeners)
- Coordinate between all services

## Usage

```typescript
import { registerListeners } from "../listeners";
import type { ResolvedWaveConfig } from "../../config/types";

// Register all listeners
await registerListeners(config);
```

## Benefits of Refactoring

1. **Modularity**: Each service has a single, well-defined responsibility
2. **Testability**: Services can be unit tested in isolation
3. **Maintainability**: Changes to one aspect don't affect others
4. **Readability**: Clear separation of concerns makes code easier to understand
5. **Reusability**: Services can be reused in different contexts
6. **Type Safety**: Comprehensive TypeScript types throughout

## File Structure

```
handlers/
├── HandlerInvoker.ts      # Handler invocation logic
├── ErrorHandler.ts        # Error transformation
├── EventNameParser.ts     # Event name parsing
├── ListenerRegistrar.ts   # Main registration orchestrator
├── index.ts              # Barrel exports
└── README.md             # This file
```
