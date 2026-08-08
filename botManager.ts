import mineflayer from "mineflayer";
import net from "net";
import dns from "dns";
import util from "util";

// ============ TYPES ============
interface BotInfo {
  id: string;
  username: string;
  password: string;
  status: "connecting" | "connected" | "disconnected" | "error" | "reconnecting" | "waiting";
  bot: any;
  message: string;
  connectedAt: Date | null;
  errorDetails?: string;
  reconnectAttempts: number;
  hasRegistered: boolean; // true = already registered before
  autoReconnectTimer?: ReturnType<typeof setTimeout>;
  autoChatTimer?: ReturnType<typeof setInterval>;
  moveInterval?: ReturnType<typeof setInterval>;
  lookInterval?: ReturnType<typeof setInterval>;
  jumpInterval?: ReturnType<typeof setInterval>;
  wInterval?: ReturnType<typeof setInterval>; // W key interval
  keepAliveInterval?: ReturnType<typeof setInterval>; // Keep-alive interval
  pendingReconnect?: boolean; // Prevent duplicate reconnect scheduling
}

interface SessionData {
  id: string;
  serverIp: string;
  serverPort: number;
  bots: BotInfo[];
  startedAt: Date;
  active: boolean;
  serverStatus: "online" | "offline" | "unknown" | "checking";
  serverVersion: string;
  mcVersion: string | boolean;
  chatLog: ChatMessage[];
  autoChatEnabled: boolean;
  currentConnectingIndex: number; // sequential bot connection index
}

interface ChatMessage {
  from: string;
  message: string;
  timestamp: Date;
}

// In-memory session storage
let currentSession: SessionData | null = null;

// ============ MALE TURKISH GAMER NAMES ============
const maleTurkishNames = [
  "Ahmet", "Mehmet", "Mustafa", "Ali", "Hasan", "Huseyin", "Ibrahim",
  "Ismail", "Yusuf", "Osman", "Omer", "Muhammed", "Emir", "Kerem",
  "Mert", "Polat", "Recep", "Selim", "Tarik", "Vural", "Yavuz",
  "Zafer", "Bugra", "Cagatay", "Furkan", "Gorkem", "Halil", "Oguzhan",
  "Sinan", "Talha", "Ugur", "Cem", "Berk", "Doruk", "Kaan", "Ozan",
  "Ruzgar", "Taha", "Umut", "Yigit", "Arda", "Baran", "Can", "Deniz",
  "Efe", "Batuhan", "Burak", "Emre", "Enes", "Gokhan", "Irfan",
  "Kağan", "Mahir", "Nevzat", "Orhan", "Ramazan", "Serkan", "Tuncay",
  "Veli", "Yasin", "Zeynel", "Akif", "Baris", "Caner", "Devrim",
  "Eray", "Ferhat", "Gurkan", "Hakan", "Ilker", "Kadir", "Levent",
  "Murat", "Nuri", "Pulat", "Rifat", "Serdar", "Timur", "Ulas",
  "Volkan", "Yunus", "Baba", "Reis", "Kral", "Patron",
];

const maleGameSuffixes = [
  "MC", "PvP", "Pro", "Gamer", "YT", "TV", "TR", "HD", "SMP",
  "Craft", "Play", "Gaming", "Real", "Boss", "King", "Master",
  "Legend", "Epic", "Elite", "Shadow", "Dark", "Fire", "Ice",
  "Storm", "Dragon", "Wolf", "Bear", "Eagle", "Lion", "Tiger",
  "Sniper", "Aim", "Headshot", "Critical", "Combo", "Rush",
  "War", "Battle", "Fight", "Strike", "Night", "Sky", "Ocean",
  "Star", "Moon", "Sun", "Steel", "Iron", "Gold",
  "Diamond", "Emerald", "Crystal", "Thunder",
  "OG", "Ninja", "Samurai", "Efsane", "Usta",
  "1", "2", "3", "7", "9", "42", "69", "99", "100",
];

function generateMaleTurkishUsername(): string {
  const name = maleTurkishNames[Math.floor(Math.random() * maleTurkishNames.length)];
  const suffix = maleGameSuffixes[Math.floor(Math.random() * maleGameSuffixes.length)];
  const patterns: (() => string)[] = [
    () => `${name}${suffix}`,
    () => `${name}${suffix}${Math.floor(Math.random() * 99) + 1}`,
    () => `x${name}${suffix}x`,
    () => `${name}${suffix}TR`,
    () => `${name}_${suffix}`,
    () => `${name.toLowerCase()}${suffix}`,
  ];
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  let username = pattern();
  if (username.length > 16) username = username.substring(0, 16);
  return username;
}

function generatePassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateUsername(mode: string, customName: string, index: number): string {
  if (mode === "custom" && customName.trim()) {
    const base = customName.trim();
    if (base.length + index.toString().length <= 16) {
      return `${base}${index}`;
    }
    return base.substring(0, 16 - index.toString().length) + index;
  }
  return generateMaleTurkishUsername();
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============ MOVEMENT SIMULATION ============
function startMovementSimulation(bot: any, botInfo: BotInfo): void {
  const lookDelay = 5000 + Math.random() * 5000;
  botInfo.lookInterval = setInterval(() => {
    if (botInfo.bot && botInfo.status === "connected") {
      try {
        bot.look(Math.random() * Math.PI * 2, -0.3 + Math.random() * 0.6, true);
      } catch { /* ignore */ }
    }
  }, lookDelay);
}

function startWKey(bot: any, botInfo: BotInfo): void {
  // Full W basılı - sürekli ileri git
  botInfo.wInterval = setInterval(() => {
    if (botInfo.bot && botInfo.status === "connected") {
      try {
        bot.setControlState("forward", true);
        bot.setControlState("sprint", true);
      } catch { /* ignore */ }
    }
  }, 1000);
}

function clearAllTimers(botInfo: BotInfo): void {
  if (botInfo.lookInterval) clearInterval(botInfo.lookInterval);
  if (botInfo.jumpInterval) clearInterval(botInfo.jumpInterval);
  if (botInfo.moveInterval) clearInterval(botInfo.moveInterval);
  if (botInfo.autoChatTimer) clearInterval(botInfo.autoChatTimer);
  if (botInfo.wInterval) clearInterval(botInfo.wInterval);
  if (botInfo.autoReconnectTimer) clearTimeout(botInfo.autoReconnectTimer);
  if (botInfo.keepAliveInterval) clearInterval(botInfo.keepAliveInterval);
  botInfo.lookInterval = undefined;
  botInfo.jumpInterval = undefined;
  botInfo.moveInterval = undefined;
  botInfo.autoChatTimer = undefined;
  botInfo.wInterval = undefined;
  botInfo.autoReconnectTimer = undefined;
  botInfo.keepAliveInterval = undefined;
  botInfo.pendingReconnect = false;
}

// ============ AUTO CHAT ============
const autoChatMessages = ["sa", "merhaba", "selam", "slm", "saas", "selamun aleykum", "iyi gunler", "naber", "napsiniz", "iyi oyunlar"];

function startAutoChat(bot: any, botInfo: BotInfo): void {
  const chatDelay = 30000 + Math.random() * 60000;
  botInfo.autoChatTimer = setInterval(() => {
    if (botInfo.bot && botInfo.status === "connected") {
      try {
        bot.chat(autoChatMessages[Math.floor(Math.random() * autoChatMessages.length)]);
      } catch { /* ignore */ }
    }
  }, chatDelay);
}

// ============ SEQUENTIAL BOT CONNECTION ============
function connectNextBot(): void {
  if (!currentSession || !currentSession.active) return;

  const nextIndex = currentSession.currentConnectingIndex;
  if (nextIndex >= currentSession.bots.length) return;

  const botInfo = currentSession.bots[nextIndex];

  // Skip bots that are already connecting or connected (e.g. from reconnect)
  if (botInfo.status === "connected" || botInfo.status === "connecting" || botInfo.status === "reconnecting") {
    currentSession.currentConnectingIndex++;
    connectNextBot(); // Try next bot
    return;
  }

  // Don't connect if this bot has a pending reconnect
  if (botInfo.pendingReconnect) {
    currentSession.currentConnectingIndex++;
    connectNextBot(); // Skip to next
    return;
  }

  currentSession.currentConnectingIndex++;

  // Update all subsequent bots to "waiting"
  for (let i = nextIndex + 1; i < currentSession.bots.length; i++) {
    if (currentSession!.bots[i].status !== "reconnecting" && currentSession!.bots[i].status !== "connected") {
      currentSession!.bots[i].status = "waiting";
      currentSession!.bots[i].message = `Sıra bekleniyor... (Sıra: ${i + 1}/${currentSession!.bots.length})`;
    }
  }

  botInfo.status = "connecting";
  botInfo.message = "Sunucuya bağlanıyor...";

  if (currentSession) {
    appendToChatLog(currentSession, "Sistem",
      `${botInfo.username} bağlanıyor... (${nextIndex + 1}/${currentSession.bots.length})`
    );
  }

  connectBot(botInfo, currentSession.serverIp, currentSession.serverPort, currentSession.id, currentSession.mcVersion);
}

// ============ AUTO RECONNECT ============
function scheduleAutoReconnect(botInfo: BotInfo): void {
  // 5 saniye aralıkla reconnect
  const delay = 5000;

  // Prevent duplicate reconnect scheduling
  if (botInfo.pendingReconnect) return;
  botInfo.pendingReconnect = true;

  botInfo.autoReconnectTimer = setTimeout(() => {
    botInfo.pendingReconnect = false;
    if (currentSession && currentSession.active) {
      botInfo.status = "reconnecting";
      botInfo.message = `Yeniden bağlanıyor... (${botInfo.reconnectAttempts + 1}. deneme)`;
      botInfo.reconnectAttempts++;

      if (currentSession) {
        appendToChatLog(currentSession, "Sistem",
          `${botInfo.username} yeniden bağlanıyor... (${botInfo.reconnectAttempts}. deneme)`
        );
      }

      connectBot(botInfo, currentSession.serverIp, currentSession.serverPort, currentSession.id, currentSession.mcVersion);
    }
  }, delay);
}

// ============ SLP (Server List Ping) PROTOCOL ============
function encodeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  do {
    let temp = value & 0x7f;
    value >>>= 7;
    if (value !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (value !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buffer: Buffer, offset: number): { value: number; size: number } {
  let value = 0, size = 0, shift = 0;
  while (true) {
    if (offset + size >= buffer.length) break;
    const byte = buffer[offset + size];
    value |= (byte & 0x7f) << shift;
    size++;
    if (!(byte & 0x80)) break;
    shift += 7;
    if (size > 5) break;
  }
  return { value, size };
}

const resolveSrv = util.promisify(dns.resolveSrv);

async function resolveMinecraftSrv(hostname: string): Promise<{ host: string; port: number } | null> {
  try {
    const records = await resolveSrv(`_minecraft._tcp.${hostname}`);
    if (records && records.length > 0) {
      return { host: records[0].name, port: records[0].port };
    }
  } catch { /* ignore */ }
  return null;
}

function parseMinecraftMotd(desc: any): string {
  if (typeof desc === "string") return desc;
  if (!desc) return "";

  const parts: string[] = [];

  function walkComponent(component: any): void {
    if (!component) return;
    if (typeof component === "string") {
      parts.push(component);
      return;
    }
    // If it has direct text
    if (typeof component.text === "string") {
      parts.push(component.text);
    }
    // If it has extra children
    if (Array.isArray(component.extra)) {
      for (const child of component.extra) {
        walkComponent(child);
      }
    }
  }

  walkComponent(desc);
  return parts.join("") || "";
}

function tryQuery(host: string, port: number): Promise<{
  online: boolean; motd: string; players: { max: number; online: number };
  version: string; protocol: number;
} | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000); // 3s timeout - more reliable for slow servers
    let resolved = false;
    const buffer: Buffer[] = [];
    let totalLen = 0;

    const done = (result: any) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(result);
    };

    socket.on("connect", () => {
      try {
        const hostBuffer = Buffer.from(host, "utf-8");
        const packetId = encodeVarInt(0x00);
        const protocolVarInt = encodeVarInt(-1); // -1 = auto-detect
        const serverAddr = Buffer.concat([encodeVarInt(hostBuffer.length), hostBuffer]);
        const serverPort = Buffer.alloc(2);
        serverPort.writeUInt16BE(port, 0);
        const nextState = Buffer.from([0x01]); // status
        const handshakePayload = Buffer.concat([packetId, protocolVarInt, serverAddr, serverPort, nextState]);
        const handshakePacket = Buffer.concat([encodeVarInt(handshakePayload.length), handshakePayload]);
        const statusRequest = Buffer.concat([encodeVarInt(1), Buffer.from([0x00])]);
        socket.write(Buffer.concat([handshakePacket, statusRequest]));
      } catch { done(null); }
    });

    socket.on("data", (data) => {
      buffer.push(data);
      totalLen += data.length;
      const fullData = Buffer.concat(buffer);

      try {
        let offset = 0;
        const { value: packetLen, size: varIntSize } = readVarInt(fullData, 0);
        offset += varIntSize;

        // Wait until we have the full packet
        if (fullData.length < varIntSize + packetLen) return;

        const pktId = fullData[offset];
        if (pktId === 0x00) {
          const { value: jsonLen, size: jsonLenSize } = readVarInt(fullData, offset + 1);

          // Wait until we have the full JSON
          if (offset + 1 + jsonLenSize + jsonLen > fullData.length) return;

          const jsonStr = fullData.slice(offset + 1 + jsonLenSize, offset + 1 + jsonLenSize + jsonLen).toString("utf-8");
          const parsed = JSON.parse(jsonStr);

          done({
            online: true,
            motd: parseMinecraftMotd(parsed.description),
            players: parsed.players || { max: 0, online: 0 },
            version: parsed.version?.name || "Unknown",
            protocol: parsed.version?.protocol || -1,
          });
        } else {
          done(null);
        }
      } catch { /* ignore parse errors */ }
    });

    socket.on("timeout", () => done(null));
    socket.on("error", () => done(null));
    socket.on("close", () => done(null));
    socket.connect(port, host);
  });
}

