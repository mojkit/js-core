import { describe, it, expect, beforeEach } from "bun:test";
import type { ResolvedMojkitConfig } from "../../config/types";

// We can't fully test registerListeners without mocking the bus
// But we can test the parseEventName logic by extracting it

describe("Bus Listeners", () => {
  describe("Event name parsing", () => {
    it("should parse full event name correctly", () => {
      // This tests the logic that would be used in parseEventName
      const fullEventName = "UserManagement.Auth.UserLoggedIn";
      const lastDotIndex = fullEventName.lastIndexOf(".");

      const namespace = fullEventName.substring(0, lastDotIndex);
      const eventName = fullEventName.substring(lastDotIndex + 1);

      expect(namespace).toBe("UserManagement.Auth");
      expect(eventName).toBe("UserLoggedIn");
    });

    it("should parse event name with single namespace", () => {
      const fullEventName = "Auth.UserLoggedIn";
      const lastDotIndex = fullEventName.lastIndexOf(".");

      const namespace = fullEventName.substring(0, lastDotIndex);
      const eventName = fullEventName.substring(lastDotIndex + 1);

      expect(namespace).toBe("Auth");
      expect(eventName).toBe("UserLoggedIn");
    });

    it("should parse event name with multiple dots in namespace", () => {
      const fullEventName = "Company.Department.Team.Auth.UserLoggedIn";
      const lastDotIndex = fullEventName.lastIndexOf(".");

      const namespace = fullEventName.substring(0, lastDotIndex);
      const eventName = fullEventName.substring(lastDotIndex + 1);

      expect(namespace).toBe("Company.Department.Team.Auth");
      expect(eventName).toBe("UserLoggedIn");
    });

    it("should handle event name without dots as invalid", () => {
      const fullEventName = "UserLoggedIn";
      const lastDotIndex = fullEventName.lastIndexOf(".");

      expect(lastDotIndex).toBe(-1);
    });
  });

  describe("Configuration structure", () => {
    it("should have correct domain config structure", () => {
      const config: ResolvedMojkitConfig = {
        domains: {
          "User.Auth": {
            commands: {
              login: { handler: async () => {} },
              logout: { handler: async () => {} },
            },
            queries: {
              "User.Auth.GetUser": { handler: async () => {} },
            },
            sagas: {
              "UserManagement.Auth.UserLoggedIn": {},
            },
          },
        },
        service: {
          name: "test-service",
          environment: "test",
        },
        messageBus: {},
      };

      expect(config.domains["User.Auth"]?.commands).toBeDefined();
      expect(config.domains["User.Auth"]?.queries).toBeDefined();
      expect(config.domains["User.Auth"]?.sagas).toBeDefined();
      expect(
        Object.keys(config.domains["User.Auth"]?.commands ?? {}),
      ).toHaveLength(2);
    });
  });
});
