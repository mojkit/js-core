# AppDispatcher Usage Guide

The `AppDispatcher` class provides a singleton pattern for managing the Mojkit app instance and dispatcher configuration.

## Features

- **Singleton Pattern**: Ensures only one instance exists
- **getApp() Method**: Provides access to the configured app instance
- **Convenience Exports**: Multiple ways to access the app

## Usage Patterns

### 1. Using getInstance() and getApp()

```typescript
import { AppDispatcher } from "@mojkit/core/services/AppDispatcher";

// Get the singleton instance
const dispatcher = AppDispatcher.getInstance();

// Get the app instance
const app = dispatcher.getApp();

// Use the app to make calls
const result = await app.MyNamespace.myCommand({ data: "test" });
```

### 2. Using getAppDispatcher() Helper

```typescript
import { getAppDispatcher } from "@mojkit/core/services/AppDispatcher";

// Get the app instance directly
const app = getAppDispatcher().getApp();

// Use the app
const result = await app.MyNamespace.myCommand({ data: "test" });
```

### 3. Direct App Import (Recommended for most cases)

```typescript
import { app } from "@mojkit/core/services/AppDispatcher";

// Use the app directly
const result = await app.MyNamespace.myCommand({ data: "test" });
```

## Initialization

Before using the app, you must initialize the dispatcher:

```typescript
import { AppDispatcher } from "@mojkit/core/services/AppDispatcher";
import { Config } from "@mojkit/core/config";
import { Bus } from "@mojkit/core/bus";

// Load configuration
await Config.getInstance().load();

// Initialize bus
await Bus.getInstance().initialize({
  url: process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672",
});

// Initialize dispatcher
AppDispatcher.initialize();

// Now you can use the app
import { app } from "@mojkit/core/services/AppDispatcher";
const result = await app.MyNamespace.myCommand({ data: "test" });
```

## API Reference

### AppDispatcher Class

#### Static Methods

- `getInstance(): AppDispatcher` - Get the singleton instance
- `initialize(): void` - Initialize the dispatcher (must be called once)
- `reset(): void` - Reset the singleton (useful for testing)

#### Instance Methods

- `getApp()` - Get the configured app instance from @mojkit/app-service

### Exported Functions

- `getAppDispatcher(): AppDispatcher` - Convenience function to get the singleton instance

### Exported Constants

- `app` - The configured app instance (direct export from @mojkit/app-service)

## Examples

### Example 1: Basic Command Call

```typescript
import { app } from "@mojkit/core/services/AppDispatcher";

async function createUser(name: string, email: string) {
  const result = await app.UserManagement.Users.createUser({
    name,
    email,
  });
  return result;
}
```

### Example 2: Command with Aggregate ID

```typescript
import { app } from "@mojkit/core/services/AppDispatcher";

async function updateUser(userId: string, data: any) {
  const result = await app.UserManagement.Users(userId).updateUser(data);
  return result;
}
```

### Example 3: Query Call

```typescript
import { app } from "@mojkit/core/services/AppDispatcher";

async function getActiveUsers() {
  const users = await app.UserManagement.Users.query
    .listUsers()
    .filterBy({ active: true })
    .limit(10);
  return users;
}
```

### Example 4: Using getApp() in a Service Class

```typescript
import { getAppDispatcher } from "@mojkit/core/services/AppDispatcher";

class UserService {
  private app;

  constructor() {
    this.app = getAppDispatcher().getApp();
  }

  async createUser(name: string, email: string) {
    return await this.app.UserManagement.Users.createUser({
      name,
      email,
    });
  }

  async getUser(userId: string) {
    return await this.app.UserManagement.Users(userId).query.getDetails();
  }
}
```

### Example 5: Testing with Reset

```typescript
import { describe, it, beforeEach } from "bun:test";
import { AppDispatcher } from "@mojkit/core/services/AppDispatcher";

describe("My Tests", () => {
  beforeEach(() => {
    // Reset the dispatcher before each test
    AppDispatcher.reset();
  });

  it("should work", async () => {
    // Your test code
  });
});
```

## Best Practices

1. **Use Direct Import**: For most cases, directly importing `app` is the simplest approach
2. **Initialize Once**: Call `AppDispatcher.initialize()` only once during application startup
3. **Reset in Tests**: Use `AppDispatcher.reset()` in test setup to ensure clean state
4. **Dependency Injection**: Use `getApp()` when you need to inject the app into classes

## Migration Guide

If you were previously using the app directly, no changes are needed:

```typescript
// Old way (still works)
import { app } from "@mojkit/core/services/AppDispatcher";

// New way (also works)
import { getAppDispatcher } from "@mojkit/core/services/AppDispatcher";
const app = getAppDispatcher().getApp();
```

Both approaches are valid and will work identically.