/**
 * Query a Minecraft server for status, player count, MOTD, and version.
 * Uses SLP (Server List Ping) protocol with proper TCP buffering.
 * Flow: SRV record → DNS lookup → common ports → parallel port scan
 */
async function queryMcServer(hostname: string, defaultPort: number): Promise<{
  online: boolean; motd: string; players: { max: number; online: number };
  version: string; protocol: number; detectedPort: number; resolvedHost: string;
} | null> {
  console.log(`[Port Bul] Querying: ${hostname}:${defaultPort}`);

  // Step 1: Try SRV record first
  let resolvedHost = hostname;
  const srvRecord = await resolveMinecraftSrv(hostname);
  if (srvRecord) {
    console.log(`[Port Bul] SRV record found: ${srvRecord.host}:${srvRecord.port}`);
    const result = await tryQuery(srvRecord.host, srvRecord.port);
    if (result) {
      console.log(`[Port Bul] Found via SRV at ${srvRecord.host}:${srvRecord.port}`);
      return { ...result, detectedPort: srvRecord.port, resolvedHost: srvRecord.host };
    }
  }

  // Step 2: DNS resolution fallback
  let dnsHost = hostname;
  try {
    const addresses = await util.promisify(dns.lookup)(hostname);
    if (addresses.address && addresses.address !== hostname) {
      resolvedHost = addresses.address;
      dnsHost = addresses.address;
      console.log(`[Port Bul] DNS resolved: ${hostname} → ${addresses.address}`);
    }
  } catch { /* ignore */ }

  // Step 3: Try default port with resolved host
  const r1 = await tryQuery(dnsHost, defaultPort);
  if (r1) {
    console.log(`[Port Bul] Found on ${dnsHost}:${defaultPort}`);
    return { ...r1, detectedPort: defaultPort, resolvedHost: dnsHost };
  }

  // Step 4: Try common Minecraft ports
  const commonPorts = [25565, 25566, 25567, 25568, 25569, 25570];
  for (const p of commonPorts) {
    if (p === defaultPort) continue;
    const r = await tryQuery(dnsHost, p);
    if (r) {
      console.log(`[Port Bul] Found on ${dnsHost}:${p} (common port)`);
      return { ...r, detectedPort: p, resolvedHost: dnsHost };
    }
  }

  // Step 5: Try original hostname on common ports (in case DNS resolution changed things)
  if (dnsHost !== hostname) {
    for (const p of [25565, 19132, 19133]) {
      const r = await tryQuery(hostname, p);
      if (r) {
        console.log(`[Port Bul] Found on ${hostname}:${p}`);
        return { ...r, detectedPort: p, resolvedHost: hostname };
      }
    }
  }

  // Step 6: Parallel port scan in smart ranges
  // Minecraft servers typically use ports in these ranges:
  const smartRanges = [
    { start: 25565, end: 25570 },   // Default MC range
    { start: 19132, end: 19140 },   // Bedrock/MCPE range
    { start: 10000, end: 10100 },   // Common game server range
    { start: 30000, end: 30100 },   // Another common range
    { start: 25000, end: 25100 },   // Game servers
    { start: 20000, end: 20100 },   // Game servers
    { start: 40000, end: 40100 },   // Game servers
  ];

  console.log(`[Port Bul] Starting parallel port scan in smart ranges...`);
  
  // Scan each range with parallel tries (20 ports at a time)
  for (const range of smartRanges) {
    const ports: number[] = [];
    for (let p = range.start; p <= range.end; p++) ports.push(p);

    const batchSize = 20;
    for (let i = 0; i < ports.length; i += batchSize) {
      const batch = ports.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(p => tryQuery(dnsHost, p)));
      for (let j = 0; j < results.length; j++) {
        if (results[j]) {
          console.log(`[Port Bul] Found on ${dnsHost}:${batch[j]}`);
          return { ...results[j]!, detectedPort: batch[j], resolvedHost: dnsHost };
        }
      }
    }
  }

  // Step 7: Full parallel scan 1000-65535 in batches of 200 (with 15s total timeout)
  console.log(`[Port Bul] Full parallel scan 1000-65535 (batches of 200, max 15s)...`);
  const FULL_BATCH = 200;
  const MAX_PORT = 65535;
  const SCAN_START_TIME = Date.now();
  const SCAN_MAX_DURATION = 15000; // 15 seconds max

  for (let start = 1000; start <= MAX_PORT; start += FULL_BATCH) {
    // Check if we've exceeded the time budget
    if (Date.now() - SCAN_START_TIME > SCAN_MAX_DURATION) {
      console.log(`[Port Bul] Full scan timeout after ${SCAN_MAX_DURATION}ms`);
      break;
    }

    const end = Math.min(start + FULL_BATCH, MAX_PORT);
    const ports: number[] = [];
    for (let p = start; p < end; p++) ports.push(p);

    // Give each batch a shorter timeout to stay within total budget
    const batchTimeout = Math.min(3000, SCAN_MAX_DURATION - (Date.now() - SCAN_START_TIME));
    const results = await Promise.race([
      Promise.all(ports.map(p => tryQuery(dnsHost, p))),
      new Promise<null[]>(resolve => setTimeout(() => resolve(new Array(ports.length).fill(null)), batchTimeout)),
    ]);

    for (let i = 0; i < results.length; i++) {
      if (results[i]) {
        console.log(`[Port Bul] Found on ${dnsHost}:${ports[i]} (full scan)`);
        return { ...results[i]!, detectedPort: ports[i], resolvedHost: dnsHost };
      }
    }
  }

  console.log(`[Port Bul] Port not found for ${hostname}`);
  return null;
}

