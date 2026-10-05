import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import type { MojkitConfig } from "../../config/types.ts";
import { Config } from "../../config";
import { Bus } from "../../bus";
import { registerListeners } from "../../bus/listeners";
import { AppDispatcher } from "../../services/AppDispatcher";

/**
 * E2E tests for cross-instance command and query calls.
 *
 * These tests simulate multiple Mojkit instances communicating with each other
 * through commands and queries, similar to microservices architecture.
 *
 * Prerequisites:
 * - RabbitMQ must be running on localhost:5672
 * - Run: docker-compose -f ../bus/rabbitmq/docker-compose.test.yml up -d
 */

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

/**
 * Helper class to create and manage an independent Mojkit instance.
 *
 * This class provides a lightweight wrapper around the core Mojkit infrastructure
 * (Config, Bus, registerListeners) to enable multiple isolated instances for testing.
 * Each instance maintains its own configuration and bus connection while reusing
 * the production code paths.
 */
class MojkitInstance {
  private name: string;
  private config: MojkitConfig;

  constructor(name: string, config: MojkitConfig) {
    this.name = name;
    this.config = config;
  }

  /**
   * Initialize this Mojkit instance by:
   * 1. Loading the provided configuration
   * 2. Connecting to RabbitMQ
   * 3. Registering all command/query/event listeners
   *
   * This follows the same initialization flow as the main Mojkit class.
   */
  async initialize(): Promise<void> {
    // Load configuration (using the provided config directly)
    const configInstance = Config.getInstance();
    const resolvedConfig = await configInstance.load(this.config);

    // Same connection source as Mojkit.initialize: the resolved messageBus.
    await Bus.getInstance().initialize(resolvedConfig.messageBus);

    console.log(`✓ Instance ${this.name} connected to RabbitMQ`);

    // Register all listeners using the production registerListeners function
    await registerListeners(resolvedConfig);

    console.log(`✓ Instance ${this.name} registered all handlers`);
  }

  /**
   * Get the bus instance for sending commands/queries.
   */
  getBus() {
    return Bus.getInstance().get();
  }

  /**
   * Get the AppDispatcher instance for cross-domain calls.
   */
  getApp() {
    return AppDispatcher.getInstance();
  }

  /**
   * Shutdown this instance and clean up resources.
   */
  async shutdown(): Promise<void> {
    await Bus.getInstance().disconnect();

    // Reset singletons to allow next instance to initialize fresh
    Config.reset();
    Bus.reset();
    AppDispatcher.reset();

    console.log(`✓ Instance ${this.name} shut down`);
  }
}

// Check if RabbitMQ is available
let rabbitmqAvailable = false;

