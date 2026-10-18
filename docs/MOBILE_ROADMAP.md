# FlowTiger — Android ve iOS yol haritası

Tarih: 18.10.2026. Kullanıcı Android ve iOS çalışmasını, önce yol haritası
hazırlanarak başlatmayı istedi. Bu belge uygulama geliştirme sırasıdır;
mağazaya gönderim veya tamamlanmış mobil sürüm beyanı değildir.

## 1. Hedef ve kapsam

Tek Flutter kod tabanıyla Android ve iOS'ta aynı hesap, şirket ve mevcut
Laravel API'sini kullanan uygulama. İlk ekran kullanıcının bugünkü işini
ve sonraki adımını gösterir. Web ekranları küçültülerek kopyalanmaz;
telefonun gezinme, klavye, geri hareketi ve erişilebilirlik davranışları
gözetilir.

İlk sürüm: hesap → şirket → Bugün → müşteri → görev → gelir/gider →
ödeme/dağıtım → ekip/davet → denetim → profil. Yeni muhasebe özellikleri,
AI, abonelik, çevrimdışı yazma/senkronizasyon ve push bildirimleri ayrı
iş paketidir; ilk sürümün tamamlanmasını geciktirecek biçimde eklenmez.

Web Aşama 9'un canlı kabulü açık kalır. Kullanıcının yeni talimatıyla mobil
hazırlık ve geliştirme ilerleyebilir; mobil üretim yayını gerçek HTTPS API,
veri yedeği ve uçtan uca sunucu kabulüne bağlıdır.

## 2. Depoda doğrulanan mevcut durum

| Alan | Durum | Yapılacak doğrulama/eksik |
|---|---|---|
| Flutter / Riverpod / HTTP | Kod ve pubspec.lock mevcut | SDK uyumu, pub get, analyzer, testler yeniden çalıştırılacak |
| Android / iOS projeleri | İki platform klasörü Git'te mevcut | Baştan flutter create çalıştırılmaz; mevcut dosyalar korunur |
| Android release | applicationId `com.flowtiger.flowtiger`; release debug imzasını kullanıyor | Kalıcı kimlik kararı ve gerçek upload/release signing gerekli |
| iOS | Bundle ID `com.flowtiger.flowtiger`; projede deployment target 15.0 | Team/signing, SDK/eklenti uyumu ve gerçek Mac derlemesi doğrulanacak |
| Kimlik / şirket | Giriş, güvenli token deposu, şirket kontrolü/seçimi var | Gecikmiş 401, refresh/logout ve şirket değişimi yarışları denetlenecek |
| Müşteri / ekip | Liste, ayrıntı ve düzenleme ekranları var | Cihaz kabulü, hata/sayfalama/owner-member davranışı |
| Davet / profil / audit | Temel ekranlar ve test dosyaları var | Gelen davet/kabul zinciri, e-posta bağlantıları ve hesap eşitliği |
| Ana ekran | Müşteri/üye sayımları ve son hareketler | Web'deki kişisel günlük rehber ve görev akışı yok |
| Görev / finans / ödeme | Mobil modül/model katmanları henüz yok | Mevcut backend sözleşmelerine göre uygulanacak |
| Testler | 21 test dosyası ve test harness mevcut | Bu incelemede çalıştırılmadı; test sayısı/başarı iddiası yok |
| Yerel araçlar | Bu oturumda flutter/adb PATH'te bulunamadı | SDK'nın kurulu olup olmadığı ve gerçek yolu M0'da belirlenecek |

Mevcut mobil README'nin platform klasörleri yoktur bilgisi eskiydi; bu
planla birlikte düzeltildi. Web için son doğrulama 855 test, backend için
832 test / 3.129 assertion'dır; bu sonuçlar mobil test sonucu sayılmaz.

## 3. Ürün ve mimari kararları

- Mevcut Flutter/Riverpod/http/secure storage yapısı korunur. Gereksinim
  kanıtlanmadan yeni state/router/UI paketi eklenmez.
- Token yalnızca mevcut güvenli depolama arayüzündedir. İşletim sistemi
  depolama hatası ve oturum iptali ele alınır; düz metin depolama eklenmez.
- Backend kimlik, tenant ve yetki kaynağıdır. Aktif şirket yalnızca sunucu
  seçimiyle değiştirilir; geçişte eski şirket verisi ve geç yanıtları temizlenir.
- Tutarlar tam sayı minor-unit, KDV ve kalan/dağıtılan değerler mevcut
  sözleşmeye göre taşınır. İstemci yeni bir finans hesaplama motoru kurmaz.