function checkServerStatus(host: string, port: number): Promise<"online" | "offline"> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on("connect", () => { socket.destroy(); resolve("online"); });
    socket.on("timeout", () => { socket.destroy(); resolve("offline"); });
    socket.on("error", () => resolve("offline"));
    socket.connect(port, host);
  });
}

// Helper: append to chatLog with automatic truncation (max 200 entries)
function appendToChatLog(session: SessionData, from: string, message: string): void {
  if (!session) return;
  session.chatLog.push({ from, message, timestamp: new Date() });
  if (session.chatLog.length > 200) {
    session.chatLog = session.chatLog.slice(-200);
  }
}

// ============ MAIN BOT FUNCTIONS ============

export async function startBots(
  serverIp: string,
  serverPort: number,
  botCount: number,
  nameMode: string = "random",
  customName: string = "",
  mcVersion: string | boolean = false
): Promise<{ success: boolean; sessionId: string; bots: any[]; error?: string }> {
  // Stop existing session
  if (currentSession && currentSession.active) {
    await stopBots();
    await new Promise(r => setTimeout(r, 2000));
  }

  const sessionId = generateSessionId();
  const bots: BotInfo[] = [];

  currentSession = {
    id: sessionId,
    serverIp,
    serverPort,
    bots,
    startedAt: new Date(),
    active: true,
    serverStatus: "checking",
    serverVersion: "",
    mcVersion,
    chatLog: [],
    autoChatEnabled: true,
    currentConnectingIndex: 0,
  };

  // Check server status
  const status = await checkServerStatus(serverIp, serverPort);
  if (currentSession) {
    currentSession.serverStatus = status;
    appendToChatLog(currentSession, "Sistem",
      status === "online"
        ? `Sunucu ${serverIp}:${serverPort} erişilebilir.`
        : "Sunucuya TCP bağlantısı kurulamadı. Botlar deneyecek."
    );
  }

  // Create all bot info objects
  for (let i = 0; i < botCount; i++) {
    const username = generateUsername(nameMode, customName, i + 1);
    const password = generatePassword();
    bots.push({
      id: `bot_${i}`,
      username,
      password,
      status: i === 0 ? "connecting" : "waiting",
      bot: null,
      message: i === 0 ? "Sunucuya bağlanıyor..." : `Sıra bekleniyor... (${i + 1}/${botCount})`,
      connectedAt: null,
      errorDetails: undefined,
      reconnectAttempts: 0,
      hasRegistered: false,
      pendingReconnect: false,
    });
  }

  appendToChatLog(currentSession, "Sistem",
    `${botCount} bot oluşturuldu. Sıralı bağlantı başlatılıyor...`
  );

  // Start with first bot - advance index so connectNextBot picks the right next bot
  currentSession.currentConnectingIndex = 1;
  const firstBot = bots[0];
  firstBot.status = "connecting";
  firstBot.message = "Sunucuya bağlanıyor...";

  connectBot(firstBot, serverIp, serverPort, sessionId, mcVersion);

  return {
    success: true,
    sessionId,
    bots: bots.map(b => ({
      id: b.id,
      username: b.username,
      status: b.status,
      message: b.message,
      connectedAt: b.connectedAt,
      reconnectAttempts: b.reconnectAttempts,
    })),
  };
}

