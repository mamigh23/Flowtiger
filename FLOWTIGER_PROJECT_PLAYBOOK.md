# FLOWTIGER — PROJECT PLAYBOOK / ANA YÖNETİM BELGESİ

**Belge amacı:** FlowTiger projesinin mimarisini, ürün vizyonunu, mevcut durumunu, geliştirme sırasını, kalite kapılarını, AI çalışanlarının görev ve sınırlarını ve proje yönetim kurallarını tek bir yerde tutmak.

**Belge sahibi / koordinasyon:** ChatGPT — Başkomutan / tek yetkili editör ve teknik kalite denetimi  
**Tarih:** 21.08.2026  
**Lansman tarihi:** 30.08.2026  
**Planlanan resmi uygulama çıkışı:** 01.10.2026  
**Repository:** `https://github.com/mamigh23/Flowtiger`  
**Branch:** `master`

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

Son backend commit:

```text
6ffeb79
chore(backend): faz 10 - production hardening and foundation freeze
```

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
🔄 Profile + Security UI
```

Son doğrulanmış kapılar:

```text
Web Audit: 211/211 GREEN + typecheck + build GREEN
Flutter Audit: 189/189 GREEN + flutter analyze GREEN
Flutter Invitation: 128/128 GREEN + flutter analyze GREEN
Web Profile Subphase A: implementation tamam; Windows ortamında node_modules yeniden kurulduktan sonra kapılar doğrulanacak
```

GitHub playbook checkpoint'i resmi durum kaydıdır; gerçek ortam çıktısı görülmeden GREEN ilan edilmez.

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

# 7. 30.08.2026 LANSMAN HEDEFİ

Uygulamanın mağazada yayınlanması lansman için şart değildir.

Lansman yalnızca yapay zekâ ile üretilmiş tek bir video olmayacaktır. Profesyonel bir ürün tanıtımı ve canlı/gerçek ürün gösterimi hedeflenir.

Hedeflenen hikâye:

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
Finans vizyonu / “yakında”
   ↓
Mobile preview
   ↓
01.10.2026 resmi çıkış
```

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

---

# 9. GELİŞTİRME ROADMAP'İ

Backend foundation tamamlandığı için öncelik client productization'dır.

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

🔄 Aktif.

### Subphase A

- Profile
- Email verification
- Password change

### Subphase B

- Sessions
- Security events
- Revoke session

### Subphase C

- Forgot password
- Password reset

## AŞAMA 7 — Finance Foundation

🔜 İlk büyük ürün genişlemesi.

- güvenli finansal veri modeli
- gelir / gider kayıtları
- ödeme / tahsilat kayıtları
- dönem özeti
- finansal dashboard temeli
- KDV / mali yükümlülükler için açıklanabilir tahmini hesaplama altyapısı

## AŞAMA 8 — Invoice Management

- fatura oluşturma
- müşteri ilişkilendirme
- fatura kalemleri
- KDV / toplam hesaplama
- fatura durumu
- tahsilat durumu
- PDF / yazdırma
- uygun e-belge entegrasyon planı

## AŞAMA 9 — Payments, Collections & Tax Assistant

- alacak / tahsilat görünümü
- ödeme takibi
- yaklaşan mali yükümlülükler
- veriye dayalı vergi / KDV özeti
- hatırlatmalar
- açıklanabilir hesaplamalar

## AŞAMA 10 — Accountant Workspace

- mali müşavir paylaşımı
- kontrollü erişim
- rapor paylaşımı
- dışa aktarma
- belge / veri akışı

## AŞAMA 11 — Web/Mobile parity + Product polish

- feature parity
- responsive
- typography
- spacing
- accessibility
- loading/error/empty/skeleton
- navigation polish
- gerektiği kadar animation

## AŞAMA 12 — Launch Demo / Marketing Readiness

30.08 lansmanı için:

