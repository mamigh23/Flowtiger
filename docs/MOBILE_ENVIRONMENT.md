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

## Başlangıç kalite kanıtı

`mobil/` içinde:

| Kontrol | Sonuç |
|---|---|
| `flutter pub get --enforce-lockfile` | Başarılı; kilitli bağımlılıklar korundu |
| `flutter analyze` | Başarılı, 0 sorun |
| `flutter test --no-pub --reporter expanded` | 21 test dosyası, 229 test başarılı |
| `adb devices` | Bağlı Android cihaz yok |
| Android debug derleme | Başarısız: JNI `configureCMakeDebug[arm64-v8a]` için CMake 3.22.1 yok; APK üretilmedi |
| iOS derleme / simulator / iPhone | Çalıştırılmadı; Mac/Xcode erişimi yok |

Test günlüğü yerel ve ignore edilen `mobil/.dart_tool/m0-tests.log`,
derleme günlüğü `mobil/.dart_tool/m0-android-build.log` içindedir.
Bağımlılık yükseltmesi, backend/API/migration değişikliği yapılmadı.

## Açık kabul maddeleri

M0 tamamlanmadı: Android debug paketinin derlenmesi ve cihazda açılışı,
ayrıca erken iOS derleme doğrulaması ayrı kanıt ister. Android cihaz sonucu
iOS sonucu yerine kullanılamaz. Emülatör için ek paket/lisans kapsamı ve
8 GB bilgisayarın çalıştırma kapasitesi değerlendirilmelidir.

Sıradaki işlem NDK 28.2'nin korunması ve CMake 3.22.1 kurulumu için
kullanıcının ek kapsam/lisans onayıdır; soru iletildi, yanıt bekleniyor.
Onaydan sonra yalnızca gereken paket kurulup aynı debug derlemesi
yeniden çalıştırılacak. Gradle bellek ayarı 2 GB heap / 1 GB metaspace,
iki worker olarak güncellendi; testler zayıflatılmadı veya değiştirilmedi.

Üretim API adresi ve HTTPS sunucu kabulü, kalıcı Android/iOS imzaları ve
gerçek cihaz testleri hâlâ açık. Web Aşama 9'un canlı kabulü kapanmadı.

Araç kaynakları: [Flutter kurulum](https://docs.flutter.dev/install/manual),
[Android SDK şartları](https://developer.android.com/studio/terms),
[iOS ortamı](https://docs.flutter.dev/platform-integration/ios/setup).
