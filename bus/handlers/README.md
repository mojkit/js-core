# Bus Handlers

This directory contains the modules that register and invoke bus listeners. How to write a domain, call `app`, publish events, and handle errors is in [docs/GUIDE.md](../../docs/GUIDE.md). This page is the internal split only.

`ARCHITECTURE.md` is a historical before/after note. Its line counts and the `HandlerContext` sketch there omit `publishEvent` and `reject`. Use `bus/types.ts` for the current context.

## Architecture

The refactored listener system follows the Single Responsibility Principle by separating concerns into dedicated services:

### Core Services

#### `HandlerInvoker`
Invokes a handler that is an async function, an arrow function, or a class constructor.

**Key responsibilities:**
- Read `message.methods` for queries (first arg is `methods[0].args[0]`; the rest go on `context.methods`)
- Construct a class and assign `instance.app` for class constructors
- Call `handler` for commands and sagas, or `methods[0].method` for query classes

Non-functions throw `Invalid handler type: <type>`. A class instance stored in the config (`new Handler()`) hits that error. A non-async `function` declaration has a prototype in Bun and is treated as a class.

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
import type { ResolvedMojkitConfig } from "../../config/types";

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