- Önerilen alt gezinme: **Bugün · Görevler · Müşteriler · Finans · Diğer**.
  Ekip, davet, denetim ve profil Diğer altında yer alır. Uygulama aşamasında
  dar ekran ve ekran okuyucuyla doğrulanır; alt menü sınırsız büyütülmez.
- Bugün ekranı kişiye atanmış açık işe, yoksa atanmamış işe yönlendirir.
  Başkasının işi kişisel görev gibi önerilmez. Eksik sayfadan gün tamamlandı
  veya finans toplamı sonucu üretilmez.
- İlk sürüm çevrimiçidir. Ağ kesilmesinde form girdisi korunur; kullanıcıya
  sonucu belirsiz bir finans isteğini tekrar göndertmeden sunucu durumu
  doğrulanır. Otomatik yazma retry veya sahte başarı gösterilmez.

## 4. Sıralı iş paketleri ve çıkış kapıları

| Paket | İş | Tamamlanma ölçütü |
|---|---|---|
| M0 — Çalışan temel | Flutter/Dart, Android SDK/JDK, emulator/adb envanteri; Mac/Xcode erişim planı; mevcut testler; platform/eklenti uyumu | pub get, analyze ve mevcut testler geçer; Android açılır; iOS ortamı hazır veya açıkça engelli kaydedilir |
| M1 — Oturum ve mobil kabuk | Secure storage, bootstrap/login/logout, stale 401/refresh testleri; şirket değişimi; ortak tema/navigasyon ve hata yüzeyleri | İki hesap/şirket arasında eski veri veya token taşınmaz; Android ve iOS kabuk smoke testi geçer |
| M2 — Görev ve Bugün | Task modelleri/endpointleri, günlük liste/sayfalama, detay, oluşturma, atama, düzenleme, tamamla/yeniden aç; günlük rehber | Kayıtlı gerçek görevden öneri; işi bitirip Bugün'e dönüş; saat dilimi, boş/kısmi durum ve 101+ seçenek testleri |
| M3 — Mevcut iş akışlarının eşitliği | Müşteri, ekip, davet ve profil ekranlarını aynı mobil dile taşıma; kayıt, kurtarma/doğrulama ve davet kabul eksiklerini tamamlama | Gerçek HTTPS e-posta bağlantısı uygulama açık/kapalı ve girişli/girişsizken doğru akışa ulaşır; web fallback çalışır |
| M4 — Finans ve ödeme | Gelir/gider ve KDV alanları; detay/düzenleme/iptal; ödeme/dağıtım; kontrollü seçici sayfalaması ve mevcut hedef koruma | Tam sayı tutarlar, dağıtım sınırları, iptal/audit ve hata kodları korunur; belirsiz istek çift kayıt doğurmaz |
| M5 — İki platformda tam kabul | Gerçek API, owner/member, iki şirket, Android ve iPhone, erişilebilirlik ve ağ/uygulama yaşam döngüsü | Ana kullanıcı zinciri iki platformda geçer; kritik hata açık kalmaz; sonuçlar cihaz/build/commit ile kaydedilir |
| M6 — Mağaza ve beta | İmzalar, gizlilik/veri güvenliği beyanları, hesap silme, mağaza varlıkları; Play internal ve TestFlight | İmzalı AAB ve iOS archive/IPA beta kanallarına yüklenir; gerçek tester kabulü ve mağaza kontrolleri geçer |
| M7 — Üretim | Aynı adayın son kabulü, backend uyumluluğu, mağaza incelemeleri ve kademeli yayın | Google Play ve App Store'da onaylanmış sürüm; izleme/destek ve sonraki güncelleme planı hazır |

M0 → M1 → M2 sıralıdır. M3 mevcut ekranları tamamlar; M4 yeni mobil
finans yüzeyini getirir. M5–M7 her iki platform için ayrı kanıt ister.
iOS derlemesi son aşamaya bırakılmaz: ilk doğrulama M0/M1'de, yeni
eklentilerde ve her ana modül sonunda yapılır. Android'in çalışması iOS'un
çalıştığı anlamına gelmez.

## 5. Android ve iOS teslimleri

| Konu | Android | iOS |
|---|---|---|
| Geliştirme | Windows'ta SDK/JDK + emulator ve gerçek cihaz | macOS + Xcode, simulator ve gerçek iPhone |
| Kimlik | Kalıcı applicationId ve sürüm kodu | Kalıcı Bundle ID, Team ve build numarası |
| İmza | Debug imzası kaldırılır; upload key/Play App Signing yapılandırılır | Apple signing/provisioning ve dağıtım yetkileri |
| Bağlantılar | Android App Links ve doğrulanmış alan adı | Universal Links ve Associated Domains |
| Beta | Google Play internal testing; hesaba uygulanıyorsa sonraki test şartları | TestFlight |
| Üretim paketi | İmzalı AAB; gerektiğinde cihaz testi için APK | macOS'ta imzalı archive/IPA ve App Store Connect |
| Özel QA | Sistem geri tuşu, düşük bellek, farklı ekran boyutları | Geri kaydırma, safe area, klavye, Keychain/yeniden kurulum davranışı |

