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
  bir güvence olarak kullanılamaz.
- Kullanıcı sonraki yanıtında NDK 28.2'nin korunmasını ve CMake 3.22.1
  kurulumunu, yalnızca bu paketlerin gerektirdiği SDK lisans kabulüyle
  açıkça onayladı. CMake 3.22.1 kuruldu, debug derlemesi tekrarlandı.
- Sonraki adımda Android Emulator ve tek sistem görüntüsü için de açık
  paket/lisans onayı alındı. Android 36 Google APIs x86_64 revision 7
  ve Emulator kuruldu. `FlowTiger_API_36` adlı ayrı AVD oluşturuldu;
  `-accel-check` WHPX kullanılabilir sonucunu verdi. 1536 MB RAM,
  iki CPU ve software GPU ile arka planda açıldı; çizim yükü için ekran
  720×1600 / 280 dpi yapıldı.

## Başlangıç kalite kanıtı

`mobil/` içinde:

| Kontrol | Sonuç |
|---|---|
| `flutter pub get --enforce-lockfile` | Başarılı; kilitli bağımlılıklar korundu |
| `flutter analyze` | Başarılı, 0 sorun |
| `flutter test --no-pub --reporter expanded` | 21 test dosyası, 229 test başarılı |
| `adb devices` | `emulator-5554` çevrimiçi; fiziksel cihaz yok |
| Emülatör açılışı / API | APK yükleme başarılı; giriş ekranı görüldü, boş form sunucunun iki alan doğrulama hatasını gösterdi |
| `flutter build apk --debug --no-pub` | Başarılı, çıkış 0; CMake eksikliği giderildi |
| APK kimlik / imza | `com.flowtiger.flowtiger`, 0.1.0 (1), target SDK 36; `apksigner verify` başarılı, Android Debug imzası |
| iOS derleme / simulator / iPhone | Çalıştırılmadı; Mac/Xcode erişimi yok |

Test günlüğü yerel ve ignore edilen `mobil/.dart_tool/m0-tests.log`,
derleme günlüğü `mobil/.dart_tool/m0-android-build.log` içindedir.
Bağımlılık yükseltmesi, backend/API/migration değişikliği yapılmadı.

Yerel paket: `mobil/build/app/outputs/flutter-apk/app-debug.apk`
(158.315.030 bayt). arm64-v8a, armeabi-v7a ve x86_64 içerir.
SHA256: `8F72DD11A136D75161B470B4F89804A07D623820F03FEEF0E7D56006849D0FD1`.
APK ve araçlar Git'e eklenmedi. Paket varsayılan development API adresini
(`http://10.0.2.2:8000/api/v1`) kullanır; gerçek telefonda bu adres
geliştirme bilgisayarına yönlenmez. Üretim veya telefon dağıtım paketi değildir.

## Açık kabul maddeleri

M0 tamamen kapatılmadı: erken iOS derleme doğrulaması için Mac erişimi yok.
Android açılışı/API bağlantısı emülatörde doğrulandı; gerçek cihaz ve
oturumlu ana kullanıcı zinciri henüz doğrulanmadı. Android sonucu iOS
sonucu yerine kullanılamaz.

NDK/CMake ek kapsam ve lisans onayı alındı; derleme engeli kapatıldı.
Sıradaki iş M1 oturum/kabuk için kontrollü yanıt sırası testleri ve
platform başlangıç performansının takibidir; iOS kapısı açık kalır.
Gradle bellek ayarı 2 GB heap / 1 GB metaspace,
iki worker olarak güncellendi; testler zayıflatılmadı veya değiştirilmedi.

Ana Android manifestine INTERNET izni eklendi. Debug network security
config yalnızca `10.0.2.2`, `127.0.0.1`, `localhost` için HTTP açar;
diğer adreslerde cleartext kapalıdır. Release bu debug kaynağını içermez.
Debug APK build ve `:app:processReleaseMainManifest` başarılı; birleştirilmiş
iki manifestte INTERNET, yalnız debug'da networkSecurityConfig doğrulandı.
Yerel Laravel `/up` sağlık kontrolü HTTP 200. Emülatörde boş giriş formu
gerçek API'ye gönderildi; sunucunun email/password required hataları
arayüzde görüldü. Hesap oluşturulmadı veya gerçek kullanıcı kullanılmadı.
Dart kodu değişmedi, önceki 229 test sonucu korunur.

İlk açılışta Android System UI ANR uyarısı görüldü; Bekle seçildi.
`am start -W` iki kez timeout bildirdi; sonrasında UI ağacı ve ekran
görüntüsüyle giriş ekranının açıldığı doğrulandı. İkinci açılışta da giriş
ekranına ulaşıldı. AndroidRuntime/flutter crash kaydı görülmedi. Bu ortam
performans kabulü sayılmaz; ilk açılış gecikmesi ve System UI uyarısı
gerçek cihaz/başka emulator ile yeniden değerlendirilmelidir.
Sunucu alan hataları İngilizce göründü; M1 hata yüzeyinde ele alınacak.
Yerel ekran/UI kanıtı: `.dart_tool/m0-screen.png`, `.dart_tool/m0-window.xml`.

Ağ yapılandırma kaynağı: [Android Network Security Configuration](https://developer.android.com/privacy-and-security/security-config).

Üretim API adresi ve HTTPS sunucu kabulü, kalıcı Android/iOS imzaları ve
gerçek cihaz testleri hâlâ açık. Web Aşama 9'un canlı kabulü kapanmadı.

Araç kaynakları: [Flutter kurulum](https://docs.flutter.dev/install/manual),
[Android SDK şartları](https://developer.android.com/studio/terms),
[iOS ortamı](https://docs.flutter.dev/platform-integration/ios/setup).