function connectBot(botInfo: BotInfo, host: string, port: number, sessionId: string, mcVersion: string | boolean = false): void {
  clearAllTimers(botInfo);

  // Cancel any existing bot connection
  if (botInfo.bot) {
    try { botInfo.bot.quit("Yeniden bağlanma"); } catch { /* ignore */ }
    botInfo.bot = null;
  }

  try {
    const bot: any = mineflayer.createBot({
      host,
      port,
      username: botInfo.username,
      auth: "offline",
      version: (mcVersion === false ? false : mcVersion) as any,
      keepAlive: true,
      chatLengthLimit: 256,
      hideErrors: false,
    });

    botInfo.bot = bot;

    let loginHandled = false;
    // On login (successfully connected)
    bot.on("login", () => {
      if (loginHandled) return; // Prevent duplicate login handling
      loginHandled = true;

      botInfo.status = "connected";
      botInfo.message = "Sunucuya giriş yapıldı!";
      botInfo.connectedAt = new Date();
      botInfo.errorDetails = undefined;
      botInfo.reconnectAttempts = 0;

      // Update session serverVersion from first successful login
      if (currentSession && !currentSession.serverVersion) {
        try {
          const clientVersion = (bot as any)._client?.version || '';
          if (clientVersion) {
            currentSession.serverVersion = clientVersion;
          }
        } catch { /* ignore */ }
      }

      if (currentSession) {
        appendToChatLog(currentSession, "Sistem", `${botInfo.username} sunucuya bağlandı!`);
      }

      startMovementSimulation(bot, botInfo);

      // Register or Login after 2s
      setTimeout(() => {
        if (!botInfo.bot) return; // Bot may have disconnected
        try {
          if (!botInfo.hasRegistered) {
            // First time: /register password password
            const pw = botInfo.password;
            bot.chat(`/register ${pw} ${pw}`);
            botInfo.hasRegistered = true;
            if (currentSession) {
              appendToChatLog(currentSession, "Sistem", `${botInfo.username} /register ${pw} ${pw}`);
            }
          } else {
            // Already registered: /login password
            bot.chat(`/login ${botInfo.password}`);
            if (currentSession) {
              appendToChatLog(currentSession, "Sistem", `${botInfo.username} /login ${botInfo.password}`);
            }
          }
        } catch { /* ignore */ }
      }, 2000);

      // After 5s: Full W basılı + auto chat
      setTimeout(() => {
        if (!botInfo.bot || botInfo.status !== "connected") return;
        try {
          startWKey(bot, botInfo);
          startAutoChat(bot, botInfo);
        } catch { /* ignore */ }
      }, 5000);

      // Trigger next bot in sequence after 1.5s delay + random jitter (anti-bot bypass)
      if (currentSession && currentSession.active) {
        const currentIdx = currentSession.bots.indexOf(botInfo);
        const nextIdx = currentIdx + 1;
        if (nextIdx < currentSession.bots.length) {
          const jitter = Math.floor(Math.random() * 2000); // 0-2s random jitter
          setTimeout(() => {
            if (currentSession?.active) {
              // Only advance sequential connection for the first-time sequence
              // (reconnects are handled separately)
              if (currentSession.currentConnectingIndex <= nextIdx) {
                connectNextBot();
              }
            }
          }, 1500 + jitter);
        }
      }
    });

    bot.on("spawn", () => {
      if (botInfo.status === "connected") {
        botInfo.message = "Oyunda!";
      }
    });

    bot.on("chat", (username: string, message: string) => {
      if (currentSession) {
        appendToChatLog(currentSession, username, message);
      }
    });

    let kickedHandled = false;
    bot.on("kicked", (reason: any) => {
      if (kickedHandled) return; // Prevent duplicate
      kickedHandled = true;

      // Clear all timers
      if (botInfo.lookInterval) clearInterval(botInfo.lookInterval);
      if (botInfo.wInterval) clearInterval(botInfo.wInterval);
      if (botInfo.autoChatTimer) clearInterval(botInfo.autoChatTimer);
      if (botInfo.keepAliveInterval) clearInterval(botInfo.keepAliveInterval);
      botInfo.bot = null;
      botInfo.status = "disconnected";

      let reasonText = parseKickReason(reason);
      botInfo.message = reasonText;
      botInfo.errorDetails = reasonText;

      if (currentSession) {
        appendToChatLog(currentSession, "Sistem", `${botInfo.username} atıldı: ${reasonText}`);
      }

      if (currentSession?.active) {
        scheduleAutoReconnect(botInfo);
      }
    });

    let errorHandled = false;
    bot.on("error", (err: any) => {
      if (errorHandled) return; // Prevent duplicate error handling
      errorHandled = true;

      const errorMsg = err.message || "Bağlantı hatası";
      console.log(`[Bot ${botInfo.username}] Error: ${errorMsg}`);

      if (errorMsg.includes("ECONNREFUSED")) {
        botInfo.message = "Sunucu kapalı veya port yanlış";
      } else if (errorMsg.includes("ETIMEDOUT")) {
        botInfo.message = "Bağlantı zaman aşımı";
      } else if (errorMsg.includes("ECONNRESET")) {
        botInfo.message = "Sunucu bağlantıyı sıfırladı (ECONNRESET)";
      } else if (errorMsg.includes("ENOTFOUND")) {
        botInfo.message = "DNS çözümü başarısız";
      } else if (errorMsg.includes("not authenticated") || errorMsg.includes("premium")) {
        botInfo.message = "Cracked mod açık değil";
      } else if (errorMsg.includes("whitelist")) {
        botInfo.message = "Whitelist kapalı değil";
      } else if (errorMsg.includes("end of stream")) {
        botInfo.message = "Sunucu bağlantıyı kapattı";
      } else {
        botInfo.message = errorMsg;
      }
      botInfo.errorDetails = errorMsg;

      if (currentSession) {
        appendToChatLog(currentSession, "Sistem", `${botInfo.username}: ${botInfo.message}`);
      }

      if (currentSession?.active) {
        botInfo.status = "disconnected";
        scheduleAutoReconnect(botInfo);
      }
    });

    let endHandled = false;
    bot.on("end", (reason: any) => {
      if (endHandled) return; // Prevent duplicate
      endHandled = true;

      // Clear all intervals - use clearAllTimers for consistency
      if (botInfo.lookInterval) clearInterval(botInfo.lookInterval);
      if (botInfo.wInterval) clearInterval(botInfo.wInterval);
      if (botInfo.autoChatTimer) clearInterval(botInfo.autoChatTimer);
      if (botInfo.keepAliveInterval) clearInterval(botInfo.keepAliveInterval);
      botInfo.bot = null;

      if (currentSession && currentSession.active && botInfo.status !== "disconnected" && botInfo.status !== "reconnecting") {
        botInfo.status = "disconnected";
        botInfo.message = "Bağlantı kapandı";
        botInfo.connectedAt = null;

        if (currentSession) {
          appendToChatLog(currentSession, "Sistem", `${botInfo.username} bağlantısı kapandı`);
        }

        scheduleAutoReconnect(botInfo);
      }
    });

    // Keep-alive ping 50-200ms arası (7/24) - stored in botInfo for proper cleanup
    botInfo.keepAliveInterval = setInterval(() => {
      if (botInfo.bot && botInfo.status === "connected") {
        try {
          bot._client.write("keep_alive", { id: Math.floor(Math.random() * 1000000) });
        } catch { /* ignore */ }
      }
    }, 50 + Math.floor(Math.random() * 151)); // 50-200ms arası (gerçek 200 dahil)

  } catch (err: any) {
    clearAllTimers(botInfo);
    botInfo.status = "error";
    botInfo.message = err.message || "Hata";
    console.error(`[Bot ${botInfo.username}] Create error:`, err);

    if (currentSession?.active) {
      scheduleAutoReconnect(botInfo);
    }
  }
}

