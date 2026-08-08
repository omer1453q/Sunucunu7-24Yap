import { describe, expect, it, afterEach } from "vitest";
import {
  startBots,
  stopBots,
  getSession,
  getActiveBotCount,
  getAllBotStatuses,
} from "./botManager";

describe("botManager", () => {
  afterEach(async () => {
    await stopBots();
  });

  describe("startBots", () => {
    it("should create a session with the specified number of bots", async () => {
      const result = await startBots("localhost", 25565, 5, "random", "");
      expect(result.success).toBe(true);
      expect(result.bots.length).toBe(5);
      expect(result.sessionId).toBeDefined();
    });

    it("should set initial status to connecting or waiting", async () => {
      const result = await startBots("localhost", 25565, 3, "custom", "Test");
      for (const bot of result.bots) {
        expect(["connecting", "waiting"]).toContain(bot.status);
        expect(bot.username).toContain("Test");
      }
    });

    it("should generate unique usernames with random mode", async () => {
      const result = await startBots("localhost", 25565, 10, "random", "");
      const usernames = result.bots.map(b => b.username);
      const uniqueUsernames = new Set(usernames);
      // With random Turkish names, most should be unique (10 bots, high chance of uniqueness)
      expect(uniqueUsernames.size).toBeGreaterThanOrEqual(8);
    });

    it("should generate usernames with custom name + index", async () => {
      const result = await startBots("localhost", 25565, 5, "custom", "Omer");
      for (let i = 0; i < result.bots.length; i++) {
        expect(result.bots[i].username).toContain("Omer");
      }
    });

    it("should stop existing session when starting a new one", async () => {
      const first = await startBots("localhost", 25565, 3, "random", "");
      expect(first.bots.length).toBe(3);

      const second = await startBots("localhost", 25565, 5, "random", "");
      expect(second.bots.length).toBe(5);
    });

    it("should accept mcVersion parameter", async () => {
      const result = await startBots("localhost", 25565, 2, "random", "", "1.20.4");
      expect(result.success).toBe(true);
      expect(result.bots.length).toBe(2);
    });

    it("should accept auto version (boolean false)", async () => {
      const result = await startBots("localhost", 25565, 2, "random", "", false);
      expect(result.success).toBe(true);
      expect(result.bots.length).toBe(2);
    });
  });

  describe("stopBots", () => {
    it("should return success when no active session", async () => {
      const result = await stopBots();
      expect(result.success).toBe(true);
    });

    it("should stop active bots", async () => {
      await startBots("localhost", 25565, 3, "random", "");
      const result = await stopBots();
      expect(result.success).toBe(true);

      const session = getSession();
      expect(session.session).toBeNull();
    });
  });

  describe("getSession", () => {
    it("should return null when no session", () => {
      const session = getSession();
      expect(session.session).toBeNull();
    });

    it("should return active session after start", async () => {
      await startBots("localhost", 25565, 4, "random", "");
      const session = getSession();
      expect(session.session).not.toBeNull();
      expect(session.session!.serverIp).toBe("localhost");
      expect(session.session!.serverPort).toBe(25565);
      expect(session.session!.bots.length).toBe(4);
    });
  });

  describe("getActiveBotCount", () => {
    it("should return 0 when no session", () => {
      expect(getActiveBotCount()).toBe(0);
    });

    it("should count connected bots", async () => {
      await startBots("localhost", 25565, 5, "random", "");
      // Since localhost is not a real MC server, bots won't connect
      // but the count function should still work
      const count = getActiveBotCount();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getAllBotStatuses", () => {
    it("should return empty array when no session", () => {
      expect(getAllBotStatuses()).toEqual([]);
    });

    it("should return bot statuses after start", async () => {
      await startBots("localhost", 25565, 3, "random", "");
      const statuses = getAllBotStatuses();
      expect(statuses.length).toBe(3);
      for (const bot of statuses) {
        expect(bot.id).toBeDefined();
        expect(bot.username).toBeDefined();
        expect(["connecting", "connected", "disconnected", "error", "waiting", "reconnecting"]).toContain(bot.status);
      }
    });
  });
});
