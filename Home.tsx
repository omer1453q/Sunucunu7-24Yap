import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Play,
  Square,
  Server,
  Activity,
  Loader2,
  Globe,
  Send,
  Bot,
  ShieldCheck,
  User,
  Shuffle,
  ExternalLink,
  Sparkles,
  Wifi,
  WifiOff,
  Zap,
  Users,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  Heart,
  Youtube,
  Instagram,
  Music,
  Hash,
} from "lucide-react";

type BotStatusType = "connecting" | "connected" | "disconnected" | "error" | "reconnecting" | "waiting";

interface BotStatus {
  id: string;
  username: string;
  status: BotStatusType;
  message: string;
  connectedAt: any;
  errorDetails?: string;
}

interface ChatEntry {
  from: string;
  message: string;
  timestamp: any;
}

// Parse chat message - extract text from JSON/compound format
function parseChatMessage(msg: string): string {
  if (!msg) return "";
  // If it looks like JSON, try to parse it
  if (msg.startsWith('{') || msg.startsWith('[')) {
    try {
      const parsed = JSON.parse(msg);
      return extractText(parsed);
    } catch {
      return msg;
    }
  }
  return msg;
}

function extractText(obj: any): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  let text = "";
  if (obj.text) text += obj.text;
  if (obj.extra && Array.isArray(obj.extra)) {
    for (const part of obj.extra) {
      text += extractText(part);
    }
  }
  return text;
}