- gerçek ekran görüntüleri
- ürün anlatısı
- dashboard demo
- customer/team/invitation/audit demo
- mobile preview
- landing page integration
- profesyonel lansman videosu
- sahne / sunum akışı
- satış konuşması / demo senaryosu

## AŞAMA 13 — Production Candidate / Release

01.10 çıkışı için:

- production deploy
- web production
- Android build
- iOS build
- mail / queue
- monitoring
- backups
- CI
- release QA
- smoke tests

### Roadmap öncelik kuralı

Finance / accounting / invoice katmanı ürünün ana vizyonunun parçasıdır; unutulamaz veya “sonradan belki” özelliği olarak roadmap'ten çıkarılamaz.

Ancak 30.08 lansmanı ve 01.10 release hedefleri riske atılmadan aşamalı teslim edilir.

---

# 10. ÜRÜN GELİŞTİRME KURALLARI

## 10.1 Gerçek ürün değeri

Her yeni ekran veya özellik şu soruya cevap vermelidir:

> “Bu işletme sahibinin hayatını gerçekten kolaylaştırıyor mu?”

Özellikle finans tarafında FlowTiger yalnızca kayıt tutmaz; mümkün olduğunda **anlam** verir:

- ne oldu?
- neden oldu?
- şimdi ne yapmalıyım?
- yaklaşan risk ne?
- para nerede?
- kesilecek / tahsil edilecek / ödenecek ne var?

## 10.2 Fake feature yasağı

Çalışmayan entegrasyon, sahte fatura, sahte vergi hesabı veya uydurma finansal sonuç production özelliği gibi gösterilmez.

Demo verisi kullanılıyorsa demo olduğu açık olmalıdır.

## 10.3 Vergi ve muhasebe doğruluğu

Mali sonuçlar açıklanabilir olmalıdır.

Mümkünse kullanıcı:

- hangi kayıtların hesaba girdiğini
- hangi oranların kullanıldığını
- hangi tarih / dönem varsayımının yapıldığını
- sonucun tahmini olup olmadığını

görebilmelidir.

---

# 11. AI ÇALIŞAN GÖREV TANIMI

AI çalışanlar:

- repository inceleyebilir
- test yazabilir
- UI yazabilir
- API client yazabilir
- mevcut endpointleri kullanabilir
- bug araştırabilir
- refactor yapabilir
- static analysis / test / build çalıştırabilir
- dokümantasyon hazırlayabilir

Tek başına karar veremez:

- backend mimarisi
- yeni auth / tenant modeli
- büyük DB schema değişikliği
- security modelini gevşetme
- migration geçmişini değiştirme
- mevcut API contractını kırma
- production secret ekleme
- `FLOWTIGER_PROJECT_PLAYBOOK.md` değişikliği
- roadmap / faz sırası değişikliği

Ana prensip:

> Önce incele → planla → test yaz → kodla → test et → raporla.

---

# 12. PLAYBOOK YETKİ KURALI

Bu dosya proje yönetim ve handover kaynağıdır.

**Tek yetkili editör: ChatGPT — Başkomutan.**

AI çalışanlar:

- okuyabilir
- kuralları uygulayabilir
- değişiklik ihtiyacını raporlayabilir
- fakat dosyayı değiştiremez
- roadmap'i kendi başına değiştiremez
- kendi işini resmi checkpoint olarak kaydedemez

---

# 13. AI ÇALIŞAN SINIRLARI

Her görev başlangıcında:

```text
Backend'e dokunma gerekmiyorsa backend'e dokunma
Gereksiz migration oluşturma
gereksiz dependency ekleme
secret kullanma
token/password loglama
frontend'i security authority kabul etme
fake API/data üretme
mevcut API contractını bozma
testleri gevşeterek GREEN yapma
commit/push yapma
FLOWTIGER_PROJECT_PLAYBOOK.md dosyasını değiştirme
```

