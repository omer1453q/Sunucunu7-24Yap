# Aternos + Mineflayer Bağlantı Sorunu Araştırması

## Bilinen Sorunlar:
1. Aternos sunucu kapalıysa bağlantı reddedilir (Connection refused)
2. Aternos sunucu AFK'dan 15-30 dk sonra kapanır
3. Aternos'da port genelde 25565 değildir
4. Mineflayer'da version: false (auto-detect) genelde çalışır
5. online_mode=false (cracked) gerektiğinde auth: "offline" yeterli

## Olası Nedenler:
1. Sunucu kapalı olabilir (Aternos 30dk AFK'dan sonra kapanır)
2. IP/Port yanlış olabilir
3. Aternos sunucu henüz tamamen açılmamış olabilir (start butonuna basmak gerekir)
4. Mineflayer version auto-detect başarısız olabilir

## StackOverflow Çözümü:
- Mineflayer bot'ları sunucudan atılıyor - genelde AFK plugin'leri veya session timeout
- Aternos'un kendi AFK bot'u var ama cracked gerektirir