function parseKickReason(obj: any): string {
  if (!obj) return "Bilinmeyen sebep";
  if (typeof obj === "string") {
    try {
      return extractTextFromChat(JSON.parse(obj));
    } catch {
      return obj;
    }
  }
  return extractTextFromChat(obj);
}

function extractTextFromChat(obj: any): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  if (obj.text && !obj.extra) return obj.text;
  let text = "";
  if (obj.text) text += obj.text;
  if (obj.extra && Array.isArray(obj.extra)) {
    for (const part of obj.extra) {
      text += extractTextFromChat(part);
    }
  }
  return text || "Bilinmeyen sebep";
}

export async function stopBots(): Promise<{ success: boolean; message: string }> {
  if (!currentSession || !currentSession.active) {
    return { success: true, message: "Aktif oturum yok" };
  }

  for (const botInfo of currentSession.bots) {
    clearAllTimers(botInfo);
    if (botInfo.bot) {
      try { botInfo.bot.quit("Oturum sonlandırıldı"); } catch { /* ignore */ }
    }
    botInfo.status = "disconnected";
    botInfo.message = "Durduruldu";
  }

  appendToChatLog(currentSession, "Sistem", "Tüm botlar durduruldu.");

  currentSession.active = false;
  const sessionId = currentSession.id;
  currentSession = null;

  return { success: true, message: `Oturum ${sessionId} sonlandırıldı` };
}

