# FLOWTIGER — PROJECT PLAYBOOK / ANA YÖNETİM BELGESİ

**Belge amacı:** FlowTiger projesinin mimarisini, ürün vizyonunu, mevcut durumunu, geliştirme sırasını, kalite kapılarını, AI çalışanlarının görev ve sınırlarını ve proje yönetim kurallarını tek bir yerde tutmak.

**Belge sahibi / koordinasyon:** ChatGPT — Başkomutan / tek yetkili editör ve teknik kalite denetimi  
**Tarih:** 21.08.2026  
**Lansman tarihi:** **05.09.2026**  
**Lansman anlamı:** Web uygulamasının büyük kısmının tamamlanmış, çalışır durumda ve gerçek kullanım/test sürecine alınabilecek seviyeye gelmesi. Lansman mağaza çıkışı anlamına gelmez.  
**Planlanan resmi uygulama çıkışı:** 01.10.2026  
**Repository:** `https://github.com/mamigh23/Flowtiger`  
**Branch:** `master`

**17.10.2026 uygulama yol haritası:** [Durum analizi ve iş sırası](docs/ROADMAP.md).
Bu bağlantıdaki belge playbook'un tamamlayıcısıdır. Aktif çalışma dalı
`feat/release-stabilization`; `master` ile eşit olduğu varsayılmaz.

---

# 1. PROJENİN ANA HEDEFİ

FlowTiger, çok kiracılı (multi-tenant) bir SaaS uygulamasıdır.

Temel fikir:

- Bir kullanıcı birden fazla şirkete üye olabilir.
- Her şirketin verisi tenant izolasyonu ile ayrılır.
- Kullanıcı aktif bir şirket seçer.
- Backend her istekte kimlik + şirket bağlamı + yetki kontrolü yapar.
- Web ve mobil istemciler aynı Laravel API'yi kullanır.
- Web: React + TypeScript + Vite.
- Mobile: Flutter + Dart + Riverpod.
- Android ve iPhone tek Flutter kod tabanından geliştirilecektir.

FlowTiger'ın güvenlik modeli client'a değil backend'e dayanır.

**Ana kural:**
> Frontend sadece kullanıcı deneyimini yönetir. Gerçek yetki ve tenant güvenliği backend'dedir.

---

# 2. TEKNOLOJİ MİMARİSİ

## Backend

- Laravel
- PHP
- PostgreSQL
- Laravel Sanctum
- REST API
- Policies / Middleware / Service layer
- API Resources / Form Requests
- PHPUnit / Laravel test altyapısı

Temel request zinciri:

```text
HTTP Request
    ↓
auth:sanctum
    ↓
company.context
    ↓
Policy / Authorization
    ↓
Service
    ↓
Model
    ↓
PostgreSQL
```

## Web

- React
- TypeScript
- Vite
- React Router
- React Context
- merkezi API client
- CSS custom properties / design tokens
- Vitest / Testing Library

## Mobile

- Flutter
- Dart
- Riverpod
- `http`
- `flutter_secure_storage`
- Flutter test / analyzer

Android + iOS:

```text
Flutter codebase
      ↓
Android
iPhone / iPad
```

---

# 3. KALICI MİMARİ VE GÜVENLİK KURALLARI

Bu kurallar fazlardan bağımsızdır.

## 3.1 Backend authority

Şunlar client tarafından belirlenemez:

- `company_id`
- `active_company_id`
- `customer_no`
- role yetkisi
- membership yetkisi
- tenant erişimi

Client sadece doğru endpointi çağırır.

## 3.2 Tenant isolation

Tenant izolasyonu UI özelliği değildir.

Backend katmanında korunur:

- PostgreSQL FK / unique constraints
- `CompanyScope`
- `BelongsToCompany`
- `CompanyContext`
- Policy
- Service guardları
- HTTP middleware

Başka tenant verisini client'ta gizlemek güvenlik sayılmaz.

## 3.3 Secrets / PII

Asla loglanmaz veya audit'e yazılmaz:

- password / password hash
- Sanctum token
- invitation token
- password reset token
- verification token
- Authorization header
- API key / secret
- DB password
- cookie / session secret

Audit tarafında düz e-posta yerine gerekiyorsa güvenli hash yaklaşımı kullanılır; client hassas alanları beyaz liste dışından göstermez.

## 3.4 Test gate

Bir faz “kod yazıldı” diye tamamlanmaz.

