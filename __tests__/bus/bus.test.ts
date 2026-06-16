import { describe, it, expect, beforeEach } from "bun:test";
import { Bus } from "../../bus/index.ts";

beforeEach(() => {
  Bus.reset();
});

describe("Bus", () => {
  describe("Singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = Bus.getInstance();
      const instance2 = Bus.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should return a fresh instance after reset", () => {
      const instance1 = Bus.getInstance();
      Bus.reset();
      const instance2 = Bus.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Status checking", () => {
    it("should return false when not initialized", () => {
      const bus = Bus.getInstance();
      expect(bus.isInitialized()).toBe(false);
    });
  });

  describe("Getting transport", () => {
    it("should throw error if not initialized", () => {
      const bus = Bus.getInstance();
      expect(() => bus.get()).toThrow(
        "Bus has not been initialized. Call Bus.getInstance().initialize() first.",
      );
    });
  });

  describe("Disconnect", () => {
    it("should not throw if disconnect is called when not initialized", async () => {
      const bus = Bus.getInstance();
      // Should not throw
      await bus.disconnect();
    });
  });

  describe("Reset", () => {
    it("should clear the singleton instance", () => {
      const instance1 = Bus.getInstance();
      Bus.reset();
      const instance2 = Bus.getInstance();
      expect(instance1).not.toBe(instance2);
    });

    it("should allow reinitialization after reset", () => {
      Bus.getInstance();
      Bus.reset();
      const newInstance = Bus.getInstance();
      expect(newInstance).toBeDefined();
      expect(newInstance.isInitialized()).toBe(false);
    });
  });
});
