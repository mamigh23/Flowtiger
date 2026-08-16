FLOWTIGER — PROJECT PLAYBOOK / ANA YÖNETİM BELGESİ
Belge amacı: FlowTiger projesinin mimarisini, mevcut durumunu, geliştirme sırasını, kalite kapılarını, AI çalışanlarının (Claude vb.) görev ve sınırlarını ve proje yönetim kurallarını tek bir yerde tutmak.
Belge sahibi / koordinasyon: ChatGPT — Başkomutan / teknik kapsam ve kalite denetimi  
Tarih: 16.08.2026  
Lansman tarihi: 30.08.2026  
Planlanan resmi uygulama çıkışı: 01.10.2026  
Repository: `https://github.com/mamigh23/Flowtiger`  
Branch: `master`
---
1. PROJENİN ANA HEDEFİ
FlowTiger, çok kiracılı (multi-tenant) bir SaaS uygulamasıdır.
Temel fikir:
Bir kullanıcı birden fazla şirkete üye olabilir.
Her şirketin verisi tenant izolasyonu ile ayrılır.
Kullanıcı aktif bir şirket seçer.
Backend her istekte kimlik + şirket bağlamı + yetki kontrolü yapar.
Web ve mobil istemciler aynı Laravel API'yi kullanır.
Web: React + TypeScript + Vite.
Mobile: Flutter + Dart + Riverpod.
Android ve iPhone tek Flutter kod tabanından geliştirilecektir.
FlowTiger'ın güvenlik modeli client'a değil backend'e dayanır.
Ana kural:
> Frontend sadece kullanıcı deneyimini yönetir. Gerçek yetki ve tenant güvenliği backend'dedir.
---
2. TEKNOLOJİ MİMARİSİ
Backend
Laravel
PHP
PostgreSQL
Laravel Sanctum
REST API
PHPUnit / Laravel test altyapısı
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
Web
React
TypeScript
Vite
React Router
React Context
`fetch` tabanlı merkezi API client
CSS custom properties / kendi design token sistemi
Mobile
Flutter
Dart
Riverpod
`http`
`flutter_secure_storage`
Android + iOS:
```text
Flutter codebase
      ↓
Android
iPhone / iPad
```
---
3. KALICI MİMARİ KURALLAR
Bu kurallar fazlardan bağımsızdır.
3.1 Backend authority
Şunlar client tarafından belirlenemez:
`company_id`
`active_company_id`
`customer_no`
role yetkisi
membership yetkisi
tenant erişimi
Client sadece doğru endpointi çağırır.
3.2 Tenant isolation
Tenant izolasyonu bir UI özelliği değildir.
Backend katmanında korunur:
PostgreSQL FK / unique constraints
`CompanyScope`
`BelongsToCompany`
`CompanyContext`
Policy
Service guardları
HTTP middleware
Başka tenant verisini client'ta gizlemek güvenlik sayılmaz.
3.3 Secrets
Asla:
password
password hash
Sanctum token
invitation token
password reset token
verification token
Authorization header
API key
secret
DB password
loglanmaz veya audit'e yazılmaz.
3.4 Test gate
Bir faz:
> “Kod yazıldı”
diye tamamlanmaz.
Başarı kriteri:
> Gerçek test suite GREEN.
Test çalıştırılmadan production/finished iddiası yapılmaz.
3.5 Migration kuralı
Mevcut migration geçmişi değiştirilmez.
Yeni schema değişikliği gerekiyorsa:
yeni migration
backward-compatible
PostgreSQL uyumlu
mevcut veriyi bozmayacak
yaklaşım kullanılır.
3.6 Gereksiz abstraction yok
YAGNI uygulanır.
Bir iş kuralı gerçekten gerektirmiyorsa:
ikinci service
gereksiz repository
gereksiz observer sistemi
gereksiz package
gereksiz abstraction
eklenmez.
Ancak transaction/audit/authorization bütünlüğü gerektiriyorsa business logic service katmanına taşınabilir.
---
4. BACKEND FAZ DURUMU
Aşağıdaki backend foundation tamamlanmıştır.
Faz	Durum	Sonraki kontrol
Faz 0	✅	Git / PostgreSQL / test foundation
Faz 1	✅	Tenant isolation
Faz 2.1	✅	Authentication / Sanctum
Faz 2.2	✅	Company selection
Faz 2.3	✅	API auth + context
Faz 3	✅	Customer CRUD
Faz 4	✅	Team / Membership / Roles
Faz 5	✅	Audit log
Faz 6	✅	Invitation
Faz 7	✅	Email verification / profile / password
Faz 8	✅	Password reset
Faz 9	✅	Session / account security
Faz 10	✅	Production hardening / foundation freeze
Faz 10 sonucu
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
Bu noktadan sonra backend foundation freeze kabul edilir.
Yeni backend özelliği gerekiyorsa:
gerçekten gerekli mi?
mevcut API ile çözülemiyor mu?
web/mobile ihtiyacından mı doğdu?
mevcut güvenlik modelini koruyor mu?
soruları cevaplanmadan backend açılmaz.
---
5. CLIENT FOUNDATION DURUMU
Client foundation commit
```text
549f25e
feat(client): initial web and mobile foundation
```
Web foundation
React + TypeScript + Vite
AuthContext
CompanyContext
ProtectedRoute
PublicOnlyRoute
merkezi API client
in-memory token storage
temel design tokens
temel UI components
Son doğrulanmış foundation:
```text
24 web tests passed
typecheck ✅
build ✅
```
Mobile foundation
Flutter
Riverpod
AuthGate
LoginScreen
Company controller
AppShell
secure token storage
centralized HTTP client
Android project
iOS project
Son doğrulanmış foundation:
```text
19 Flutter tests passed
flutter analyze ✅
```
---
6. ŞU ANKİ AKTİF İŞ
Tarih: 16.08.2026
Aktif iş:
FIRST PRODUCT UI
```text
Login
   ↓
Company Selection
   ↓
Dashboard
```
Web tarafında bu çalışma sırasında foundation üzerine gerçek ürün UI'ı ekleniyor.
Son görülen web durumu:
```text
42/42 tests GREEN
typecheck GREEN
build GREEN
```
Flutter tarafı bunun devamında:
CompanySelectionScreen
DashboardScreen
AppShell
AuthGate routing
ile tamamlanacak.
Bu iş bitmeden yeni ürün modülüne geçilmez.
---
7. 30.08.2026 LANSMAN HEDEFİ
Uygulamanın mağazada yayınlanması lansman için şart değildir.
30.08.2026 lansmanında gösterilecek akış:
```text
Landing Page
      ↓
Dashboard Demo
      ↓
Customer Management
      ↓
Team Management
      ↓
Company Switching
      ↓
Audit History
      ↓
Mobile App Preview
      ↓
Coming Soon
Launching 01.10.2026
```
Lansman yaklaşımı
Lansman için:
gerçek UI
gerçek navigasyon
gerçek API'ye bağlı demo akışları
gerçek uygulama tasarımı
cihaz mockup'ları
ekran görüntüleri
kısa demo video
hazır olmalı.
Uygulama mağazada henüz yayınlanmamış olabilir.
---
8. 01.10.2026 RESMİ ÇIKIŞ HEDEFİ
Planlanan resmi uygulama çıkışı:
01.10.2026
Beklenen platformlar:
Web
Android
iPhone / iPad
iOS kritik bağımlılık
Flutter kodu Windows'ta geliştirilebilir.
Ancak iOS production signing / archive / App Store süreçleri macOS + Xcode gerektirir.
Bu nedenle iOS yayın planı ayrıca takip edilmelidir.
---
9. BUNDAN SONRAKİ GELİŞTİRME SIRASI
Backend foundation tamamlandığı için öncelik client productization.
AŞAMA 1 — First Product UI
Şu an:
Login
Company Selection
Dashboard Shell
Tamamlandıktan sonra test + build GREEN.
AŞAMA 2 — Customer UI
Web + Mobile:
Customer list
Pagination
Customer create
Customer detail
Customer update
Customer delete
Validation
Loading/empty/error states
Tenant-aware UI
Backend mevcut endpointleri kullanılır.
Yeni endpoint gerekmiyorsa backend açılmaz.
AŞAMA 3 — Team UI
Member list
Member detail
Add/invite
Role change
Remove
Owner-only UI controls
Last-owner güvenlik davranışlarının görünür UI karşılığı
Frontend role check yalnızca UX'tir.
Gerçek authorization backend'dedir.
AŞAMA 4 — Invitation UI
Invitation list
Invite member
Role selection
Revoke
Accept invitation flow
Loading/error/expired states
Token hiçbir yere loglanmaz.
AŞAMA 5 — Audit UI
Audit history
Pagination
Action badge
Actor
timestamp
safe metadata display
Secret ve PII kuralları korunur.
AŞAMA 6 — Profile + Security UI
Profile
Email verification
Password change
Password reset
Sessions
Revoke session
Security events
AŞAMA 7 — Web/Mobile parity
Web ve Flutter feature parity kontrolü.
Her iki istemci için:
loading
empty
error
401
403
404
422
429
durumları gözden geçirilir.
AŞAMA 8 — Product polish
responsive
typography
spacing
design consistency
accessibility
animations (gerektiği kadar)
empty states
skeletons
navigation polish
Aşırı animation / glassmorphism / gereksiz görsel yük yok.
AŞAMA 9 — Launch Demo
30.08 lansmanına yönelik:
gerçek ekran görüntüleri
dashboard demo
customer demo
team demo
company switching
audit demo
mobile preview
landing page integration
AŞAMA 10 — Production candidate
01.10 çıkışı için:
production deploy
Android build
iOS build
web production
mail
queue
monitoring
backup
release QA
---
10. AI ÇALIŞANLARIN GÖREV TANIMI
Bu proje farklı AI hesaplarında devam ettirilebilir.
Claude, ChatGPT veya başka bir AI çalışanı:
Yapabilir
repository incelemek
mevcut mimariyi öğrenmek
test yazmak
UI yazmak
API client yazmak
mevcut endpointleri kullanmak
bug araştırmak
küçük refactorlar yapmak
dokümantasyon hazırlamak
static analysis yapmak
test çalıştırmak
build çalıştırmak
sonucu raporlamak
Tek başına karar vermemesi gereken konular
Şunlarda önce yöneticinin kararı gerekir:
backend mimarisini değiştirmek
yeni auth sistemi
yeni tenant modeli
database schema'yı büyük ölçüde değiştirmek
yeni dependency eklemek
mevcut security modelini gevşetmek
`CompanyContext` / tenant isolation mantığını değiştirmek
Sanctum'u değiştirmek
token storage güvenliğini gevşetmek
client'ta security authority oluşturmak
migration geçmişini değiştirmek
production secret eklemek
destructive migration
mevcut endpoint contractını kırmak
AI çalışanının temel prensibi
> Önce incele, sonra planla, sonra test yaz, sonra kodla, sonra test et, sonra raporla.
“Çalışıyor gibi” görmek yeterli değildir.
---
11. AI ÇALIŞAN SINIRLARI
Her görev başlangıcında AI çalışana şu sınırlar hatırlatılır:
```text
Backend'e dokunma
gerekmiyorsa migration oluşturma
gereksiz dependency ekleme
secret kullanma
token/password loglama
frontend'i security authority kabul etme
fake API/data üretme
mevcut API contractını bozma
testleri gevşeterek GREEN yapma
commit/push yapma
```
Özellikle yasak
Bir test başarısız olduğunda:
assertion kaldırmak
test kapsamını azaltmak
`skip` eklemek
timeout artırarak problemi gizlemek
test datasını değiştirmeden problemi saklamak
production bug'ını test beklentisini gevşeterek kapatmak
yapılmaz.
Önce kök neden bulunur.
---
12. TEST GATE PROSEDÜRÜ
Bir AI çalışanı:
```text
kod yazdı
```
demesiyle görev bitmez.
Web
```bash
npm test
npm run typecheck
npm run build
```
Üçü de GREEN.
Flutter
```bash
flutter analyze
flutter test
```
İkisi de GREEN.
Backend
```bash
php artisan test
```
GREEN.
Faz kapanış şartı
beklenen testler GREEN
scope kontrolü
git status kontrolü
dosya değişikliği kontrolü
security sanity check
commit
---
13. COMMIT / PUSH PROSEDÜRÜ
Her iş tamamlandığında:
1
```bash
git status --short
```
2
Sadece görev kapsamındaki dosyalar stage edilir.
3
Test sonucu kontrol edilir.
4
Commit mesajı:
```text
feat(backend): ...
feat(client): ...
chore(backend): ...
chore(client): ...
fix(client): ...
fix(backend): ...
```
5
Commit alınır.
6
GitHub'a push yapılır.
7
Bu belge güncellenir.
---
14. HER COMMIT SONRASI PLAYBOOK GÜNCELLEME KURALI
Bu belge yaşayan bir belgedir.
Her commit/push sonrasında aşağıdaki bilgiler güncellenir:
Son commit hash
Yapılan iş
Test sonucu
Build sonucu
Yeni açılan mimari karar
Kalan riskler
Sıradaki görev
Tarih
Gerekirse görevli AI / çalışma oturumu notu
Örnek:
```text
16.08.2026
Commit: abc1234
Scope: client/customer-ui
Web: 55 tests GREEN
Flutter: 31 tests GREEN
Next: team UI
```
---
15. FAZ GEÇİŞ KURALI
Yeni faza:
eski faz GREEN değilse
working tree kontrol edilmemişse
migration belirsizse
auth/tenant regresyonu varsa
test kırmızıysa
geçilmez.
---
16. YENİ AI HESABINA PROJE DEVRİ
AI limiti dolduğunda yeni Claude hesabı kullanılabilir.
Yeni AI'a projeyi sıfırdan anlatmak yerine:
GitHub repository bağlanır.
Bu `PROJECT_PLAYBOOK.md` okunur.
`README.md` okunur.
`docs/PRODUCTION.md` okunur.
Son commit incelenir.
Son görev checkpoint'i okunur.
Sadece aktif görev promptu verilir.
Yeni AI önce:
> “Repository'yi inceledim ve mevcut mimariyi anladım.”
demeden kod yazmaya başlamamalıdır.
---
17. YENİ AI İÇİN HANDOVER TEMPLATE
Her yeni AI oturumunun başına:
```text
FLOWTIGER HANDOVER

Repository:
https://github.com/mamigh23/Flowtiger

Önce:
docs / README / PROJECT_PLAYBOOK
ve son commit'i incele.

Backend freeze:
Faz 0–10 tamamlandı.

Backend foundation:
452 tests / 1494 assertions GREEN

Client foundation:
Web + Flutter hazır.

Şu anki aktif görev:
[AKTİF GÖREV]

Kurallar:
- mevcut mimariyi bozma
- backend'e gerekmedikçe dokunma
- önce test
- sonra implementation
- GREEN olmadan tamamlandı deme
- commit/push yapma
```
---
18. GÜVENLİK KONTROL LİSTESİ
Her büyük değişiklikte:
[ ] password loglanmıyor
[ ] token loglanmıyor
[ ] Authorization header loglanmıyor
[ ] secret source code'da yok
[ ] company_id client authority değil
[ ] active_company_id client authority değil
[ ] role client authority değil
[ ] tenant isolation korunuyor
[ ] API authorization korunuyor
[ ] 401 merkezi yönetiliyor
[ ] 403 doğru
[ ] 404 bilgi sızıntısı yaratmıyor
[ ] 422 validation doğru
[ ] 429 rate limit doğru
[ ] audit güvenli
[ ] PII kuralları korunuyor
---
19. PERFORMANCE KURALLARI
Gereksiz optimization yok.
Öncelik:
correctness
security
testability
maintainability
performance
Ama şu risklere dikkat edilir:
N+1
unbounded list
gereksiz API çağrısı
tekrar eden fetch
sınırsız pagination
devasa audit listesi
client infinite retry
---
20. FRONTEND AUTH STORAGE KARARI
Web
Şu an:
token sadece memory'de
Kullanıcı refresh yaptığında session kaybolabilir.
Bu bilinçli güvenlik kararıdır.
İleride backend httpOnly cookie / uygun refresh modeline geçilecekse:
`web/src/lib/auth/tokenStorage.ts`
tek adaptör noktası olarak kullanılmalıdır.
localStorage'a token yazılması için acil gerekçe olmadan geçiş yapılmaz.
Mobile
`flutter_secure_storage`
kullanılır.
Plain `SharedPreferences` token storage yapılmaz.
---
21. UI GELİŞTİRME KURALLARI
FlowTiger tasarım dili:
sade
premium
kurumsal SaaS
yüksek okunabilirlik
restrained motion
temiz whitespace
güçlü typography
tutarlı spacing
Kaçınılacak:
aşırı gradient
aşırı glassmorphism
gereksiz motion
her yere kart
veri yokken fake KPI
yapay demo data'yı production davranışı gibi sunma
Lansman ekranlarında demo verisi gösterilecekse bunun demo olduğu netleşmelidir.
---
22. BACKEND FREEZE İSTİSNASI
Backend freeze değişmez bir kilit değildir.
Aşağıdaki durumda backend tekrar açılabilir:
gerçek client ihtiyacı mevcut API ile çözülemiyorsa
bug/security düzeltmesi gerekiyorsa
production release zorunluluğu varsa
Ama yeni endpoint öncesi:
neden gerekli?
client workaround neden kötü?
security etkisi?
migration gerekir mi?
test matrisi?
API version etkisi?
belirlenir.
---
23. LANSMAN İÇİN ÖNCELİK MATRİSİ
30.08.2026 lansmanına kadar öncelik:
P0 — kesinlikle gerekli
Login
Company Selection
Dashboard
Customer Management
Team Management
Company Switching
Audit History
Mobile Preview
P1
Profile
Security
Invitation UI
polished empty/error/loading states
P2
advanced dashboard analytics
notifications
AI
billing
advanced reports
P2 özellikleri lansmanı geciktirmez.
---
24. 01.10.2026 RELEASE ÖNCELİKLERİ
Resmi çıkış öncesi:
P0:
production deploy
domain / HTTPS
mail
Android build
iOS build
app store assets
release signing
error monitoring
backups
CI
smoke tests
P1:
polished onboarding
security notifications
password reset UX
session management UX
P2:
advanced AI
complex reports
advanced automation
---
25. ŞU ANDAKİ CHECKPOINT
Tarih: 16.08.2026 13:00
Son sabit client foundation:
```text
549f25e
feat(client): initial web and mobile foundation
```
Backend:
```text
6ffeb79
chore(backend): faz 10 - production hardening and foundation freeze
```
En son kalıcı test kayıtları:
```text
Backend: 452 tests / 1494 assertions
Web foundation: 24 tests
Flutter foundation: 19 tests
```
Aktif görev:
```text
FIRST PRODUCT UI
Login
→ Company Selection
→ Dashboard Shell
```
Geçici çalışma durumunda Web tarafı:
```text
42/42 tests GREEN
typecheck GREEN
build GREEN
```
Flutter tarafı devam ediyor.
---
26. BAŞKOMUTANIN YÖNETİM KURALI
Bu belge ile birlikte şu yönetim modeli geçerlidir:
AI çalışan kod yazar.
ChatGPT:
kapsamı belirler
sırayı belirler
güvenlik sınırlarını korur
test gate'i kontrol eder
commit/push kararını denetler
yeni AI hesabına handover hazırlar
proje dokümantasyonunu güncel tutar
lansman tarihine göre önceliklendirme yapar
Kullanıcı:
gerçek Windows/macOS ortamında komutları çalıştırır
test çıktılarını sağlar
gerektiğinde ürün kararlarını verir
launch / release kararlarını onaylar
---
27. EN ÖNEMLİ KURAL
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
Playbook update
```
Her değişiklik bu zinciri mümkün olduğunca korur.
---
28. BİR SONRAKİ ADIM
Aktif iş tamamlandığında:
Web Login/Company/Dashboard GREEN
Flutter Login/Company/Dashboard GREEN
Commit
Push
Bu playbook güncelle
Customer UI'ya geç