Keystore, sertifika, provisioning ve parolalar Git'e yazılmaz; geliştirici
hesapları ve imza varlıkları kullanıcıya ait kalır. Paket kimlikleri mağaza
kayıtları oluşturulmadan kesinleştirilir. SDK/target API ve Apple yükleme
şartları gönderim tarihinde resmi kaynaklardan yeniden kontrol edilir.

## 6. Mağaza öncesi önemli eksikler

**Hesap silme:** Backend route envanterinde hesap silme ucu yok. Hesap
oluşturma sunan mobil sürüm için uygulama içi silme/başlatma akışı ve
Google Play için dışarıdan erişilen silme talep sayfası planlanmalıdır.
Bu, müşteri kaydı silmek veya şirketten ayrılmakla aynı işlem değildir.
Son owner, ortak şirket verileri, finans/audit saklama ve kişisel verinin
silinmesi/anonimleştirilmesi ayrı tasarlanır. Yeni backend sözleşmesi ve
gerekirse migration bu ihtiyaç için ayrıca değerlendirilir; mevcut veriler
doğrudan silinmez.

**Gizlilik ve veri beyanları:** Kullanılan eklentiler/izinler ve gerçekten
toplanan veriler çıkarılır; App Privacy/Data safety, gizlilik ve destek
sayfaları buna göre hazırlanır. Kullanılmayan kamera/konum/bildirim izinleri
eklenmez. Apple privacy manifest ve eklenti uyumu iOS build sırasında incelenir.

**E-posta bağlantıları:** Mevcut frontend HTTPS bağlantıları korunur.
App/Universal Links için alan adı doğrulama dosyaları sunucuda yayınlanır.
Doğrulama/kurtarma/davet tokenları loglanmaz; uygulama yoksa web akışı devam eder.

**Canlı API:** Gerçek adres doğrulanmadan production paket üretilmez.
Mobil release yapılandırması HTTP/localhost/test adresini reddetmeli;
webdeki kontrole benzer davranış testleri M0/M1'de eklenir. ATS/cleartext
korumaları üretim için gevşetilmez.

## 7. Her paket için doğrulama

```sh
cd mobil
flutter pub get
flutter analyze
flutter test
```

Değişen davranışa göre API/controller/widget regresyonu eklenir. M5'te
integration/device testleri ve gerçek API kabulü ayrıca yapılır. Android
debug build ve iOS simulator build çalışması, imzalı release kabulünün
yerine geçmez. iOS kontrolleri Mac üzerinde yürütülür.

Ortak kabul matrisi: 401/403/422/429/5xx, çevrimdışı ve timeout, çift dokunma,
form korunması, yenileme ve sayfalama, uygulamanın arka plana gidip dönmesi,
token iptali, şirket değişirken gecikmiş yanıt, owner/member izolasyonu,
Türkçe karakter/tutar/tarih, büyük yazı, TalkBack/VoiceOver ve klavye odağı.

Her checkpoint: commit, test sonucu, Android/iOS cihaz/OS, build ortamı,
bilinen engel ve kalan kabul. Test çalıştırılamazsa geçti sayılmaz.

## 8. İlk uygulanacak iş

**M0:** mevcut SDK yollarını ve cihaz olanaklarını belirle; Flutter sürümü
ve bağımlılık uyumunu kaydet; mevcut kodu değiştirmeden analyzer/test
başlangıç sonucunu çıkar; Android debug açılışını doğrula. Mac/iPhone,
Apple Developer ve Play Console erişimlerinin durumu kaydedilir; eksik
erişim ortak Dart/Android işlerini durdurmaz fakat iOS hazır sayılmaz.

Sonra **M1 oturum güvenliği ve kabuk**, ardından **M2 günlük rehber/görev**.
Takvim M0'daki gerçek build/test bulgularıyla oluşturulur; mevcut
envanterden iki platform için garanti yayın tarihi çıkarılmaz.

## 9. Resmi kaynaklar

18.10.2026 plan kontrolünde başvurulan kaynaklar; mağaza gönderiminde tekrar okunur:

- [Flutter Android release ve signing](https://docs.flutter.dev/deployment/android)
- [Flutter iOS geliştirme ortamı](https://docs.flutter.dev/platform-integration/ios/setup)
- [Flutter iOS release](https://docs.flutter.dev/deployment/ios)
- [Apple uygulama içi hesap silme](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Google Play hesap silme gereksinimleri](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