Başarı kriteri:

> Gerçek test suite GREEN.

Test çalıştırılmadan production/finished iddiası yapılmaz.

## 3.5 Migration kuralı

Mevcut migration geçmişi değiştirilmez.

Yeni schema değişikliği gerekiyorsa:

- yeni migration
- backward-compatible
- PostgreSQL uyumlu
- mevcut veriyi bozmayacak

yaklaşım kullanılır.

## 3.6 Gereksiz abstraction yok

YAGNI uygulanır. Transaction/audit/authorization bütünlüğü gerektirmedikçe gereksiz service, repository, observer, package veya abstraction eklenmez.

---

# 4. BACKEND FOUNDATION DURUMU

Faz 0–10 backend foundation tamamlandı ve freeze durumundadır.

```text
452 tests passed
1494 assertions
GREEN
```

Son backend foundation commit'i:

```text
6ffeb79
chore(backend): faz 10 - production hardening and foundation freeze
```

Sonradan eklenen Task/Planning v1 bu foundation üzerine gelmiştir ve ayrı milestone olarak commit edilmiştir.

Yeni backend özelliği için önce şu sorular cevaplanır:

1. Gerçekten gerekli mi?
2. Mevcut API ile çözülemiyor mu?
3. Web/mobile ihtiyacından mı doğdu?
4. Mevcut güvenlik modelini koruyor mu?

---

# 5. CLIENT FOUNDATION VE ÜRÜN DURUMU

Client foundation commit:

```text
549f25e
feat(client): initial web and mobile foundation
```

Tamamlanan ürün alanları:

```text
✅ First Product UI
✅ Customer UI
✅ Team UI
✅ Invitation UI
✅ Audit UI
✅ Profile + Security Web foundation
✅ Finance Web foundation
✅ Payment Web screens
✅ Task / Planning Web + Backend foundation
✅ Dashboard / Today Plan / Recent Activity
✅ A11Y-01 confirmation focus management
```

Son doğrulanmış Web kapıları:

```text
41 test files
672 tests
672 passed
TypeScript: GREEN
Vite production build: GREEN
```

30.08.2026 tarihinde Windows ortamında `npm.cmd test`, `npm.cmd run typecheck` ve `npm.cmd run build` ile doğrulandı.

A11Y-01 sonrası test sayısı 655'ten 672'ye çıktı; 17 yeni erişilebilirlik/focus testi eklendi ve full suite GREEN kaldı.

GitHub playbook checkpoint'i resmi durum kaydıdır; yeni bir faz için gerçek ortam çıktısı görülmeden GREEN ilan edilmez.

---

# 6. ÜRÜN VİZYONU — OPERATIONS + FINANCE / ACCOUNTING LAYER

FlowTiger yalnızca müşteri, ekip, şirket, davet, denetim ve profil ekranlarından oluşan bir SaaS değildir.

Uzun vadeli ana vizyon:

> **İşletme sahibinin operasyonunu ve finansal durumunu tek yerden anlamasını, yönetmesini ve zamanında aksiyon almasını sağlayan işletme merkezi.**

**Finans / muhasebe katmanı ilk ürün planının parçasıdır ve roadmap'ten çıkarılamaz.** Lansman takvimi nedeniyle aşamalı olarak devreye alınacaktır.

## 6.1 Finans ve muhasebe hedefi

Hedeflenen ana yetenekler:

- Fatura oluşturma ve fatura yönetimi
- Gelir kaydı ve gelir takibi
- Gider kaydı ve gider takibi
- Tahsilat / ödeme takibi
- Alacak / borç görünümü
- Finansal dashboard
- KDV özeti
- Vergi ve diğer mali yükümlülükler için takvim / hatırlatma
- Dönemsel finans özeti
- Mali müşavir için kontrollü paylaşım / çalışma yüzeyi
- Dışa aktarma ve raporlama
- Uygun zamanda e-Fatura / e-Arşiv ve diğer resmi e-belge entegrasyonları

## 6.2 “Para nereye gidiyor?” işletme görünümü

FlowTiger gerçek kayıtlara dayanarak mümkün olduğunda şunları anlaşılır biçimde göstermelidir:

