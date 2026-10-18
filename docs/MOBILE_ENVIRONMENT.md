# Mobil geliştirme ortamı — M0

Doğrulama tarihi: 18.10.2026. Dal: `feat/release-stabilization`.
Başlangıç uygulama commit'i: `818bcab`. Bu kayıt mağaza veya cihaz kabulü değildir.

## Doğrulanan araçlar

- Windows 11, 8 GB RAM; kullanıcıda şimdilik yalnızca Windows bilgisayar var.
- Flutter stable 3.47.7, Dart 3.13.5. Flutter arşivinin SHA256 değeri resmi
  sürüm metaverisiyle doğrulandı; analytics kapatıldı.
- Temurin JDK 21.0.12.1+1; indirilen arşivin SHA256 değeri doğrulandı.
- Android command-line tools, platform-tools 37.0.1,
  `platforms;android-36` revision 2 ve `build-tools;36.0.0` kuruldu.
  Mevcut secure-storage ve JNI eklentileri ayrıca Android 34 ve 35
  platformlarını istedi; bunlar aynı onaylı platform kapsamıyla kuruldu.
- SDK/JDK/Flutter depoya konmadı. Flutter'ın yerel android-sdk/jdk-dir
  ayarları yapıldı; kullanıcı PATH'i değiştirilmedi. Komutlar Flutter'ın
  tam yolu ile çalıştırıldı.
- Kullanıcı yalnızca platform, build-tools ve platform-tools için SDK
  lisans kabulünü açıkça onayladı. Toplu `sdkmanager --licenses` kabulü
  yapılmadı. Ancak Gradle denemeleri sırasında NDK 28.2.13676358 de
  otomatik kurulduğu sonradan doğrulandı; bunun kapsam dışında olduğu
  kullanıcıya bildirildi. Yeni bir etkileşimli lisans yanıtı verilmedi.
  `android.builder.sdkDownload=false` NDK otomatik kurulumunu engelleyen
  bir güvence olarak kullanılamaz. Emülatör sistem görüntüsü kurulmadı.
- Kullanıcı sonraki yanıtında NDK 28.2'nin korunmasını ve CMake 3.22.1
  kurulumunu, yalnızca bu paketlerin gerektirdiği SDK lisans kabulüyle
  açıkça onayladı. CMake 3.22.1 kuruldu, debug derlemesi tekrarlandı.

## Başlangıç kalite kanıtı

`mobil/` içinde:

| Kontrol | Sonuç |
|---|---|
| `flutter pub get --enforce-lockfile` | Başarılı; kilitli bağımlılıklar korundu |
| `flutter analyze` | Başarılı, 0 sorun |
| `flutter test --no-pub --reporter expanded` | 21 test dosyası, 229 test başarılı |
| `adb devices` | Bağlı Android cihaz yok |
| `flutter build apk --debug --no-pub` | Başarılı, çıkış 0; CMake eksikliği giderildi |
| APK kimlik / imza | `com.flowtiger.flowtiger`, 0.1.0 (1), target SDK 36; `apksigner verify` başarılı, Android Debug imzası |
| iOS derleme / simulator / iPhone | Çalıştırılmadı; Mac/Xcode erişimi yok |

Test günlüğü yerel ve ignore edilen `mobil/.dart_tool/m0-tests.log`,
derleme günlüğü `mobil/.dart_tool/m0-android-build.log` içindedir.
Bağımlılık yükseltmesi, backend/API/migration değişikliği yapılmadı.

Yerel paket: `mobil/build/app/outputs/flutter-apk/app-debug.apk`
(158.255.568 bayt). arm64-v8a, armeabi-v7a ve x86_64 içerir.
SHA256: `BA01B018F8E1871047CB9DEA7C462FE6AD7D8AF8BF98114386ACC35002426575`.
APK ve araçlar Git'e eklenmedi. Paket varsayılan development API adresini
(`http://10.0.2.2:8000/api/v1`) kullanır; gerçek telefonda bu adres
geliştirme bilgisayarına yönlenmez. Üretim veya telefon dağıtım paketi değildir.

## Açık kabul maddeleri

M0 tamamlanmadı: Android debug paketinin cihazda açılışı,
ayrıca erken iOS derleme doğrulaması ayrı kanıt ister. Android cihaz sonucu
iOS sonucu yerine kullanılamaz. Emülatör için ek paket/lisans kapsamı ve
8 GB bilgisayarın çalıştırma kapasitesi değerlendirilmelidir.

NDK/CMake ek kapsam ve lisans onayı alındı; derleme engeli kapatıldı.
Sıradaki kapı Android cihaz/emülatör açılışı ve API bağlantısıdır.
Gradle bellek ayarı 2 GB heap / 1 GB metaspace,
iki worker olarak güncellendi; testler zayıflatılmadı veya değiştirilmedi.

M1 öncesi platform incelemesinde ana Android manifestinde INTERNET izni
bulunmadığı görüldü (debug manifestinde var). Release API erişimi ve
geliştirme HTTP/üretim HTTPS ayrımı ayrıca düzeltilip doğrulanmalı.

Üretim API adresi ve HTTPS sunucu kabulü, kalıcı Android/iOS imzaları ve
gerçek cihaz testleri hâlâ açık. Web Aşama 9'un canlı kabulü kapanmadı.

Araç kaynakları: [Flutter kurulum](https://docs.flutter.dev/install/manual),
[Android SDK şartları](https://developer.android.com/studio/terms),
[iOS ortamı](https://docs.flutter.dev/platform-integration/ios/setup).
