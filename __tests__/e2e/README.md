# E2E Tests for Cross-Instance Communication

This directory contains end-to-end tests that verify communication between multiple Mojkit instances, simulating a microservices architecture.

## Overview

These tests create **truly independent Mojkit instances**, each with:
- Its own RabbitMQ bus connection
- Its own configuration
- Its own registered command/query handlers
- Its own lifecycle management

## Prerequisites

### RabbitMQ

The tests require a running RabbitMQ instance.

## Running the Tests

### Run all e2e tests:
```bash
bun test __tests__/e2e/cross-instance.test.ts
```

### Run a specific test:
```bash
bun test __tests__/e2e/cross-instance.test.ts --test-name-pattern "should call command from instance B to instance A"
```

## Test Architecture

### MojkitInstance Class

Each test creates independent `MojkitInstance` objects:

```typescript
class MojkitInstance {
  private bus: MojkitTransport;
  private config: MojkitConfig;
  private name: string;

  async initialize(): Promise<void>
  async shutdown(): Promise<void>
  getBus(): MojkitTransport
  getConfig(): MojkitConfig
}
```

### Test Pattern

```typescript
// Instance A - provides services
const configA: MojkitConfig = {
  domains: {
    "NamespaceA": {
      commands: {
        command1: async (payload: any) => {
          return { foo: "bar", receivedPayload: payload };
        },
      },
    },
  },
};

// Instance B - consumes services
const configB: MojkitConfig = {
  domains: {}, // No local handlers
};

// Initialize both instances
instanceA = new MojkitInstance("InstanceA", configA);
await instanceA.initialize();

instanceB = new MojkitInstance("InstanceB", configB);
await instanceB.initialize();

// Instance B calls Instance A's command via RabbitMQ
const result = await instanceB.getBus().sendCommand({
  kind: "command",
  namespace: "NamespaceA",
  name: "command1",
  payload: { data: "test" },
  awaitResponse: true,
});
```

## Test Coverage

### Command Calls Between Instances
- ✅ Basic command call from instance B to instance A
- ✅ Commands with aggregateId
- ✅ Commands with event awaiting (TODO)

### Query Calls Between Instances
- ✅ Basic query call from instance B to instance A
- ✅ Query chains (TODO)
- ✅ Queries with aggregateId (TODO)

### Mixed Command and Query Calls
- ✅ Sequential command calls (orchestration)
- ✅ Parallel command calls (TODO)
- ✅ Both commands and queries in same handler (TODO)

### Error Handling
- ✅ Error propagation from called commands
- ✅ Timeout handling (TODO)

### Complex Scenarios
- ✅ Three-way instance communication (TODO)
- ✅ Circular dependency detection (TODO)

## Troubleshooting

### Tests are being skipped

If you see:
```
⚠ RabbitMQ is not available. Tests will be skipped.
```

This means the test couldn't connect to RabbitMQ. Check:
1. Is RabbitMQ running? `docker ps | grep rabbitmq`
2. Is port 5672 accessible? `nc -zv localhost 5672`
3. Are you running from outside the sandbox?

### Connection refused errors

```
error: connect ECONNREFUSED 127.0.0.1:5672
```

This means RabbitMQ is not running or not accessible. Start it with:
```bash
cd ../bus/rabbitmq && docker-compose -f docker-compose.test.yml up -d
```

### Tests timeout

If tests timeout, increase the timeout in the test:
```typescript
it("test name", async () => {
  // test code
}, 30000); // 30 second timeout
```

## Key Differences from Unit Tests

1. **Real RabbitMQ**: Uses actual RabbitMQ message broker, not mocks
2. **Independent Instances**: Each instance has its own bus connection
3. **Async Communication**: Tests real message passing between instances
4. **Network Latency**: Tests include delays for message propagation
5. **Error Propagation**: Tests real error handling across network boundaries

## Future Enhancements

- [ ] Add tests for event-driven communication (sagas)
- [ ] Add tests for query chains
- [ ] Add tests for parallel command execution
- [ ] Add tests for circuit breaker patterns
- [ ] Add tests for retry mechanisms
- [ ] Add performance benchmarks
- [ ] Add tests for connection recovery