- Para hangi gider kategorilerine gidiyor?
- Hangi giderler artıyor / azalıyor?
- Hangi müşterilerden tahsilat bekleniyor?
- Hangi ödemeler yaklaşmakta?
- Hangi faturalar kesilmiş / tahsil edilmiş / bekliyor?
- Yaklaşan mali yükümlülükler neler?
- İşletmenin dönemsel nakit görünümü nasıl?

Uydurma KPI veya fake finansal sonuç üretilemez.

## 6.3 Fatura kesme açık ürün gereksinimidir

“Fatura kesme” FlowTiger için yalnızca PDF üreten bir özellik değildir.

İleride hedeflenen akış:

```text
Müşteri seç
   ↓
Ürün / hizmet kalemleri
   ↓
Miktar / birim fiyat
   ↓
KDV / iskonto / toplam
   ↓
Fatura oluştur
   ↓
Fatura durumu
   ↓
Tahsilat durumu
   ↓
Uygun e-belge / sağlayıcı entegrasyonu
```

PDF / yazdırılabilir belge görünümü desteklenecek; gerçek elektronik belge ihtiyacı oluştuğunda mevzuata ve uygun sağlayıcılara göre entegrasyon ayrıca planlanacaktır.

## 6.4 Vergi ve muhasebe bilgilendirme asistanı

FlowTiger mevcut kayıtlarından hareketle kullanıcıya:

- tahmini KDV görünümü
- tahmini vergi / mali yükümlülük görünümü
- gelir / gider etkisi
- yaklaşan beyan / ödeme tarihleri
- olağandışı gider artışları
- nakit akışı uyarıları
- muhasebe açısından dikkat edilmesi gereken noktalar

sunmayı hedefler.

### Kritik doğruluk kuralı

FlowTiger kesin muhasebe, vergi veya hukuki danışman olarak konumlandırılmaz.

Mali sonuçlarda:

- mümkün olduğunda **tahmini** etiketi kullanılır
- oran / varsayım / tarih gösterilir
- hesaplanamayan noktalar açıkça belirtilir
- şirket türü, istisna, indirim ve mevzuat farklılıkları dikkate alınır
- gerektiğinde mali müşavir / yetkili uzman doğrulaması önerilir
- mevzuat değişebildiği için oranlar ve yasal takvimler sabit kodlanmış gerçekler olarak kabul edilmez; güncel/ doğrulanmış kaynak gerekir

## 6.5 Mali müşavir çalışma modeli

Hedef mali müşaviri sistemin dışına itmek değil, şirket sahibi ↔ mali müşavir bilgi akışını kolaylaştırmaktır.

Planlanan yüzeyler:

- finansal rapor paylaşımı
- kontrollü erişim
- belge / veri dışa aktarma
- mali açıklama notları
- belge / veri akışı

## 6.6 AI finans yardımcısı

AI finans katmanının yardımcı katmanıdır; finansal kayıtların kaynağı veya yetki makamı değildir.

İleride gerçek FlowTiger verilerine dayanarak:

- “Bu ay para nereye gitti?”
- “Giderler neden arttı?”
- “Hangi müşterilerden para bekliyorum?”
- “Yakında hangi ödemelerim var?”
- “Bu ay yaklaşık KDV durumum nedir?”
- “Hangi faturalar tahsil edilmedi?”

gibi sorulara cevap verebilir.

AI cevabı ile muhasebe/vergi mevzuatı arasındaki sınır açık tutulur.

---

# 7. 05.09.2026 LANSMAN HEDEFİ

**Önceki 30.08.2026 lansman hedefi ertelenmiştir. Yeni hedef 05.09.2026'dır.**

Bu lansmanın anlamı:

> FlowTiger'ın web uygulamasının büyük kısmının tamamlanmış, çalışır durumda, gerçek API ile denenebilir ve ürünün ana akışlarının kullanıcı testine açılabilecek seviyeye gelmesi.

Bu tarih **mağaza yayını veya final production release tarihi değildir.**

Lansman için hedeflenen hikâye:

```text
Problem
   ↓
FlowTiger'ın işletme yaklaşımı
   ↓
Dashboard
   ↓
Müşteriler
   ↓
Ekip / Davetler
   ↓
Şirket yönetimi
   ↓
Denetim geçmişi
   ↓
Tasks / Planning
   ↓
Payments / Finance
   ↓
Finans vizyonu / “yakında”
   ↓
Mobile preview
   ↓
01.10.2026 resmi çıkış
```

05.09.2026'ya kadar öncelik:

- Web ana akışlarının tamamlanması
- Gerçek API entegrasyonlarının doğrulanması
- Dashboard / Tasks / Payments / Finance akışlarının birlikte denenmesi
- Kritik loading / empty / error durumlarının tamamlanması
- A11Y ve temel UX kontrolleri
- Web regression testlerinin GREEN kalması
- Kullanıcıya gösterilebilir bir demo akışının hazırlanması

Lansman için:

- gerçek UI
- gerçek navigasyon
- gerçek API'ye bağlı demo akışları
- profesyonel sunum / anlatım
- cihaz mockup'ları
- ekran görüntüleri
- kısa demo video
- gerektiğinde canlı ürün gösterimi
- işletme sahibinin anlayacağı problem / çözüm anlatısı

hazır olmalıdır.

---

# 8. 01.10.2026 RESMİ ÇIKIŞ HEDEFİ

Planlanan resmi uygulama çıkışı:

**01.10.2026**

Beklenen platformlar:

- Web
- Android
- iPhone / iPad

iOS production signing / archive / App Store süreçleri macOS + Xcode gerektirdiğinden ayrıca takip edilir.

05.09.2026 lansmanı ile 01.10.2026 resmi çıkış birbirinden ayrı milestone'lardır.

---

# 9. GELİŞTİRME ROADMAP'İ

Backend foundation tamamlandığı için öncelik client productization ve release preparation'dır.

## AŞAMA 1 — First Product UI

✅ Tamamlandı.

## AŞAMA 2 — Customer UI

✅ Tamamlandı.

- list
- pagination
- create
- detail
- update
- delete
- validation
- loading/empty/error

## AŞAMA 3 — Team UI

✅ Tamamlandı.

- member list/detail
- role change
- remove
- owner-only backend davranışının UI karşılığı

## AŞAMA 4 — Invitation UI

✅ Web + Flutter owner tarafı tamamlandı.

- invitation list
- invite member
- role selection
- revoke
- durumlar / hata yönetimi

Public accept flow ayrı subphase olarak tutulur.

## AŞAMA 5 — Audit UI

✅ Tamamlandı.

- history
- pagination
- actions
- actor
- timestamp
- safe metadata / change display

## AŞAMA 6 — Profile + Security UI

✅ Web Subphase A tamamlandı.

### Subphase A

- Profile
- Email verification
- Password change

### Subphase B

🟡 Stabilizasyon / gerçek API edge-case kontrolü.

- kritik UX / A11Y kontrolleri
- security edge-case kontrolleri
- gerçek API davranışı doğrulaması

## AŞAMA 7 — Dashboard / Operations

✅ Web foundation tamamlandı.

- Dashboard
- Today Plan
- Recent Activity
- Task planning
- operasyonel özet

### Kalan

🟡 Gerçek API ile uçtan uca ürün testi ve demo akışı.

## AŞAMA 8 — Finance / Payments

✅ Web temel yüzeyleri tamamlandı.

- finance entries
- payment screens
- finance labels / form akışları

🟡 Ürünleştirme / entegrasyon doğrulaması:

- finans + ödeme ilişkilerinin doğrulanması
- tahsilat / ödeme görünümü
- alacak / borç görünümü
- finansal dashboard
- ardından fatura akışı

## AŞAMA 9 — Web Release Stabilization

🔴 **Şu an ana aktif faz.**

**05.09.2026 lansmanının ana çalışma alanı.**

Bu fazda yeni özellik eklemekten önce mevcut ürünün uçtan uca çalışması sağlanır.

Kontrol matrisi:

```text
Auth
Company
Dashboard
Customers
Team
Invitations
Audit
Profile
Tasks
Payments
Finance
Navigation
Loading states
Empty states
Error states
Authorization
Tenant isolation
A11Y
Responsive UI
Regression tests
Production build
```

İlk operasyonel görev:

```text
Gerçek kullanıcı akışı
Auth
 ↓
Company
 ↓
Dashboard
 ↓
Customer
 ↓
Task
 ↓
Payment
 ↓
Finance
 ↓
Team
 ↓
Invitation
 ↓
Audit
 ↓
Profile
```

Bulunan **ilk gerçek blocker** kapatılır ve kalite kapısı yeniden çalıştırılır. Yeni feature'a ancak blocker/temel entegrasyon sorunları kapandıktan sonra geçilir.

Kalite kapısı:

```text
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Hepsi GREEN olmadan web release candidate ilan edilmez.

## AŞAMA 10 — Mobile Productization

🟡 Sıradaki büyük faz.

Web release stabilization tamamlanmadan tam mobil productization başlamaz.

Flutter tarafı web ile aynı API kontratını kullanacak.

Öncelik sırası:

```text
Auth
 ↓
Company
 ↓
Dashboard
 ↓
Customers
 ↓
Tasks
 ↓
Finance
 ↓
Payments
 ↓
Team
 ↓
Profile
```

Android + iOS aynı Flutter kod tabanından ilerler.

## AŞAMA 11 — Finance V2

🟡 Planlandı.

- Invoice
- receivables / payables
- financial dashboard
- reports
- export
- tax / VAT information layer

## AŞAMA 12 — AI Assistant

🟡 Planlandı.

AI yalnızca gerçek FlowTiger verileri üzerinden yardımcı katman olarak çalışacaktır.

## AŞAMA 13 — Official Release

🎯 **01.10.2026**

- Web production
- Android release
- iOS / iPadOS release
- production monitoring
- onboarding
- pricing / billing
- launch campaign

---

# 10. 05.09.2026 İÇİN ÇALIŞMA STRATEJİSİ

05.09.2026'ya kadar ana hedef “çok özellik” değil:

> **Mevcut ürünün güvenilir, gösterilebilir ve uçtan uca denenebilir hale gelmesi.**

Her yeni görev şu sırayla değerlendirilir:

```text
1. Bug / blocker var mı?
       ↓
2. Mevcut feature eksik mi?
       ↓
3. API entegrasyonu eksik mi?
       ↓
4. UX / A11Y problemi var mı?
       ↓
5. Test eksik mi?
       ↓