export async function sendChatMessage(message: string): Promise<{ success: boolean; message: string }> {
  if (!currentSession || !currentSession.active) {
    return { success: false, message: "Aktif oturum yok" };
  }

  let sentCount = 0;
  for (const botInfo of currentSession.bots) {
    if (botInfo.bot && botInfo.status === "connected") {
      try {
        botInfo.bot.chat(message);
        sentCount++;
      } catch { /* ignore */ }
    }
  }

  appendToChatLog(currentSession, "Sistem", `${sentCount} bot mesaj gönderdi: "${message}"`);

  return { success: true, message: `${sentCount} bot mesaj gönderdi` };
}

export function getSession(): { session: SessionData | null } {
  return { session: currentSession };
}

export function getActiveBotCount(): number {
  if (!currentSession || !currentSession.active) return 0;
  return currentSession.bots.filter(b => b.status === "connected").length;
}

interface BotStatus {
  id: string;
  username: string;
  status: "connecting" | "connected" | "disconnected" | "error" | "reconnecting" | "waiting";
  message: string;
  connectedAt: Date | null;
  errorDetails?: string;
}

export function getAllBotStatuses(): BotStatus[] {
  if (!currentSession || !currentSession.active) return [];
  return currentSession.bots.map(b => ({
    id: b.id,
    username: b.username,
    status: b.status,
    message: b.message,
    connectedAt: b.connectedAt,
    errorDetails: b.errorDetails,
  }));
}

