import { describe, it, expect, beforeEach } from "bun:test";
import { AppDispatcher, app, getAppDispatcher } from "../../services/AppDispatcher.ts";

describe("AppDispatcher", () => {
  beforeEach(() => {
    AppDispatcher.reset();
  });

  describe("Singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = AppDispatcher.getInstance();
      const instance2 = AppDispatcher.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should return a fresh instance after reset", () => {
      const instance1 = AppDispatcher.getInstance();
      AppDispatcher.reset();
      const instance2 = AppDispatcher.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("getApp() method", () => {
    it("should return the app instance", () => {
      const dispatcher = AppDispatcher.getInstance();
      const appInstance = dispatcher.getApp();
      
      expect(appInstance).toBeDefined();
      expect(appInstance).toBe(app);
    });

    it("should return the same app instance across multiple calls", () => {
      const dispatcher = AppDispatcher.getInstance();
      const app1 = dispatcher.getApp();
      const app2 = dispatcher.getApp();
      
      expect(app1).toBe(app2);
    });
  });

  describe("getAppDispatcher() function", () => {
    it("should return an AppDispatcher instance", () => {
      const dispatcher = getAppDispatcher();
      expect(dispatcher).toBeDefined();
      expect(dispatcher).toBeInstanceOf(AppDispatcher);
    });

    it("should return the same instance as getInstance()", () => {
      const instance1 = AppDispatcher.getInstance();
      const instance2 = getAppDispatcher();
      expect(instance1).toBe(instance2);
    });

    it("should have getApp() method", () => {
      const dispatcher = getAppDispatcher();
      expect(dispatcher.getApp).toBeDefined();
      expect(typeof dispatcher.getApp).toBe("function");
    });

    it("should return app from getApp()", () => {
      const dispatcher = getAppDispatcher();
      const appInstance = dispatcher.getApp();
      expect(appInstance).toBe(app);
    });
  });

  describe("Usage patterns", () => {
    it("should allow accessing app via getInstance().getApp()", () => {
      const appInstance = AppDispatcher.getInstance().getApp();
      expect(appInstance).toBeDefined();
    });

    it("should allow accessing app via getAppDispatcher().getApp()", () => {
      const appInstance = getAppDispatcher().getApp();
      expect(appInstance).toBeDefined();
    });

    it("should allow direct import of app", () => {
      expect(app).toBeDefined();
    });

    it("all three methods should return the same app instance", () => {
      const app1 = AppDispatcher.getInstance().getApp();
      const app2 = getAppDispatcher().getApp();
      const app3 = app;
      
      expect(app1).toBe(app2);
      expect(app2).toBe(app3);
    });
  });
});
