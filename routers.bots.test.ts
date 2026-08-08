import { describe, expect, it, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { stopBots } from "./botManager";

function createTestContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("bots router", () => {
  afterEach(async () => {
    await stopBots();
  });

  describe("bots.start", () => {
    it("should start bots with valid input", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.bots.start({
        serverIp: "localhost",
        serverPort: 25565,
        botCount: 3,
        nameMode: "random",
        customName: "",
      });

      expect(result.success).toBe(true);
      expect(result.bots.length).toBe(3);
      expect(result.sessionId).toBeDefined();
    });

    it("should start bots with custom name mode", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.bots.start({
        serverIp: "localhost",
        serverPort: 25565,
        botCount: 3,
        nameMode: "custom",
        customName: "Test",
      });

      expect(result.success).toBe(true);
      expect(result.bots.length).toBe(3);
      for (const bot of result.bots) {
        expect(bot.username).toContain("Test");
      }
    });

    it("should reject empty serverIp", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await expect(
        caller.bots.start({
          serverIp: "",
          serverPort: 25565,
          botCount: 3,
          nameMode: "random",
          customName: "",
        })
      ).rejects.toThrow();
    });

    it("should reject botCount below 1", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await expect(
        caller.bots.start({
          serverIp: "localhost",
          serverPort: 25565,
          botCount: 0,
          nameMode: "random",
          customName: "",
        })
      ).rejects.toThrow();
    });

    it("should reject botCount above 100", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await expect(
        caller.bots.start({
          serverIp: "localhost",
          serverPort: 25565,
          botCount: 101,
          nameMode: "random",
          customName: "",
        })
      ).rejects.toThrow();
    });

    it("should accept mcVersion parameter", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.bots.start({
        serverIp: "localhost",
        serverPort: 25565,
        botCount: 2,
        nameMode: "random",
        customName: "",
        mcVersion: "1.20.4",
      });

      expect(result.success).toBe(true);
    });

    it("should accept auto mcVersion", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.bots.start({
        serverIp: "localhost",
        serverPort: 25565,
        botCount: 2,
        nameMode: "random",
        customName: "",
        mcVersion: "auto",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("bots.stop", () => {
    it("should stop bots and return success", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await caller.bots.start({
        serverIp: "localhost",
        serverPort: 25565,
        botCount: 3,
        nameMode: "random",
        customName: "",
      });

      const result = await caller.bots.stop();
      expect(result.success).toBe(true);
    });

    it("should return success when no active session", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.bots.stop();
      expect(result.success).toBe(true);
    });
  });

  describe("bots.status", () => {
    it("should return null session when no bots active", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.bots.status();
      expect(result.session).toBeNull();
      expect(result.activeBotCount).toBe(0);
    });

    it("should return session info when bots are running", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await caller.bots.start({
        serverIp: "test.aternos.me",
        serverPort: 25565,
        botCount: 5,
        nameMode: "random",
        customName: "",
      });

      const result = await caller.bots.status();
      expect(result.session).not.toBeNull();
      expect(result.session!.serverIp).toBe("test.aternos.me");
      expect(result.session!.botCount).toBe(5);
    });
  });

  describe("bots.botStatuses", () => {
    it("should return empty array when no session", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.bots.botStatuses();
      expect(result).toEqual([]);
    });

    it("should return bot statuses after start", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await caller.bots.start({
        serverIp: "localhost",
        serverPort: 25565,
        botCount: 4,
        nameMode: "random",
        customName: "",
      });

      const result = await caller.bots.botStatuses();
      expect(result.length).toBe(4);
      for (const bot of result) {
        expect(bot.id).toBeDefined();
        expect(bot.username).toBeDefined();
        expect(bot.status).toBeDefined();
        expect(bot.message).toBeDefined();
      }
    });
  });
});
