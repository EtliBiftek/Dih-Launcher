# Dih Launcher v1.0.0

Dih; PvP odaklı, GitHub tarafından yönetilen **Minecraft Fabric launcher + Dih Client** projesidir. Launcher sürüm paketlerini kod içine gömmez. GitHub'daki klasörleri okuyup doğru Minecraft sürümünü, Fabric Loader'ı, Java'yı ve Dih tarafından yönetilen dosyaları otomatik hazırlar.

## GitHub sürüm yapısı

```text
repo/
└─ sürümler/
   ├─ 1.21.11/
   │  ├─ dih.json                 # opsiyonel profil metadatası
   │  ├─ mods/
   │  │  ├─ fabric-api.jar
   │  │  ├─ dih-client.jar
   │  │  └─ replaymod.jar         # opsiyonel harici mod
   │  ├─ config/
   │  ├─ resourcepacks/
   │  └─ shaderpacks/
   └─ 1.21.4/
      └─ mods/
```

Klasör adı **tam Minecraft sürüm id'sidir**. `sürümler/1.21.11/` seçilirse Dih doğrudan Minecraft 1.21.11 + Fabric kurar. Her sürüm ayrı instance kullanır. GitHub'da sürüm klasörü yoksa launcher sürüm göstermez.

`dih.json` örneği: `examples/version-dih.json`.

## Launcher sistemleri

- GitHub'dan sürüm keşfi ve `dih.json` metadatası
- `mods`, `config`, `resourcepacks`, `shaderpacks` recursive senkronizasyonu
- Git blob SHA/size doğrulaması ve yalnız değişen dosyaları indirme
- Dih tarafından yönetilen silinmiş dosyaları temizleme; kullanıcı dosyalarını koruma
- Minecraft + stable Fabric Loader otomatik kurulum/doğrulama
- Sürüme göre Java 8/16/17/21 seçimi; Temurin indirme + SHA-256 doğrulama
- Microsoft device-code login, Java Edition sahiplik kontrolü, çoklu hesap ve token yenileme
- Refresh token için Electron `safeStorage`; güvenli OS kasası yoksa token diske yazılmaz
- RAM, çözünürlük, fullscreen, Java/JVM/game args
- Oyun durumu, hazırlama iptali, kapatma, repair ve instance reset
- Launcher/Minecraft logları ve temel crash analizi
- Discord Rich Presence
- GitHub Releases updater + zorunlu SHA-256 doğrulaması
- Sürüm changelog/haber kartları
- Electron sandbox/CSP ve dış navigasyon koruması
- Windows NSIS installer + GitHub Actions release hattı

## Dih Client 1.21.11

`client-mod/reference-1.21.11` ilk yerleşik adapterdır. Hedef: Minecraft **1.21.11**, Java 21, Fabric Loader 0.19.3, Fabric API 0.141.6+1.21.11.

Yerleşik modüller:

- Keystrokes, CPS, FPS, Ping
- Armor HUD, Potion HUD
- Toggle Sprint, Toggle Sneak
- Zoom
- Backview, Perspective
- Reach Display
- TNT Time, Timer
- Time Changer
- Fullbright
- Low Fire
- Custom Crosshair
- Hit Color
- Right Shift mod menüsü
- Sürüklenebilir HUD editörü ve HUD ölçeği
- Launcher ile ortak `config/dih-client.json`

Replay gibi büyük bağımsız modlar yeniden paketlenmez; sürüme uygun JAR'ı ilgili profil `mods/` klasörüne koyman yeterlidir. Aynı yöntem Sodium/Lithium vb. için de geçerlidir.

## İlk yapılandırma

Çalıştır:

```bat
configure_dih.bat
```

veya `dih.config.json` içindeki şu değerleri doldur:

- `github.owner`
- `github.repo`
- `microsoftClientId`
- isteğe bağlı `discordAppId`

Microsoft Client ID, kendi Microsoft Entra public-client/device-code uygulamana ait olmalıdır.

## Çalıştırma ve doğrulama

Node.js 20+:

```bat
npm install
npm run verify
npm start
```

Tüm build:

```bat
build_all.bat
```

Sadece Windows installer:

```bat
build_windows.bat
```

Sadece Dih Client 1.21.11:

```bat
cd client-mod\reference-1.21.11
build_client.bat
```

`build_client.bat` Java 21+'ı kontrol eder, Gradle 9.6.1'i gerekirse indirir, SHA-256 ile doğrular ve JAR'ı `build\libs\` içine üretir.

## Yeni Minecraft sürümü ekleme

1. GitHub'a `sürümler/<tam-sürüm>/` klasörünü ekle.
2. O sürüme uygun Fabric modlarını `mods/` altına koy.
3. Dih Client gerekiyorsa `client-mod/reference-1.21.11` adapterını kopyalayıp o sürümün mappings/Fabric API'sine göre derle.
4. Üretilen `dih-client.jar` dosyasını `sürümler/<tam-sürüm>/mods/` altına yükle.

Launcher'ın kendisinde yeni Minecraft sürümü için kod değişikliği gerekmez.

Ayrıntılı doğrulama durumu: `BUILD_STATUS.md`. Lisans/dağıtım notları: `LICENSE`, `NOTICE.md`.
