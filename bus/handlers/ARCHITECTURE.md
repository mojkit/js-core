# Architecture Diagram

Historical note from the listener refactor. Line counts are from that change and are not maintained.

The current `HandlerContext` is `bus/types.ts`: `busMessage`, `app`, `publishEvent`, `reject`, and optional `methods`. The sketch later in this file predates `publishEvent` and `reject`.

For how registration, queries, and errors behave now, read [docs/GUIDE.md](../../docs/GUIDE.md).

## Before Refactoring

```
┌────────────────────────────────────────────────────────────┐
│                     listeners.ts (269 lines)               │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ HandlerContext interface                           │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ invokeHandler() - 120 lines                        │    │
│  │  - Extract query params                            │    │
│  │  - Check handler type                              │    │
│  │  - Invoke function/class/instance                  │    │
│  │  - Handle query methods                            │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ parseEventName() - 15 lines                        │    │
│  │  - Parse event name format                         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ registerListeners() - 134 lines                    │    │
│  │  - Iterate domains                                 │    │
│  │  - Register commands (with error handling)         │    │
│  │  - Register queries (with error handling)          │    │
│  │  - Register sagas (with error handling)            │    │
│  │  - Duplicate error handling logic 3x               │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
└────────────────────────────────────────────────────────────┘

❌ Problems:
- All logic in one file
- Complex nested conditions
- Duplicate error handling
- Hard to test
- High cyclomatic complexity
```

## After Refactoring

```
┌──────────────────────────────────────────────────────────────────────┐
│                    listeners.ts (18 lines)                           │
│                         [Entry Point]                                │
│                                                                      │
│  export async function registerListeners(config) {                   │
│    const registrar = new ListenerRegistrar();                        │
│    await registrar.registerAll(config);                              │
│  }                                                                   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    types.ts (29 lines)                               │
│                    [Shared Types]                                    │
│                                                                      │
│  export interface HandlerContext {                                   │
│    busMessage: ExecutionContext;                                     │
│    app: AppDispatcher;                                               │
│    methods?: Array<{method: string; args?: any[]}>;                  │
│  }                                                                   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                handlers/ (Modular Services)                          │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  ListenerRegistrar.ts (202 lines)                              │  │
│  │  [Orchestration Layer]                                         │  │
│  │                                                                │  │
│  │  + registerAll(config)                                         │  │
│  │  - registerCommandListeners()                                  │  │
│  │  - registerQueryListeners()                                    │  │
│  │  - registerSagaListeners()                                     │  │
│  │                                                                │  │
│  │  Uses: ↓                                                       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│         │                    │                    │                  │
│         ▼                    ▼                    ▼                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐       │
│  │HandlerInvoker│   │ ErrorHandler │   │ EventNameParser  │       │
│  │  (180 lines) │   │  (88 lines)  │   │   (42 lines)     │       │
│  └──────────────┘   └──────────────┘   └──────────────────┘       │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  HandlerInvoker.ts                                             │ │
│  │  [Handler Invocation Logic]                                    │ │
│  │                                                                 │ │
│  │  + invoke(handler, message, context, isQuery)                  │ │
│  │  - extractQueryParams()                                        │ │
│  │  - enrichContext()                                             │ │
│  │  - executeHandler()                                            │ │
│  │  - isClassConstructor()                                        │ │
│  │  - invokeInstanceHandler()                                     │ │
│  │  - invokeClassHandler()                                        │ │
│  │  - invokeQueryMethod()                                         │ │
│  │  - invokeFunctionHandler()                                     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  ErrorHandler.ts                                               │ │
│  │  [Error Transformation]                                        │ │
│  │                                                                 │ │
│  │  + transformError(error, type, context)                        │ │
│  │  + wrapCommandError()                                          │ │
│  │  + wrapQueryError()                                            │ │
│  │  + wrapSagaError()                                             │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  EventNameParser.ts                                            │ │
│  │  [Event Name Parsing]                                          │ │
│  │                                                                 │ │
│  │  + parse(fullEventName)                                        │ │
│  │    → { namespace, eventName }                                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘

✅ Benefits:
- Clear separation of concerns
- Each service has single responsibility
- Easy to test independently
- Low cyclomatic complexity
- Reusable components
- Easy to extend
```

## Data Flow

```
User Code
   │
   ▼
registerListeners(config)
   │
   ▼
ListenerRegistrar.registerAll()
   │
   ├─→ For each domain
   │   │
   │   ├─→ registerCommandListeners()
   │   │   │
   │   │   └─→ bus.addCommandListener()
   │   │       │
   │   │       └─→ async (message, busMessage) => {
   │   │           │
   │   │           ├─→ HandlerInvoker.invoke()
   │   │           │   │
   │   │           │   ├─→ extractQueryParams()
   │   │           │   ├─→ enrichContext()
   │   │           │   └─→ executeHandler()
   │   │           │       │
   │   │           │       ├─→ invokeInstanceHandler()
   │   │           │       ├─→ invokeClassHandler()
   │   │           │       └─→ invokeFunctionHandler()
   │   │           │
   │   │           └─→ catch (error) {
   │   │               ErrorHandler.wrapCommandError()
   │   │             }
   │   │
   │   ├─→ registerQueryListeners()
   │   │   └─→ (similar flow with isQuery=true)
   │   │
   │   └─→ registerSagaListeners()
   │       │
   │       ├─→ EventNameParser.parse()
   │       └─→ bus.addEventListener()
   │           └─→ (similar flow)
   │
   └─→ Complete
```

## Dependency Graph

```
listeners.ts
    │
    └─→ ListenerRegistrar
            │
            ├─→ HandlerInvoker
            │       │
            │       └─→ HandlerContext (from types.ts)
            │
            ├─→ ErrorHandler
            │       │
            │       └─→ SerializableError (from ../errors)
            │
            └─→ EventNameParser
```

## Testing Strategy

```
Unit Tests (Easy with new architecture)
├─→ HandlerInvoker.test.ts
│   ├─→ Test function handlers
│   ├─→ Test class handlers
│   ├─→ Test instance handlers
│   ├─→ Test query parameter extraction
│   └─→ Test error cases
│
├─→ ErrorHandler.test.ts
│   ├─→ Test command error wrapping
│   ├─→ Test query error wrapping
│   ├─→ Test saga error wrapping
│   └─→ Test metadata preservation
│
├─→ EventNameParser.test.ts
│   ├─→ Test valid event names
│   ├─→ Test invalid formats
│   └─→ Test edge cases
│
└─→ ListenerRegistrar.test.ts
    ├─→ Test command registration
    ├─→ Test query registration
    ├─→ Test saga registration
    └─→ Test integration with services

Integration Tests
└─→ listeners.test.ts (existing)
    └─→ Test end-to-end registration flow
```

## Extension Points

```
Want to add new features? Easy!

1. New Handler Type
   └─→ Extend HandlerInvoker.executeHandler()

2. Custom Error Handling
   └─→ Extend ErrorHandler or create new service

3. Event Name Formats
   └─→ Modify EventNameParser.parse()

4. Middleware/Logging
   └─→ Add new service in handlers/
   └─→ Inject into ListenerRegistrar

5. Performance Monitoring
   └─→ Wrap services with decorators
   └─→ Add timing in ListenerRegistrar
```
