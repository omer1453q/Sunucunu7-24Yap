import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  startBots,
  stopBots,
  getSession,
  getActiveBotCount,
  getAllBotStatuses,
  sendChatMessage,
  getChatLog,
  getServerStatus,
  reconnectBot,
  queryMcServer,
} from "./botManager";
import { z } from "zod";

// Minecraft versions 1.20 to 26.2 (Java Edition) - verified from minecraft-data v3.111.0
export const SUPPORTED_VERSIONS = [
  // 1.20.x - Trails & Tales
  "1.20", "1.20.1", "1.20.2", "1.20.3", "1.20.4", "1.20.5", "1.20.6",
  // 1.21.x - Tricky Trials & beyond
  "1.21", "1.21.1", "1.21.2", "1.21.3", "1.21.4", "1.21.5", "1.21.6",
  "1.21.7", "1.21.8", "1.21.11",
  // 26.x - New versioning system (Mounts of Mayhem)
  "26.1", "26.1.1", "26.1.2", "26.2",
] as const;

export type McVersion = typeof SUPPORTED_VERSIONS[number] | "auto";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  bots: router({
    // Start bots on a server
    start: publicProcedure
      .input(
        z.object({
          serverIp: z.string().min(1, "Sunucu IP gerekli"),
          serverPort: z.number().int().min(1).max(65535).default(25565),
          botCount: z.number().int().min(1).max(100).default(10),
          nameMode: z.enum(["random", "custom"]).default("random"),
          customName: z.string().max(16).default(""),
          mcVersion: z.enum(["auto", ...SUPPORTED_VERSIONS]).default("auto"),
        })
      )
      .mutation(async ({ input }) => {
        const versionParam: string | boolean = input.mcVersion === "auto" ? false : input.mcVersion;
        const result = await startBots(
          input.serverIp,
          input.serverPort,
          input.botCount,
          input.nameMode,
          input.customName,
          versionParam
        );
        return result;
      }),

    // Stop all bots
    stop: publicProcedure.mutation(async () => {
      const result = await stopBots();
      return result;
    }),

    // Get current session info
    status: publicProcedure.query(() => {
      const session = getSession();
      const serverStatus = getServerStatus();
      return {
        session: session.session
          ? {
              id: session.session.id,
              serverIp: session.session.serverIp,
              serverPort: session.session.serverPort,
              bots: session.session.bots.map(b => ({
                id: b.id,
                username: b.username,
                status: b.status,
                message: b.message,
                connectedAt: b.connectedAt,
              })),
              botCount: session.session.bots.length,
              activeBotCount: session.session.bots.filter(b => b.status === "connected").length,
              startedAt: session.session.startedAt,
              active: session.session.active,
              mcVersion: session.session.mcVersion,
              autoChatEnabled: session.session.autoChatEnabled,
            }
          : null,
        activeBotCount: getActiveBotCount(),
        serverStatus: serverStatus.status,
        serverVersion: serverStatus.version,
      };
    }),

    // Get all bot statuses
    botStatuses: publicProcedure.query(() => {
      return getAllBotStatuses();
    }),

    // Send chat message from all connected bots
    sendChat: publicProcedure
      .input(
        z.object({
          message: z.string().min(1).max(256, "Mesaj 256 karakterden kısa olmalı"),
        })
      )
      .mutation(async ({ input }) => {
        return sendChatMessage(input.message);
      }),

    // Get chat log
    chatLog: publicProcedure.query(() => {
      return getChatLog();
    }),

    // Reconnect a specific bot
    reconnect: publicProcedure
      .input(
        z.object({
          botId: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        return reconnectBot(input.botId);
      }),

    // Query server info (SLP) - auto-detect port, version, players
    queryServer: publicProcedure
      .input(
        z.object({
          serverIp: z.string().min(1),
          serverPort: z.number().int().min(1).max(65535).default(25565),
        })
      )
      .mutation(async ({ input }) => {
        const result = await queryMcServer(input.serverIp, input.serverPort);
        if (!result) {
          return {
            success: false,
            message: "Sunucuya bağlanılamadı. IP veya port yanlış olabilir.",
            serverInfo: null,
          };
        }
        return {
          success: true,
          message: "Sunucu bulundu!",
          serverInfo: {
            motd: result.motd,
            players: result.players,
            version: result.version,
            protocol: result.protocol,
            online: true,
            detectedPort: result.detectedPort,
          },
        };
      }),

    // Get supported versions list
    getVersions: publicProcedure.query(() => {
      return {
        versions: SUPPORTED_VERSIONS,
        defaultVersion: "auto",
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
