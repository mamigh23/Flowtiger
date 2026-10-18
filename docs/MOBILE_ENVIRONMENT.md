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
(M1 güncel paket: 179.909.328 bayt). arm64-v8a, armeabi-v7a ve x86_64 içerir.
SHA256: `0E82B3D1FBD9664C0133536A8C27092667D725C2A03537DA04697C8C28D5DFA5`.
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
M0 kontrolünde Dart kodu değişmemişti; ilk 229 test sonucu başlangıç kanıtıdır.

İlk açılışta Android System UI ANR uyarısı görüldü; Bekle seçildi.
`am start -W` iki kez timeout bildirdi; sonrasında UI ağacı ve ekran
görüntüsüyle giriş ekranının açıldığı doğrulandı. İkinci açılışta da giriş
ekranına ulaşıldı. AndroidRuntime/flutter crash kaydı görülmedi. Bu ortam
performans kabulü sayılmaz; ilk açılış gecikmesi ve System UI uyarısı
gerçek cihaz/başka emulator ile yeniden değerlendirilmelidir.
Sunucu alan hataları İngilizce göründü; M1 hata yüzeyinde ele alınacak.
Yerel ekran/UI kanıtı: `.dart_tool/m0-screen.png`, `.dart_tool/m0-window.xml`.

Ağ yapılandırma kaynağı: [Android Network Security Configuration](https://developer.android.com/privacy-and-security/security-config).

## M1 — Oturum ve şirket yanıt sırası, ilk parça

18.10.2026: `session_race_test.dart` 25 kontrollü senaryo ekler. Gerçek
provider bağlantısı kullanılır, yalnız HTTP ve secure storage taklit edilir.
Yanıtlar ve depolama gecikmeleri Completer ile sıralanır; süre artırımı,
gerçek hesap, canlı veritabanı veya backend değişikliği yoktur.

- Bootstrap/login yalnız güncel işlem sonucunu uygular; logout sonrası eski
  yanıt kullanıcıyı geri getiremez. Dispose sonrası token yazılmaz.
- 401 yalnız istekte kullanılan token hâlâ güncelse oturumu temizler;
  token göndermeyen girişin 401'i mevcut oturumu kapatmaz. Eski token'ın
  iptali devam eden yeni açık giriş girişimini engellemez.
- Güvenli depo okuma/yazma/silme işleri controller içinde sıralıdır.
  Logout yerel durumu hemen kapatır, sonra yakaladığı eski token'ı sunucuda
  iptal eder. Geciken logout/clear yeni token'ı silmez.
- Şirket listeleme/seçme sonuçları reset/dispose sonrası uygulanmaz.
  Aynı anda yalnız bir seçim gönderilir; auth değişikliği UI listener'ı
  olmadan şirket durumunu reset eder.

Kontroller: 22 dosyada **254 test geçti**, analyzer **0 sorun**, Android
debug build başarılı, `git diff --check` temiz. Yeni APK `emulator-5554`e
yüklendi; ekran uyandırıldıktan sonra giriş UI ağacı doğrulandı. Boş form
yerel API'nin iki alan hatasını gösterdi. AndroidRuntime/flutter crash
kaydı görülmedi. Günlükler: `.dart_tool/m1-tests.log`,
`.dart_tool/m1-android-build.log`, `.dart_tool/m1-window.xml`.

Bu ilk parçanın ardından cache/rota temizliği ikinci parçada ele alındı.
M1 genel kabulü ve gerçek iki şirket turu hâlâ açıktır.

## M1 — Şirket verisi ve rota ömrü, ikinci parça

18.10.2026: müşteri, ekip, davet, denetim, profil ve panel controller'ları
hesap/aktif şirket/seçim değişiminde senkron sıfırlanır. İşlem sürümleri
ve mounted kontrolü eski başarı, 403, 500 ve ağ hatalarının yeni veriyi
değiştirmesini önler. Şirket kimliği API isteklerine eklenmez; backend
yetki ve tenant kararının kaynağıdır.

Şirket seçimi sırasında eski kabuk etkileşime kapatılır. Açık detay/form
rotaları kapanır; yeni hesap/şirket kendi kabuğuyla başlar. Geç dönen profil
kaydı yeni hesabın cache'ine uygulanmaz. Başarısız seçim eski şirketi
korur; hata ortak kabukta görünür.

`company_scope_test.dart`: 34 yeni regresyon. Aynı hesaba tekrar giriş,
çıkışta hazır veri temizliği, kaydedilmiş notifier ile yeni yükleme,
eski başarı/hata yanıtları ve açık müşteri/profil rotaları sınandı.
Tam mobil paket: **23 dosya / 288 test başarılı**, analyzer **0 sorun**,
Android debug build başarılı. Günlükler aynı `.dart_tool/m1-tests.log`
ve `.dart_tool/m1-android-build.log` dosyalarında güncellendi.
Veritabanı, API sözleşmesi ve bağımlılık kilidi değiştirilmedi.

Son APK için emülatör yeniden açıldı; Android boot tamamlandı. Streamed
kurulum sonuç vermeden uzadı ve durduruldu. `--no-streaming` denemesinde
179.909.328 bayt aktarımı tamamlandı, ancak paket kurulum sonucu yine
alınamadı. Test emülatörü kapatıldı. Bu son paket için emülatör açılışı/API
smoke başarılı sayılmadı; önceki M1 parçasının açılış kanıtı yerine
kullanılmadı. Sonraki cihaz denemesinde paket servisi/ortam kaynakları
incelenmeli; gerçek Android cihaz erişimi de hâlâ yok.

Takip doğrulaması (kullanıcının canlı önizleme talebi): aynı AVD görünür
pencerede 2048 MB RAM ile açıldı. `adb install -r --no-streaming` başarılı
oldu. Kurulu `base.apk` SHA256 değeri yukarıdaki güncel paketle birebir
eşleşti; uygulama başlatıldı ve UI ağacında giriş düğmesi doğrulandı.
Son paketin kurulum/açılış engeli bu denemede giderildi; gerçek cihaz,
oturumlu iki şirket/API zinciri ve iOS kabulü açık kalır. Emülatör
kullanıcıya görünür biçimde açık bırakıldı. Kanıt: `.dart_tool/live-window.xml`.

M1 kalan: güvenli depolama hata yüzeyi, Türkçe alan hataları, yeni mobil
gezinme/kabuk ve iki platform cihaz kabulü. Bu testler taklit HTTP ile
çalışır; gerçek iki şirket, owner/member, iPhone kabulü yerine geçmez.

Üretim API adresi ve HTTPS sunucu kabulü, kalıcı Android/iOS imzaları ve
gerçek cihaz testleri hâlâ açık. Web Aşama 9'un canlı kabulü kapanmadı.

Araç kaynakları: [Flutter kurulum](https://docs.flutter.dev/install/manual),
[Android SDK şartları](https://developer.android.com/studio/terms),
[iOS ortamı](https://docs.flutter.dev/platform-integration/ios/setup).
