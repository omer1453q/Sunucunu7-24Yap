import mineflayer from "mineflayer";

console.log("Test bot connecting to Aternos...");

const bot = mineflayer.createBot({
  host: process.argv[2] || "localhost",
  port: parseInt(process.argv[3]) || 25565,
  username: "TestBot_Debug",
  auth: "offline",
  version: process.argv[4] || false,
});

bot.on("login", () => {
  console.log("✅ Login successful!");
  bot.chat("/list");
});

bot.on("spawn", () => {
  console.log("✅ Spawn successful! Bot is in the game.");
});

bot.on("chat", (username, message) => {
  console.log(`[Chat] ${username}: ${message}`);
});

bot.on("error", (err) => {
  console.log("❌ Error:", err.message);
});

bot.on("end", (reason) => {
  console.log("❌ Disconnected:", reason || "unknown reason");
});

bot.on("kicked", (reason) => {
  console.log("❌ Kicked:", typeof reason === "string" ? reason : JSON.stringify(reason));
});

bot.on("connect", () => {
  console.log("📡 TCP connected to server");
});

bot.on("packet", (packet) => {
  // Log first few packets for debugging
});

setTimeout(() => {
  console.log("Bot is alive, status:", bot.session ? "authenticated" : "waiting");
  if (bot._client) {
    console.log("Client state:", bot._client.state);
  }
}, 5000);

setTimeout(() => {
  console.log("Exiting...");
  bot.quit();
  process.exit(0);
}, 15000);