Test başarısız olduğunda assertion silme, skip ekleme, timeout ile problemi gizleme veya gerçek production bug'ını test beklentisini gevşeterek kapatma yapılmaz.

---

# 14. TEST GATE PROSEDÜRÜ

## Web

```bash
npm test
npm run typecheck
npm run build
```

Üçü GREEN.

## Flutter

```bash
flutter analyze
flutter test
```

İkisi GREEN.

## Backend

```bash
php artisan test
```

GREEN.

Faz kapanışında:

- test
- scope kontrolü
- git status
- security sanity
- commit
- push
- ChatGPT playbook checkpoint güncellemesi

gerekir.

---

# 15. GÜVENLİK KONTROL LİSTESİ

Her büyük değişiklikte:

- [ ] password loglanmıyor
- [ ] token loglanmıyor
- [ ] Authorization header loglanmıyor
- [ ] secret source code'da yok
- [ ] company_id client authority değil
- [ ] active_company_id client authority değil
- [ ] role client authority değil
- [ ] tenant isolation korunuyor
- [ ] API authorization korunuyor
- [ ] 401 merkezi yönetiliyor
- [ ] 403 doğru
- [ ] 404 bilgi sızıntısı yaratmıyor
- [ ] 422 validation doğru
- [ ] 429 rate limit doğru
- [ ] audit güvenli
- [ ] PII kuralları korunuyor
- [ ] mali/vergi çıktıları tahminse açıkça etiketli
- [ ] finansal hesaplamalar açıklanabilir

---

# 16. PERFORMANCE KURALLARI

Öncelik:

1. correctness
2. security
3. testability
4. maintainability
5. performance

Dikkat:

- N+1
- unbounded list
- gereksiz API çağrısı
- tekrar eden fetch
- sınırsız pagination
- devasa audit listesi
- client infinite retry
- finans dashboard'larında gereksiz tekrar sorgulama

---

# 17. UI GELİŞTİRME KURALLARI

FlowTiger tasarım dili:

- sade
- premium
- kurumsal SaaS
- yüksek okunabilirlik
- restrained motion
- temiz whitespace
- güçlü typography
- tutarlı spacing

Kaçınılacak:

- aşırı gradient
- aşırı glassmorphism
- gereksiz motion
- her yere kart
- veri yokken fake KPI
- sahte finansal sonuç
- yapay demo data'yı production davranışı gibi sunma

---

# 18. BACKEND FREEZE İSTİSNASI

Backend şu durumlarda yeniden açılabilir:

- gerçek client ihtiyacı mevcut API ile çözülemiyorsa
- bug/security düzeltmesi gerekiyorsa
- production release zorunluluğu varsa
- Finance / Invoice gibi yeni ürün katmanı gerçekten yeni API/schema gerektiriyorsa

Yeni endpoint/migration öncesi:

1. neden gerekli?
2. client workaround neden kötü?
3. security etkisi?
4. migration gerekir mi?
5. test matrisi?
6. API version etkisi?

belirlenir.

---

# 19. LANSMAN İÇİN ÖNCELİK MATRİSİ

30.08.2026 lansmanına kadar:

## P0

- Login
- Company Selection
- Dashboard
- Customer Management
- Team Management
- Invitation owner flow
- Audit History
- Profile temel akışı
- Mobile Preview
- profesyonel lansman tanıtımı

## P1

- Security UI
- Invite accept flow
- polished empty/error/loading states
- satış/demo materyalleri
- işletme sahibine ürün anlatım senaryosu

## P2

- Finance foundation'ın lansman sonrası hazırlığı
- advanced dashboard analytics
- notifications
- advanced AI
- billing
- advanced reports

P2 özellikleri 30.08 lansmanını geciktirmez; ancak Finance / Accounting vizyonu roadmap'ten çıkarılamaz.

---

# 20. 01.10.2026 RELEASE ÖNCELİKLERİ

P0:

- production deploy
- domain / HTTPS
- mail / queue
- Android build
- iOS build
- app store assets
- release signing
- error monitoring
- backups
- CI
- smoke tests
- release QA

P1:

- polished onboarding
- security notifications
- password reset UX
- session management UX

P2:

- Finance / Invoice production layer (gerçek kapsamına göre)
- advanced AI
- complex reports
- advanced automation

---

# 21. SON CHECKPOINT

**Tarih:** 21.08.2026  
**Aktif çalışma hattı:** Profile + Security / Subphase A

## Son doğrulanmış veriler

```text
Backend: 452 tests / 1494 assertions GREEN
Web Audit: 211/211 GREEN + typecheck + build GREEN
Flutter Audit: 189/189 GREEN + flutter analyze GREEN
Flutter Invitation: 128/128 GREEN + flutter analyze GREEN
```

Profile + Security Web Subphase A implementation tamamlandı; Windows ortamında gerçek `npm test`, `npm run typecheck`, `npm run build` kapısı ayrıca doğrulanmalıdır.

## Ürün roadmap checkpoint

```text
Operations
   ↓
Customer / Team / Invitation / Audit
   ↓
Profile + Security
   ↓
Finance Foundation
   ↓
Invoice Management
   ↓
Payments & Collections
   ↓
Tax / Obligation Assistant
   ↓
Accountant Workspace
   ↓
Official e-Document integrations
   ↓
Advanced AI / Automation
```

## Çok önemli ürün kararı

> **FlowTiger'ın ilk planındaki finans/muhasebe katmanı resmi ürün vizyonunun parçasıdır.**
>
> Kullanıcının işletmesinde ne kadar gelir, gider, tahsilat, ödeme, KDV ve diğer mali yükümlülük bulunduğunu anlamasına yardım etmek; fatura kesme/yönetme; finansal özet sunmak; ve uygun aşamada mali müşavir ile çalışma yüzeyi sağlamak roadmap'in temel parçalarıdır.

Bu karar yalnızca “gelecekte fikir olabilir” notu değildir. Uygulama geliştirme planında korunacak ürün gereksinimidir.

---

# 22. BAŞKOMUTANIN YÖNETİM KURALI

**AI çalışan kod yazar.**

**ChatGPT:**

- kapsamı belirler
- sırayı belirler
- güvenlik sınırlarını korur
- test gate'ini kontrol eder
- roadmap'i yönetir
- commit/push kararını denetler
- yeni AI hesabına handover hazırlar
- playbook'u güncel tutar
- resmi checkpoint'i doğrular
- lansman / release önceliklerini yönetir

**Kullanıcı:**

- gerçek ortamda komutları çalıştırır
- test çıktılarını sağlar
- ürün / launch kararlarını onaylar

Yönetim zinciri:

```text
Kullanıcı
   ↓ ürün / launch kararları
ChatGPT — Başkomutan
   ↓ kapsam + sıra + güvenlik + kalite + playbook
AI çalışanları
   ↓ implementation + test + rapor
Repository
```

---

# 23. EN ÖNEMLİ KURAL

> Hızlı gitmek = güvenliği veya testleri atlamak değildir.

Doğru hız:

```text
Plan
↓
Test
↓
Implementation
↓
Test
↓
Review
↓
Commit
↓
Push
↓
ChatGPT playbook update
↓
Yeni checkpoint
```

---

# 24. BİR SONRAKİ ADIM

Şu anda:

```text
Profile + Security / Subphase A
```

Sıradaki teknik akış:

```text
Profile + Security web doğrulama
   ↓
Profile + Security Flutter
   ↓
Sessions / Security Events
   ↓
Forgot / Reset
   ↓
Web/Mobile parity + polish
   ↓
Launch Demo / Marketing Readiness
   ↓
Finance Foundation tasarım ve API sözleşmesi
   ↓
Invoice / Payments / Tax Assistant
```

Her aşama kendi test gate'i GREEN olmadan kapanmaz.
