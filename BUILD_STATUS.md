# Dih v1.0.0 - Build durumu

## Tamamlanan doğrulamalar

- Tüm Node/Electron JavaScript dosyaları `node --check` kontrolünden geçer.
- Launcher self-testleri geçer: config clamp, sürüm karşılaştırma, crash analizi ve GitHub path traversal koruması.
- Release kontrolleri geçer: JSON dosyaları, 1.21.11 Fabric/Loom sürümleri, Electron sandbox ve token saklama güvenliği.
- 1.21.11 Dih Client kaynakları güncel resmi Mojang mapping isimlerine göre hedeflenmiştir.
- GitHub Actions, Windows launcher ve Dih Client build hattı projede bulunur.

## Dağıtım sahibinin girmesi gereken değerler

Bunlar kullanıcıya/repoya özel olduğu için kaynak kod tarafından uydurulamaz:

1. `github.owner`
2. `github.repo`
3. `microsoftClientId` (Microsoft Entra public client/device-code uygulaması)

İsteğe bağlı: `discordAppId`.

`configure_dih.bat` ile bu alanlar ayarlanabilir.

## Ortam notu

Bu kaynak paketinin hazırlandığı çalışma ortamı dış paket/binary indirmelerini tamamlayamadığı için burada gerçek Electron NSIS çıktısı ve Gradle JAR çıktısı üretilemedi. Bunun yerine aynı işlemleri Windows'ta ve GitHub Actions'ta yapan build hatları pakete dahildir. Kaynak doğrulamaları yerel olarak çalıştırılmıştır.