function StatusBadge({ status }: { status: BotStatusType }) {
  const config: Record<BotStatusType, { bg: string; text: string; label: string; dot: string }> = {
    waiting: { bg: "bg-gray-500/20", text: "text-gray-400", label: "Bekliyor", dot: "bg-gray-400" },
    connecting: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "Bağlanıyor", dot: "bg-yellow-400" },
    connected: { bg: "bg-green-500/20", text: "text-green-400", label: "Bağlı", dot: "bg-green-400 animate-pulse" },
    disconnected: { bg: "bg-gray-500/20", text: "text-gray-400", label: "Tekrar Deneniyor", dot: "bg-gray-400" },
    error: { bg: "bg-orange-500/20", text: "text-orange-400", label: "Hata - Tekrarlanıyor", dot: "bg-orange-400 animate-pulse" },
    reconnecting: { bg: "bg-blue-500/20", text: "text-blue-400", label: "Tekrar Bağlanıyor", dot: "bg-blue-400 animate-pulse" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function BotCard({ bot, index }: { bot: BotStatus; index: number }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/50 hover:border-primary/30 transition-all duration-200">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${
          bot.status === "connected" ? "bg-green-500/20 text-green-400" :
          bot.status === "waiting" ? "bg-gray-500/20 text-gray-400" :
          bot.status === "connecting" || bot.status === "reconnecting" ? "bg-yellow-500/20 text-yellow-400" :
          bot.status === "error" ? "bg-orange-500/20 text-orange-400" :
          "bg-gray-500/20 text-gray-400"
        }`}>
          #{index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{bot.username}</p>
          <p className="text-xs text-muted-foreground truncate">{bot.message}</p>
        </div>
      </div>
      <StatusBadge status={bot.status} />
    </div>
  );
}

// Supported MC versions - loaded from backend to stay in sync
const MC_VERSIONS_FALLBACK = [
  "auto",
  "1.20", "1.20.1", "1.20.2", "1.20.3", "1.20.4", "1.20.5", "1.20.6",
  "1.21", "1.21.1", "1.21.2", "1.21.3", "1.21.4", "1.21.5", "1.21.6",
  "1.21.7", "1.21.8", "1.21.11",
  "26.1", "26.1.1", "26.1.2", "26.2",
];

export default function Home() {
  const [serverIp, setServerIp] = useState("");
  const [botCount, setBotCount] = useState("10");
  const [nameMode, setNameMode] = useState<"random" | "custom">("random");
  const [customName, setCustomName] = useState("Oyuncu");
  const [mcVersion, setMcVersion] = useState("auto");
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isQueryingServer, setIsQueryingServer] = useState(false);
  const [autoDetectedPort, setAutoDetectedPort] = useState<number | null>(null);
  const [autoDetectedVersion, setAutoDetectedVersion] = useState<string>("");
  const [autoDetectedPlayers, setAutoDetectedPlayers] = useState({ online: 0, max: 0 });
  const [autoDetectedMotd, setAutoDetectedMotd] = useState("");
  const [activeTab, setActiveTab] = useState<"players" | "chat">("players");
  // Port mode: "auto" = use detected port, "manual" = use user-entered port
  const [portMode, setPortMode] = useState<"auto" | "manual">("auto");
  const [manualPort, setManualPort] = useState("25565");

  const utils = trpc.useUtils();

  const startMutation = trpc.bots.start.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`${data.bots.length} oyuncu başlatıldı!`);
      } else {
        toast.error(data.error || "Başlatılamadı");
      }
      setIsStarting(false);
      utils.bots.status.invalidate();
      utils.bots.botStatuses.invalidate();
      utils.bots.chatLog.invalidate();
    },
    onError: (err) => {
      toast.error("Hata: " + err.message);
      setIsStarting(false);
    },
  });

  const stopMutation = trpc.bots.stop.useMutation({
    onSuccess: () => {
      toast.success("Tüm oyuncular durduruldu!");
      setIsStopping(false);
      setAutoDetectedPort(null);
      setAutoDetectedVersion("");
      utils.bots.status.invalidate();
      utils.bots.botStatuses.invalidate();
      utils.bots.chatLog.invalidate();
    },
    onError: (err) => {
      toast.error("Durdurma hatası: " + err.message);
      setIsStopping(false);
    },
  });

  const chatMutation = trpc.bots.sendChat.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setIsSendingChat(false);
      utils.bots.chatLog.invalidate();
    },
    onError: (err) => {
      toast.error("Mesaj gönderilemedi: " + err.message);
      setIsSendingChat(false);
    },
  });

  // Query server (auto-detect port + version)
  const queryServerMutation = trpc.bots.queryServer.useMutation({
    onSuccess: (data) => {
      setIsQueryingServer(false);
      if (data.success && data.serverInfo) {
        setAutoDetectedPort(data.serverInfo.detectedPort);
        setAutoDetectedVersion(data.serverInfo.version);
        setAutoDetectedPlayers(data.serverInfo.players);
        setAutoDetectedMotd(data.serverInfo.motd);
        toast.success(`Sunucu bulundu! Port: ${data.serverInfo.detectedPort} | Sürüm: ${data.serverInfo.version}`);
      } else {
        toast.error("Sunucu bulunamadı. IP adresini kontrol et.");
      }
    },
    onError: (err) => {
      setIsQueryingServer(false);
      toast.error("Sunucu sorgulanamadı: " + err.message);
    },
  });

  // Poll status every 3s
  const { data: statusData } = trpc.bots.status.useQuery(undefined, {
    refetchInterval: 3000,
  });

  const { data: botStatuses } = trpc.bots.botStatuses.useQuery(undefined, {
    refetchInterval: 3000,
  });

  const { data: chatLog } = trpc.bots.chatLog.useQuery(undefined, {
    refetchInterval: 5000,
  });

  // Load supported versions from backend
  const { data: versionsData } = trpc.bots.getVersions.useQuery(undefined);
  const MC_VERSIONS = versionsData?.versions || MC_VERSIONS_FALLBACK;

  // If there's an active session on page load, set the IP field
  useEffect(() => {
    if (statusData?.session?.serverIp && !serverIp) {
      setServerIp(statusData.session.serverIp);
      setBotCount(String(statusData.session.botCount));
    }
  }, [statusData?.session?.serverIp, serverIp]);

  const handleQueryServer = useCallback(() => {
    if (!serverIp.trim()) {
      toast.error("Önce sunucu IP adresini yaz!");
      return;
    }
    setIsQueryingServer(true);
    setAutoDetectedPort(null);
    setAutoDetectedVersion("");
    toast.info("Port aranıyor... Bu birkaç saniye sürebilir.", { duration: 3000 });
    queryServerMutation.mutate({
      serverIp: serverIp.trim(),
      serverPort: 25565,
    });
  }, [serverIp, queryServerMutation]);

  const handleStart = useCallback(() => {
    if (!serverIp.trim()) {
      toast.error("Sunucu IP adresi gerekli!");
      return;
    }
    const count = parseInt(botCount);
    if (count < 1 || count > 100) {
      toast.error("Oyuncu sayısı 1-100 arasında olmalı!");
      return;
    }
    if (nameMode === "custom" && !customName.trim()) {
      toast.error("Özel oyuncu ismi gerekli!");
      return;
    }
    const port = portMode === "auto"
      ? (autoDetectedPort || 25565)
      : (parseInt(manualPort) || 25565);
    setIsStarting(true);
    startMutation.mutate({
      serverIp: serverIp.trim(),
      serverPort: port,
      botCount: count,
      nameMode,
      customName: nameMode === "custom" ? customName.trim() : "",
      mcVersion: mcVersion as any,
    });
  }, [serverIp, botCount, nameMode, customName, mcVersion, autoDetectedPort, portMode, manualPort, startMutation]);

  const handleStop = useCallback(() => {
    setIsStopping(true);
    stopMutation.mutate();
  }, [stopMutation]);

  const handleSendChat = useCallback(() => {
    if (!chatMessage.trim()) {
      toast.error("Mesaj boş olamaz!");
      return;
    }
    setIsSendingChat(true);
    chatMutation.mutate({ message: chatMessage.trim() });
    setChatMessage("");
  }, [chatMessage, chatMutation]);

  const hasActiveSession = statusData?.session != null;
  const activeBotCount = statusData?.activeBotCount ?? 0;
  const totalBotCount = statusData?.session?.botCount ?? 0;

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog?.length]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">MC 7/24 Panel</h1>
              <p className="text-xs text-muted-foreground">Minecraft Sunucu 7/24 Aktif Aracı</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasActiveSession && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm">
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                <span>{activeBotCount}/{totalBotCount} Oyuncu Aktif</span>
              </div>
            )}
            {hasActiveSession && statusData?.serverStatus && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                statusData.serverStatus === "online" ? "bg-green-500/10 text-green-400" :
                statusData.serverStatus === "offline" ? "bg-red-500/10 text-red-400" :
                statusData.serverStatus === "checking" ? "bg-yellow-500/10 text-yellow-400" :
                "bg-gray-500/10 text-gray-400"
              }`}>
                {statusData.serverStatus === "online" ? <Wifi className="w-3 h-3" /> :
                 statusData.serverStatus === "offline" ? <WifiOff className="w-3 h-3" /> :
                 <Loader2 className="w-3 h-3 animate-spin" />}
                {statusData.serverStatus === "online" ? "Sunucu Açık" :
                 statusData.serverStatus === "offline" ? "Sunucu Kapalı" :
                 statusData.serverStatus === "checking" ? "Kontrol Ediliyor..." : "Bilinmiyor"}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 flex-1 space-y-6">
        {/* Hero Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Zap className="w-4 h-4" />
            Sunucunu 7/24 Açık Tut
          </div>
          <h2 className="text-3xl font-bold tracking-tight">
            Sunucunu <span className="text-primary">7/24 Açık Tut</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto text-sm">
            IP adresini yaz, port otomatik bulunur, oyuncu sayısını seç ve başlat.
            Sunucunu 7/24 açık tut, hiçbir şey indirmene gerek yok!
          </p>
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Control Panel */}
          <Card className="border-border/50 lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="w-5 h-5 text-primary" />
                Sunucu Aktif Tutma Paneli
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* IP Input + Port Bul */}
              <div className="space-y-2">
                <Label htmlFor="server-ip">Sunucu IP Adresi</Label>
                <div className="flex gap-2">
                  <Input
                    id="server-ip"
                    placeholder="ornek.aternos.me"
                    value={serverIp}
                    onChange={(e) => setServerIp(e.target.value)}
                    className="h-11"
                    disabled={hasActiveSession}
                  />
                  <Button
                    variant="outline"
                    onClick={handleQueryServer}
                    disabled={hasActiveSession || isQueryingServer || !serverIp.trim()}
                    className="h-11 px-4 whitespace-nowrap"
                  >
                    {isQueryingServer ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Globe className="w-4 h-4 mr-2" />
                    )}
                    Port Bul
                  </Button>
                </div>
              </div>

              {/* Auto-detected server info */}
              {autoDetectedPort && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-sm space-y-1">
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="font-medium">Sunucu Bulundu!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="text-muted-foreground/70">Port:</span>{" "}
                      <span className="text-green-400 font-medium">{autoDetectedPort}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/70">Sürüm:</span>{" "}
                      <span className="text-green-400 font-medium">{autoDetectedVersion}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/70">Oyuncular:</span>{" "}
                      <span className="text-green-400 font-medium">{autoDetectedPlayers.online}/{autoDetectedPlayers.max}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/70">MOTD:</span>{" "}
                      <span className="text-green-400 font-medium">{autoDetectedMotd?.substring(0, 30)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Bot Count & Name Mode & Version */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bot-count">Aktif Oyuncu Sayısı</Label>
                  <Input
                    id="bot-count"
                    type="number"
                    min={1}
                    max={100}
                    value={botCount}
                    onChange={(e) => setBotCount(e.target.value)}
                    className="h-11"
                    disabled={hasActiveSession}
                    placeholder="1-100"
                  />
                  <p className="text-[10px] text-muted-foreground">1 ile 100 arasında bir sayı gir</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Oyuncu İsmi
                  </Label>
                  <RadioGroup
                    value={nameMode}
                    onValueChange={(v) => setNameMode(v as "random" | "custom")}
                    disabled={hasActiveSession}
                    className="flex gap-1"
                  >
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border/50 cursor-pointer hover:border-primary/30 transition-all flex-1 has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                      <RadioGroupItem value="random" className="sr-only" id="name-random" />
                      <Label htmlFor="name-random" className="flex items-center gap-1.5 cursor-pointer text-xs font-medium">
                        <Shuffle className="w-3.5 h-3.5 text-primary" />
                        Rastgele
                      </Label>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border/50 cursor-pointer hover:border-primary/30 transition-all flex-1 has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                      <RadioGroupItem value="custom" className="sr-only" id="name-custom" />
                      <Label htmlFor="name-custom" className="flex items-center gap-1.5 cursor-pointer text-xs font-medium">
                        <User className="w-3.5 h-3.5 text-primary" />
                        El ile
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mc-version">
                    <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                    MC Sürümü
                  </Label>
                  <Select value={mcVersion} onValueChange={setMcVersion} disabled={hasActiveSession}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Seç..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        <span className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-yellow-400" />
                          Otomatik Algıla
                        </span>
                      </SelectItem>
                      {MC_VERSIONS.filter(v => v !== "auto").map(v => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Port Mode Selection */}
              <div className="space-y-2">
                <Label>Port Ayarı</Label>
                <div className="flex gap-1">
                  <Button
                    variant={portMode === "auto" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPortMode("auto")}
                    disabled={hasActiveSession}
                    className="flex-1 h-10"
                  >
                    <Globe className="w-3.5 h-3.5 mr-1.5" />
                    Otomatik ({autoDetectedPort || "Port Bul Kullan"})
                  </Button>
                  <Button
                    variant={portMode === "manual" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPortMode("manual")}
                    disabled={hasActiveSession}
                    className="flex-1 h-10"
                  >
                    <Hash className="w-3.5 h-3.5 mr-1.5" />
                    Manuel
                  </Button>
                </div>
                {portMode === "manual" && (
                  <Input
                    placeholder="Port (örn: 25565)"
                    value={manualPort}
                    onChange={(e) => setManualPort(e.target.value.replace(/\D/g, ""))}
                    className="h-10 mt-2"
                    disabled={hasActiveSession}
                  />
                )}
              </div>

              {/* Custom Name Input */}
              {nameMode === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="custom-name">Özel Oyuncu İsmi</Label>
                  <Input
                    id="custom-name"
                    placeholder="Oyuncu ismi (max 16 karakter)"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value.slice(0, 16))}
                    className="h-11"
                    disabled={hasActiveSession}
                    maxLength={16}
                  />
                  <p className="text-xs text-muted-foreground">
                    Her oyuncunun adına numara eklenecek (örn: "Oyuncu1", "Oyuncu2"). Max 16 karakter.
                  </p>
                </div>
              )}

              {/* Random name preview */}
              {nameMode === "random" && (
                <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-xs text-green-300/80">
                  <p className="font-medium mb-1">Rastgele Erkek İsimleri:</p>
                  <p>Her oyuncu için gerçekçi Türk erkek isimleri otomatik oluşturulur (HasanMC, AliPvP, BabaPro, VeliCPvP vb.)</p>
                </div>
              )}

              {/* Version Info */}
              <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300/80">
                <p className="font-medium mb-1">Desteklenen Sürümler:</p>
                <p>1.20'den 26.2'ye kadar tüm Minecraft sürümleri desteklenir. "Otomatik Algıla" seçeneği sunucunun versiyonunu otomatik tespit eder.</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleStart}
                  disabled={hasActiveSession || isStarting}
                  size="lg"
                  className="flex-1 h-12 text-base font-semibold"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Başlatılıyor...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 mr-2" />
                      {hasActiveSession ? "Sunucu Aktif" : "Sunucuyu Aktif Et"}
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleStop}
                  disabled={!hasActiveSession || isStopping}
                  variant="destructive"
                  size="lg"
                  className="h-12 text-base font-semibold"
                >
                  {isStopping ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Durduruluyor...
                    </>
                  ) : (
                    <>
                      <Square className="w-5 h-5 mr-2" />
                      Durdur
                    </>
                  )}
                </Button>
              </div>

              {/* Active Session Info */}
              {hasActiveSession && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>7/24 Çalışıyor - Otomatik Yeniden Bağlanma (5sn) - Sıralı Bağlantı Aktif</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Sunucu Adresi</p>
                      <p className="text-sm font-medium">{statusData?.session?.serverIp}:{statusData?.session?.serverPort}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sunucu Durumu</p>
                      <p className={`text-sm font-medium ${
                        statusData?.serverStatus === "online" ? "text-green-400" :
                        statusData?.serverStatus === "offline" ? "text-red-400" :
                        "text-yellow-400"
                      }`}>
                        {statusData?.serverStatus === "online" ? "Çevrimiçi" :
                         statusData?.serverStatus === "offline" ? "Çevrimdışı" :
                         statusData?.serverStatus === "checking" ? "Kontrol Ediliyor" : "Bilinmiyor"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sunucu Sürümü</p>
                      <p className="text-sm font-medium">
                        {statusData?.serverVersion || "Belirlenemedi"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Seçilen MC Sürümü</p>
                      <p className="text-sm font-medium">
                        {statusData?.session?.mcVersion === false ? "Otomatik" : statusData?.session?.mcVersion || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Toplam Oyuncu</p>
                      <p className="text-sm font-medium">{totalBotCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Aktif Oyuncu</p>
                      <p className="text-sm font-medium text-green-400">{activeBotCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Başlangıç</p>
                      <p className="text-sm font-medium">
                        {statusData?.session?.startedAt ? new Date(statusData.session.startedAt).toLocaleTimeString("tr-TR") : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Başarı Oranı</p>
                      <p className="text-sm font-medium text-primary">
                        {totalBotCount > 0 ? Math.round((activeBotCount / totalBotCount) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Tips & Info */}
          <div className="space-y-4">
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-400" />
                  Nasıl Kullanılır?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">1</span>
                  <p>Aternos panelinden sunucunu aç ve Cracked modunu aç</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">2</span>
                  <p>IP adresini yaz ve "Port Bul" butonuna bas (otomatik port bulur)</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">3</span>
                  <p>Oyuncu sayısını (1-100) yaz ve sürümü seç</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">4</span>
                  <p>"Sunucuyu Aktif Et" butonuna tıkla</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">5</span>
                  <p>Oyuncular sırayla girer, /register ve /login yapar, W basılı tutar</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-400" />
                  Önemli Notlar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <p>• Aternos sunucu ayarlarında <strong>Cracked</strong> modu açık olmalı</p>
                <p>• Aternos sunucunu manuel aç (Başlat butonu)</p>
                <p>• Oyuncular sırayla girer - 1 oyuncu girmeden 2. girmez</p>
                <p>• İlk girişte /register, sonraki girişlerde /login yapar</p>
                <p>• Register sonrası oyuncular sürekli ileri (W) gider</p>
                <p>• 5 saniye aralıkla otomatik yeniden bağlanır</p>
                <p>• Port otomatik bulunur veya manuel girebilirsin</p>
                <p>• Oyuncular chat'e otomatik sa/merhaba/selam yazar</p>
              </CardContent>
            </Card>

            {/* Features */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-400" />
                  Özellikler
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>Sıralı oyuncu girişi (1 girmeden 2 girmez)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>Otomatik /register ve /login</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>Full W basılı tutma (register sonrası)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>5 saniye aralıkla otomatik reconnect</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>Port otomatik/manuelseçimi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>Max 100 oyuncu - sayı ile yazma</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>Chat'e otomatik sa/merhaba/selam</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>7/24 çalışma + 50-200ms ping (gerçekçi)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>Gerçekçi Türk erkek isimleri</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>1.20 - 26.2 tüm Java sürümleri</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bots & Chat Tabs */}
        {hasActiveSession && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-5 h-5 text-primary" />
                Oyuncular & Sohbet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "players" | "chat")}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="players">
                    <Bot className="w-3.5 h-3.5 mr-1.5" />
                    Oyuncu Durumları ({activeBotCount}/{totalBotCount})
                  </TabsTrigger>
                  <TabsTrigger value="chat">
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    Sohbet
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="players" className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto pr-2">
                    {botStatuses?.map((bot: BotStatus, i: number) => (
                      <BotCard key={bot.id} bot={bot} index={i} />
                    ))}
                  </div>
                  {(!botStatuses || botStatuses.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Oyuncular henüz başlatılmadı
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="chat" className="space-y-3">
                  {/* Chat messages */}
                  <div className="h-64 overflow-y-auto rounded-lg bg-muted/30 border border-border/30 p-3 space-y-2">
                    {chatLog?.map((entry: ChatEntry, i: number) => (
                      <div key={i} className="text-xs">
                        <span className={`font-medium ${
                          entry.from === "Sistem" ? "text-yellow-400" : "text-primary"
                        }`}>
                          {entry.from}:
                        </span>{" "}
                        <span className="text-muted-foreground">{parseChatMessage(entry.message)}</span>
                        <span className="text-muted-foreground/50 ml-2 text-[10px]">
                          {new Date(entry.timestamp).toLocaleTimeString("tr-TR")}
                        </span>
                      </div>
                    ))}
                    {(!chatLog || chatLog.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Henüz mesaj yok
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Manual chat input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Tüm oyunculara mesaj gönder..."
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !isSendingChat && handleSendChat()}
                      disabled={isSendingChat}
                      className="h-10"
                    />
                    <Button
                      onClick={handleSendChat}
                      disabled={isSendingChat || !chatMessage.trim()}
                      size="sm"
                      className="h-10"
                    >
                      {isSendingChat ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">
                    Not: Oyuncular zaten otomatik olarak sa/merhaba/selam yazıyor. Bu alan manuel mesaj göndermek içindir.
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/30 py-4 mt-auto">
        <div className="container">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
              <span className="text-xs text-muted-foreground">
                <strong className="text-foreground">Ömer</strong> Tarafından Yapılmıştır
              </span>
            </div>
            <p className="text-xs text-muted-foreground/60">
              7/24 Aktif Sunucu &mdash; Minecraft Sunucu Yönetim Paneli
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