export function getChatLog(): ChatMessage[] {
  if (!currentSession) return [];
  return currentSession.chatLog;
}

export function getServerStatus(): { status: "online" | "offline" | "unknown" | "checking"; version: string } {
  if (!currentSession) return { status: "unknown", version: "" };
  return { status: currentSession.serverStatus, version: currentSession.serverVersion };
}

export function reconnectBot(botId: string): Promise<{ success: boolean; message: string }> {
  if (!currentSession || !currentSession.active) {
    return Promise.resolve({ success: false, message: "Aktif oturum yok" });
  }

  const botInfo = currentSession.bots.find(b => b.id === botId);
  if (!botInfo) return Promise.resolve({ success: false, message: "Bot bulunamadı" });

  botInfo.status = "reconnecting";
  botInfo.message = "Yeniden bağlanıyor...";
  botInfo.reconnectAttempts++;
  clearAllTimers(botInfo);

  if (botInfo.bot) {
    try { botInfo.bot.quit("Yeniden bağlanma"); } catch { /* ignore */ }
  }

  connectBot(botInfo, currentSession.serverIp, currentSession.serverPort, currentSession.id, currentSession.mcVersion);
  return Promise.resolve({ success: true, message: `${botInfo.username} yeniden bağlanıyor...` });
}

// Export queryMcServer for use in routers
export { queryMcServer };