6. Ancak sonra yeni feature
```

Bu nedenle lansmana kadar gereksiz büyük refactor, yeni dependency ve mimari değişiklik yapılmaz.

---

# 11. GÜNCEL CHECKPOINT

## 18.10.2026 — Ürün yönü: girişte günlük rehber

Kullanıcı kararı: kişi modüller arasında ne yapacağını aramamalı; uygulamaya
girdiğinde gün içinde ne yapacağını görmeli. Mevcut web tasarımı bu karara
göre güncellendi; yeni backend/AI/Finance V2 fazı başlatılmadı.

- Ana gezinmenin ilk maddesi "Bugün". Sayımlar aşağıdaki genel bakışa
  taşındı; ilk işlevsel bölüm "Sıradaki adım" ve tek bir "Bu işe geç" aksiyonu.
- Öneri /tasks/today yanıtındaki açık işlerden seçilir: önce kullanıcının
  atandığı iş, yoksa henüz atanmamış iş. Alt kümelerde API sırası korunur.
  Başkasına atanmış iş kişisel öneri olarak sunulmaz; gerekçe kartta görünür.
- Saat, müşteri ve tamamlanma durumu yanıttan gelir. Vade/aciliyet/finansal
  yükümlülük uydurulmaz. Kısmi sayfada tüm gün bitti denmez veya yüzde
  üretilmez. Tam görev kümesi doğrulandığında şirketin gerçek ilerlemesi
  gösterilir; bunun kişisel tamamlanma oranı olduğu iddia edilmez.
- Boş planda ilk işi planlama, hata durumunda günlük planı açma yönlendirmesi
  vardır. Şirket planında görev sorumluları açıkça gösterilir.
- Yeni web rotası `/app/tasks/today` mevcut /tasks/today API'sini sayfalar;
  istemci kendi tarihini sunucuya göndermez. Tüm görevler/günlük plan
  geçişinde sayfa durumu sıfırlanır. Tamamlanan görevde rehbere dönüş var.

Doğrulama: 49 dosyada 839 web testi (17 ek senaryo), 14 yayın kontrol testi,
typecheck, normal build ve diff kontrolü başarılı. Eski testler kaldırılmadı;
yeni gerçek veri bölümü ve gezinme metni için beklentiler kapsamı korunarak
güncellendi. API, veri modeli, tenant/policy ve backend değişmediği için
backend paketi bu turda tekrarlanmadı.

1440x1000 ve 375x812 yerel örnek verili önizlemede sıradaki iş kartı,
günlük plana geçiş ve doğru görev detayına geçiş incelendi. Mobil sayfa
taşması görülmedi. Geçici önizleme kaynakları kaldırıldı; üretim paketinde
örnek token/veri işaretleri bulunmadığı kontrol edildi.

Kapsam sınırı: öneri mevcut günlük yanıtın görünen görevleriyle sınırlıdır;
daha fazla sayfa varsa bu açıkça belirtilir ve tam günlük plana gidilir.
Henüz kaydı olmayan iş otomatik icat edilmez. Canlı sunucu/e-posta/yedek/TLS
kabulü beklediği için Aşama 9 açık ve canlı yayın yapılmadı.

## 18.10.2026 — İç tasarım / liste ve detay tutarlılığı

- Müşteri/ekip/denetim/davet tablolarının başlık, satır ve işlem alanları
  ortaklaştırıldı. Mevcut işlem bağlantıları en az 44px yüksekliğinde;
  müşteri ayrıntı bağlantısı hover olmadan da görünür.
- Mevcut finans/ekip bölüm seçicileri, sayfalama ve birincil aksiyonlar
  ortak tasarım diline alındı. Üye, finans kaydı ve ödeme ayrıntıları için
  ortak genişlik ve bilgi satırı düzeni; müşteri/görev kartlarında eş boşluk.
- Üye rolü açıklaması kullanıcı diline çevrildi. Yetki/rol/iptal/silme
  davranışları ve API sözleşmeleri değiştirilmedi.

48 dosyada 822 web testi, 14 yayın kontrol testi, typecheck, normal build ve
diff kontrolü geçti. Backend değişmedi; backend testleri bu turda tekrarlanmadı.
Gövde, ikincil metin, tablo başlığı ve birincil düğmenin ölçülen kontrastları
sırasıyla 15,20:1; 7,54:1; 9,39:1; 8,96:1. Bu dört renk çifti ölçümü tüm
arayüz/erişilebilirlik sertifikasyonu değildir.

Geçici örnek verili yerel önizlemede müşteri listesi/detayı, ekip listesi/
üye detayı ve açılmış denetim ayrıntısı incelendi. 375px sayfalarda yatay
sayfa taşması yok; çok sütunlu denetim tablosu kendi içinde yatay kayar.
Önizleme kaynakları kaldırıldı ve paket içinde örnek token/veri işaretleri
bulunmadığı kontrol edildi. Canlı sunucuya yayın yapılmadı. Aşama 9 açık.

## İç tasarım geçişi — mevcut web kapsamı

- Masaüstünde sürekli etiketli, sabit genişlikte gezinme; dar ekranda mevcut
  çekmece davranışı. Menü ve dashboard için ortak dekoratif SVG simgeleri.
- Büyük dekoratif dashboard karşılama alanı yerine kısa başlık ve mevcut
  görev/müşteri oluşturma ekranlarına iki doğrudan bağlantı.
- Ortak `workspace.css` kapsamıyla sakin yüzeyler, belirgin kenarlar,
  okunaklı ikincil metinler ve daha az parlama. Liste/ayrıntı/profil
  yüzeyleri aynı dilde; görev/finans/ödeme form genişlikleri sınırlandı.
- Dar ekranda özetler iki sütun; form alanlarında daha düzenli boşluklar.
  Auth, tenant, para hesapları, API ve backend davranışı değiştirilmedi.

Doğrulama: 48 dosyada 822 web testi, 14 yayın kontrol testi, typecheck,
normal build ve `git diff --check` başarılı. Backend değiştirilmediği için
bu tasarım işi için backend paketi yeniden çalıştırılmadı.

1440x1000 ve 375x812 görsel kontrolleri gerçek bileşenlerin geçici,
örnek verili yerel önizlemesinde yapıldı. Dashboard, görev listesi,
finans listesi/formu, profil ve mobil menüden gezinme incelendi; kontrol
edilen dar ekranlarda yatay taşma görülmedi. Önizleme dosyaları kaldırıldı
ve üretim paketinde örnek önizleme işaretlerinin bulunmadığı kontrol edildi.
Bu çalışma canlı API/gerçek veri kabulü değildir; tüm sayfalar için kapsamlı
erişilebilirlik denetimi yapıldığı anlamına da gelmez.

**Aşama 9 açık.** Görsel kullanıcı geri bildirimi ve canlı sunucu kabulü
bekleniyor; diğer ürün fazlarına geçilmedi.

## 17.10.2026 — Web yayın hazırlığı / canlı sunucu bekleniyor

Kapsam yalnızca mevcut web sürümünün güvenilir yayınıdır. Kullanıcı sunucunun
kapalı olduğunu bildirdi; sunucu yolu/dalı, API origin, TLS, yedek ve yayın
dizini henüz doğrulanmadı. Canlıya dosya veya veri yazılmadı.

- Payment ve FinanceEntry güncelleme/iptal işlemleri güncel satırı transaction
  içinde `lockForUpdate` ile okuyup iptal kontrolünü kilit altında yapar.
  Önceden okunmuş aktif nesne, başka isteğin iptalini atlayamaz; ilk iptal
  nedeni/zamanı ve audit korunur. Dört regresyon senaryosu önce başarısız,
  düzeltmeden sonra başarılı oldu. Bunlar deterministik eski nesne testleridir;
  iki ayrı eşzamanlı bağlantı/yük testi veya canlı API turu değildir.
- `npm run build:release`, gerçek HTTPS `/api/v1` adresi olmadan üretim
  paketini oluşturmaz. Kontrolün 14 testi CI'a eklendi. Normal geliştirme
  derlemesi değişmedi; mevcut localhost ayarıyla yayın komutu beklendiği
  gibi reddedildi. Canlı API bilinmediği için yayın paketi üretilmedi.
- API sözleşmesi, migration geçmişi ve tenant kapsamları değiştirilmedi.
- Yayın, gerçek kullanıcı turu ve geri dönüş adımları `docs/WEB_RELEASE.md`
  içinde kayıtlıdır. Server açılınca ilk adım salt okunur envanterdir.

Doğrulama:

```text
Backend full suite: 824 passed / 3083 assertions (yalnızca flowtiger_test)
Web: 48 files / 822 passed
Release configuration: 14 passed
TypeScript: GREEN
Development production build: GREEN (yayın paketi olarak kullanılmayacak)
Pint (değişen üç PHP dosyası): GREEN
git diff --check: GREEN
```

İlk backend doğrulamasına ikinci bir veritabanı testi erken başlatıldığı
için test veritabanında kilit/şema çakışmaları oluştu. Bu sonuç GREEN
sayılmadı; süreçler bittikten sonra tek başına tam paket yeniden çalıştırıldı
ve yukarıdaki 824/824 sonucu alındı. Aynı test veritabanı üzerinde test
süreçleri paralel çalıştırılmayacak.

**Aşama 9 açık.** Gerçek sunucu kabulü, TLS, e-posta teslimi, browser/API turu
ve yedek/geri dönüş doğrulaması bekleniyor. Mobil, Finance V2, AI ve
abonelik aşamalarına geçilmeyecek.

## 08.10.2026 — Web Release Stabilization / oturum yarış koşulu

Çalışma dalı: `feat/release-stabilization` (başlangıç commit'i `44278bd`).

- Merkezi API istemcisinde eski oturumun gecikmiş `401` yanıtının yeni
  oturumu kapatması regresyon testiyle yeniden üretildi ve düzeltildi.
- Oturum temizliği yalnızca istekte gönderilen Bearer token hâlâ aktif
  token ile eşleşiyorsa çalışır. Public ve tokensız isteklerin `401`
  yanıtları mevcut oturumu temizlemez; hata çağırana iletilmeye devam eder.
- Üç regresyon testi eklendi; mevcut aktif token için `401` oturum kapatma
  testi korunmuştur. Backend yetki ve tenant kontrolleri değiştirilmedi.

08.10.2026 doğrulama çıktıları:

```text
Backend: 820 tests passed / 3071 assertions
Web: 48 test files / 822 tests passed
npm run typecheck: GREEN
npm run build: GREEN
git diff --check: GREEN
```

Windows backend doğrulaması kurulu PHP 8.4 ile kendi `php.ini` dosyası
seçilerek çalıştırıldı. Varsayılan `php` komutu PHP 8.5 ile PHP 8.4
eklentilerini eşleştirdiği için uygun değildir; sistem ayarları değiştirilmedi.
Test veritabanı koruması ve PostgreSQL gereksinimi korunmuştur.

**Aşama 9 devam ediyor.** Gerçek tarayıcı + API kullanıcı turu bu checkpoint'te
tamamlanmadı. Sıradaki iş §12'deki uçtan uca akışın doğrulanmasıdır.
Lansman / resmi çıkış tarihleri tarihsel hedeflerdir; gerçekleştiği veya
yeni bir tarihe taşındığı doğrulanmamıştır. Mobil productization, Finance V2
ve resmi release tamamlandı olarak işaretlenmez.

## Önceki checkpoint — 30.08.2026

Son Git commit:

```text
ebb6e00
fix: improve confirmation focus management
```

Web son doğrulama:

```text
41 test files
672 tests
672 passed
TypeScript: GREEN
Vite production build: GREEN
```

GitHub ile yerel repository son senkronizasyonu:

```text
master == origin/master
```

Son yapılan A11Y-01 çalışması:

- ortak `ConfirmPanel`
- Customer Detail confirmation
- Member Detail confirmation
- Finance Entry Detail confirmation
- Invitation revoke confirmation row
- focus / Escape / cancel / error dönüş testleri

A11Y-01 sonrası değişiklikler commit edildi ve GitHub'a pushlandı.

---

# 12. SIRADAKİ İŞ

**NEXT:** Web Release Stabilization / gerçek kullanıcı akışı.

İlk görev:

> Web uygulamasını gerçek kullanıcı gözüyle uçtan uca çalıştır; Auth → Company → Dashboard → Customer → Task → Payment → Finance → Team → Invitation → Audit → Profile akışlarını kontrol et. Bulunan ilk gerçek blocker üzerinde çalış. Yeni feature'a geçmeden önce blocker'ı kapat ve test gate'i yeniden çalıştır.

Bu iş tamamlanmadan Mobile Productization'a tam geçiş yapılmaz.

---

# 13. AI ÇALIŞANLARI İÇİN GÖREV SINIRLARI

AI çalışanları:

- mevcut mimariyi değiştiremez
- security kurallarını gevşetemez
- tenant izolasyonunu client'a taşıyamaz
- migration geçmişini değiştiremez
- testleri silerek / gevşeterek GREEN yapamaz
- fake veriyle başarı raporu veremez
- gereksiz dependency ekleyemez
- kapsam dışı refactor yapamaz

Her AI görevi:

1. önce repository ve playbook'u okur
2. mevcut implementasyonu inceler
3. minimum değişiklik yapar
4. test ekler / günceller
5. gerçek testleri çalıştırır
6. typecheck / analyzer çalıştırır
7. gerekiyorsa build çalıştırır
8. `git diff --check` çalıştırır
9. sonucu raporlar
10. checkpoint'i günceller

---

# 14. COMMIT / PUSH KURALI

Her anlamlı milestone sonunda:

```text
git status -sb
git diff --check
git diff --stat
git add ...
git commit -m "..."
git push origin master
git fetch origin
git status -sb
```

Son durumda:

```text
master...origin/master
```

olmalıdır.

Yerelde kalan anlamlı değişiklikler varken “tamamlandı” denmez.

---

# 15. “NEDEN BU SIRA?”

FlowTiger'ın geliştirme sırası bilinçlidir.

### Önce foundation

Çünkü backend güvenliği ve tenant izolasyonu olmadan client özellikleri güvenilir değildir.

### Sonra temel SaaS UI

Çünkü kullanıcı, şirket, müşteri, ekip, davet ve audit temel işletme omurgasıdır.

### Sonra operasyon + finans

Çünkü FlowTiger'ın farklılaşacağı ana alan işletme operasyonu ve finansal görünürlüktür.

### Sonra web stabilization

Çünkü mevcut modüllerin gerçek API ile birlikte çalışması 05.09.2026 lansmanının ön koşuludur.

### Sonra mobil

Web ürün akışı stabil olmadan aynı hataları mobilde tekrar üretmek istemiyoruz.

### Sonra AI

AI'ın cevap vereceği gerçek ve güvenilir veri oluşmadan AI katmanı eklemek ürün açısından anlamsızdır.

### Sonra resmi release

Release yalnızca “uygulama açılıyor” anlamına gelmez:

- güvenlik
- test
- UX
- API
- mobil
- deployment
- monitoring
- onboarding
- billing

birlikte hazır olmalıdır.

---

# 16. ANA PRENSİP

FlowTiger'ın amacı hızlıca çok kod yazmak değildir.

Amaç:

> **Güvenli, gerçek veriye dayanan, işletme sahibinin her gün kullanabileceği profesyonel bir işletme merkezi oluşturmak.**

Her yeni karar bu prensibe göre değerlendirilir.
