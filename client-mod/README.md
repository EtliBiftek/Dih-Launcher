# Dih Client

Launcher sürümden bağımsızdır; Minecraft içi Dih Client sürüme göre derlenir. `reference-1.21.11/` Minecraft **1.21.11** için referans adapterdır.

## Modüller

- Keystrokes / CPS / FPS / Ping
- Armor HUD / Potion HUD
- Toggle Sprint / Toggle Sneak
- Zoom
- Backview / Perspective
- Reach Display
- TNT Time / Timer
- Time Changer
- Fullbright
- Low Fire
- Custom Crosshair
- Hit Color
- Right Shift mod menüsü
- HUD sürükleme ve ölçekleme
- Launcher ile ortak `config/dih-client.json`

## Yeni Minecraft sürümü

Yeni bir sürüm eklerken bu adapterı kopyala, Minecraft/Fabric API/Loader sürümlerini güncelle ve renderer/input mixin hedeflerini o sürümün mappings'ine göre doğrula. Son JAR'ı:

```text
sürümler/<tam-minecraft-sürümü>/mods/dih-client.jar
```

altına yükle. Launcher otomatik indirir.

Replay gibi kapsamlı üçüncü taraf sistemler için ilgili Fabric JAR'ını aynı `mods/` klasörüne koymak yeterlidir.