describe("Cross-instance E2E Tests", () => {
  let instanceA: MojkitInstance | null = null;
  let instanceB: MojkitInstance | null = null;

  beforeAll(async () => {
    // Test RabbitMQ connectivity
    try {
      const configInstance = Config.getInstance();
      await configInstance.load({ domains: {}, messageBus: {} });

      await Bus.getInstance().initialize({
        url: RABBITMQ_URL,
        prefetchCount: 1,
      });

      await Bus.getInstance().disconnect();

      // Reset after test
      Config.reset();
      Bus.reset();

      rabbitmqAvailable = true;
      console.log("✓ RabbitMQ is available");
    } catch (error) {
      console.warn("⚠ RabbitMQ is not available. Tests will be skipped.");
      console.warn("  To run these tests, start RabbitMQ:");
      console.warn("  cd ../bus/rabbitmq && docker-compose -f docker-compose.test.yml up -d");
      rabbitmqAvailable = false;
    }
  });

  afterEach(async () => {
    if (instanceA) {
      await instanceA.shutdown();
      instanceA = null;
    }
    if (instanceB) {
      await instanceB.shutdown();
      instanceB = null;
    }
  });

  describe("Command calls between instances", () => {
    it("should call command from instance B to instance A", async () => {
      if (!rabbitmqAvailable) {
        console.log("⊘ Skipping test - RabbitMQ not available");
        return;
      }

      const configA: MojkitConfig = {
        domains: {
          "NamespaceA": {
            commands: {
              command1: async (message: any) => {
                return { foo: "bar", receivedPayload: message };
              },
            },
          },
        },
        messageBus: {},
      };

      const configB: MojkitConfig = {
        domains: {},
        messageBus: {},
      };

      instanceA = new MojkitInstance("InstanceA", configA);
      await instanceA.initialize();

      instanceB = new MojkitInstance("InstanceB", configB);
      await instanceB.initialize();

      await new Promise(resolve => setTimeout(resolve, 500));

      const result = await instanceB.getBus().sendCommand({
        kind: "command",
        namespace: "NamespaceA",
        name: "command1",
        payload: { test: "data" },
        awaitResponse: true,
      });

      expect(result).toBeDefined();
      expect(result.foo).toBe("bar");
      expect(result.receivedPayload.test).toBe("data");
    }, 15000);

    it("should handle command with context", async () => {
      if (!rabbitmqAvailable) {
        console.log("⊘ Skipping test - RabbitMQ not available");
        return;
      }

      const configA: MojkitConfig = {
        domains: {
          "NamespaceA": {
            commands: {
              commandWithContext: async (message: any, context: any) => {
                return {
                  receivedPayload: message,
                  receivedUserId: context.busMessage.message.body.extensions.userId,
                  receivedAggregateId: context.busMessage.message.body.extensions.aggregateId,
                  hasExecutionContext: !!context.busMessage,
                  hasAppDispatcher: !!context.app,
                };
              },
            },
          },
        },
        messageBus: {},
      };

      const configB: MojkitConfig = {
        domains: {},
        messageBus: {},
      };

      instanceA = new MojkitInstance("InstanceA", configA);
      await instanceA.initialize();

      instanceB = new MojkitInstance("InstanceB", configB);
      await instanceB.initialize();

      await new Promise(resolve => setTimeout(resolve, 500));

      const result = await instanceB.getBus().sendCommand({
        kind: "command",
        namespace: "NamespaceA",
        name: "commandWithContext",
        payload: { data: "test" },
        context: { userId: "user-123", aggregateId: "agg-456" },
        awaitResponse: true,
      });

      expect(result).toBeDefined();
      expect(result.receivedPayload.data).toBe("test");
      expect(result.receivedUserId).toBe("user-123");
      expect(result.receivedAggregateId).toBe("agg-456");
      expect(result.hasExecutionContext).toBe(true);
      expect(result.hasAppDispatcher).toBe(true);
    }, 15000);
  });

  describe("Query calls between instances", () => {
    it("should call query from instance B to instance A", async () => {
      if (!rabbitmqAvailable) {
        console.log("⊘ Skipping test - RabbitMQ not available");
        return;
      }

      const configA: MojkitConfig = {
        domains: {
          "NamespaceA": {
            queries: {
              query1: async (message: any) => {
                return { userId: message.userId, name: "John Doe" };
              },
            },
          },
        },
        messageBus: {},
      };

      const configB: MojkitConfig = {
        domains: {},
        messageBus: {},
      };

      instanceA = new MojkitInstance("InstanceA", configA);
      await instanceA.initialize();

      instanceB = new MojkitInstance("InstanceB", configB);
      await instanceB.initialize();

      await new Promise(resolve => setTimeout(resolve, 500));

      const result = await instanceB.getBus().sendQuery({
        kind: "query",
        namespace: "NamespaceA",
        name: "query1",
        payload: {
          methods: [
            { name: '', args: [{ userId: "user-123" }] }
          ]
        },
      });

      expect(result).toBeDefined();
      expect(result.userId).toBe("user-123");
      expect(result.name).toBe("John Doe");
    }, 15000);
  });

  describe("Chained command calls", () => {
    it("should handle A->B->A command chain", async () => {
      if (!rabbitmqAvailable) {
        console.log("⊘ Skipping test - RabbitMQ not available");
        return;
      }

      const configA: MojkitConfig = {
        domains: {
          "NamespaceA": {
            commands: {
              step1: async (message: any) => {
                console.log({ a: message })
                return { step: 1, data: message.data + "-step1" };
              },
            },
          },
        },
        messageBus: {},
      };

      const configB: MojkitConfig = {
        domains: {
          "NamespaceB": {
            commands: {
              step2: async (message: any, context: any) => {
                console.log({ b: message })
                // Instance B calls back to Instance A using AppDispatcher
                const result1 = await instanceB?.getBus().sendCommand({
                  kind: "command",
                  namespace: "NamespaceA",
                  name: "step1",
                  payload: { data: message.data },
                  awaitResponse: true,
                });
                return { step: 2, data: result1.data + "-step2" };
              },
            },
          },
        },
        messageBus: {},
      };

      instanceA = new MojkitInstance("InstanceA", configA);
      await instanceA.initialize();

      instanceB = new MojkitInstance("InstanceB", configB);
      await instanceB.initialize();

      await new Promise(resolve => setTimeout(resolve, 500));

      // A calls B, B calls A
      const result = await instanceA.getBus().sendCommand({
        kind: "command",
        namespace: "NamespaceB",
        name: "step2",
        payload: { data: "start" },
        awaitResponse: true,
      });

      expect(result).toBeDefined();
      expect(result.step).toBe(2);
      expect(result.data).toBe("start-step1-step2");
    }, 15000);
  });

  describe("Error handling in cross-instance calls", () => {
    it("should propagate errors from called commands", async () => {
      if (!rabbitmqAvailable) {
        console.log("⊘ Skipping test - RabbitMQ not available");
        return;
      }

      const configA: MojkitConfig = {
        domains: {
          "NamespaceA": {
            commands: {
              failingCommand: async () => {
                throw new Error("Command failed intentionally");
              },
            },
          },
        },
        messageBus: {},
      };

      const configB: MojkitConfig = {
        domains: {},
        messageBus: {},
      };

      instanceA = new MojkitInstance("InstanceA", configA);
      await instanceA.initialize();

      instanceB = new MojkitInstance("InstanceB", configB);
      await instanceB.initialize();

      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        await instanceB.getBus().sendCommand({
          kind: "command",
          namespace: "NamespaceA",
          name: "failingCommand",
          payload: {},
          awaitResponse: true,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toContain("Command failed intentionally");
      }
    }, 15000);

    it("should propagate SerializableError with context", async () => {
      if (!rabbitmqAvailable) {
        console.log("⊘ Skipping test - RabbitMQ not available");
        return;
      }

      // Import SerializableError
      const { SerializableError } = await import("../../bus/errors");

      const configA: MojkitConfig = {
        domains: {
          "NamespaceA": {
            commands: {
              validationCommand: async () => {
                throw new SerializableError(
                  "Invalid email format",
                  "VALIDATION_ERROR",
                  { field: "email", value: "invalid" }
                );
              },
            },
          },
        },
        messageBus: {},
      };

      const configB: MojkitConfig = {
        domains: {},
        messageBus: {},
      };

      instanceA = new MojkitInstance("InstanceA", configA);
      await instanceA.initialize();

      instanceB = new MojkitInstance("InstanceB", configB);
      await instanceB.initialize();

      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        await instanceB.getBus().sendCommand({
          kind: "command",
          namespace: "NamespaceA",
          name: "validationCommand",
          payload: {},
          awaitResponse: true,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toBe("Invalid email format");
        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.context).toBeDefined();
        expect(error.context.field).toBe("email");
        expect(error.context.value).toBe("invalid");
      }
    }, 15000);
  });

  describe("Query with method chaining", () => {
    it("should handle explicit query name with method chain", async () => {
      if (!rabbitmqAvailable) {
        console.log("⊘ Skipping test - RabbitMQ not available");
        return;
      }

      const configA: MojkitConfig = {
        domains: {
          "UserManagement": {
            queries: {
              users: async (userId: string, context: any) => {
                console.log('--------------> first test!!!')
                // First method is getUserInfo with userId
                expect(userId).toBe("user-123");
                expect(context.methods).toBeDefined();
                expect(context.methods.length).toBe(1);
                expect(context.methods[0].method).toBe("select");
                expect(context.methods[0].args).toEqual(["mobile"]);

                return { id: userId, name: "John", mobile: "555-1234" };
              },
            },
          },
        },
        messageBus: {},
      };

      const configB: MojkitConfig = {
        domains: {},
        messageBus: {},
      };

      instanceA = new MojkitInstance("InstanceA", configA);
      await instanceA.initialize();

      instanceB = new MojkitInstance("InstanceB", configB);
      await instanceB.initialize();

      await new Promise(resolve => setTimeout(resolve, 500));

      const result = await instanceB.getBus().sendQuery({
        kind: "query",
        namespace: "UserManagement",
        name: "users",
        payload: {
          methods: [
            { method: "getUserInfo", args: ["user-123"] },
            { method: "select", args: ["mobile"] },
          ],
        },
      });

      expect(result).toBeDefined();
      expect(result.id).toBe("user-123");
      expect(result.mobile).toBe("555-1234");
    }, 15000);

    it("should handle inferred query name pattern", async () => {
      if (!rabbitmqAvailable) {
        console.log("⊘ Skipping test - RabbitMQ not available");
        return;
      }

      const configA: MojkitConfig = {
        domains: {
          "UserManagement": {
            queries: {
              getUserInfo: async (userId: string, context: any) => {
                // Inferred pattern: first method has empty string
                expect(userId).toBe("user-456");
                expect(context.methods).toBeDefined();
                expect(context.methods.length).toBe(1);
                expect(context.methods[0].method).toBe("select");

                return { id: userId, name: "Jane", email: "jane@example.com" };
              },
            },
          },
        },
        messageBus: {},
      };

      const configB: MojkitConfig = {
        domains: {},
        messageBus: {},
      };

      instanceA = new MojkitInstance("InstanceA", configA);
      await instanceA.initialize();

      instanceB = new MojkitInstance("InstanceB", configB);
      await instanceB.initialize();

      await new Promise(resolve => setTimeout(resolve, 500));

      const result = await instanceB.getBus().sendQuery({
        kind: "query",
        namespace: "UserManagement",
        name: "getUserInfo",
        payload: {
          methods: [
            { method: "", args: ["user-456"] },
            { method: "select", args: ["email"] },
          ],
        },
      });

      expect(result).toBeDefined();
      expect(result.id).toBe("user-456");
      expect(result.email).toBe("jane@example.com");
    }, 15000);

    it("should handle class-based query handler with method invocation", async () => {
      if (!rabbitmqAvailable) {
        console.log("⊘ Skipping test - RabbitMQ not available");
        return;
      }

      class UsersQueryHandler {
        app: any;

        async getUserInfo(userId: string, context: any) {
          console.log({ userId, context });
          expect(userId).toBe("user-789");
          expect(context.methods).toBeDefined();

          return {
            id: userId,
            name: "Bob",
            role: "admin",
            handlerType: "class"
          };
        }
      }

      const configA: MojkitConfig = {
        domains: {
          "UserManagement": {
            queries: {
              users: UsersQueryHandler,
            },
          },
        },
        messageBus: {},
      };

      const configB: MojkitConfig = {
        domains: {},
        messageBus: {},
      };

      instanceA = new MojkitInstance("InstanceA", configA);
      await instanceA.initialize();

      instanceB = new MojkitInstance("InstanceB", configB);
      await instanceB.initialize();

      await new Promise(resolve => setTimeout(resolve, 500));

      const result = await instanceB.getBus().sendQuery({
        kind: "query",
        namespace: "UserManagement",
        name: "users",
        payload: {
          methods: [
            { method: "getUserInfo", args: ["user-789"] },
          ],
        },
      });

      expect(result).toBeDefined();
      expect(result.id).toBe("user-789");
      expect(result.handlerType).toBe("class");
    }, 15000);
  });
});
