# FlowTiger — durum analizi ve uygulama yol haritası

İlk envanter: 17.10.2026 / `a6cd7b3`. Güncel ürün yönü: 18.10.2026.
Çalışma dalı: `feat/release-stabilization`; sonraki uygulama commitleri Git
geçmişi ve ana playbook checkpoint'lerinde izlenir.
Bu belge ana playbook'un operasyonel tamamlayıcısıdır; güvenlik kurallarını
ve faz sırasını değiştirmez. Öncelik mevcut web sürümünün yayınıdır.
Sonraki fazlar burada planlanır; başlatılmaları ayrıca kararlaştırılır.

## 1. Yönetim özeti

**Ürün kararı:** Kullanıcı uygulamayı çözmek veya modüller arasında ne
arayacağını düşünmek zorunda kalmamalı. Girişte günün işini ve sonraki
somut adımı görmeli. Ekran önceliği günlük rehber → mevcut işin ayrıntısı
→ işi tamamladıktan sonra rehbere dönüş → şirket planı → genel sayımlar.
Bir kaydın var olması tek başına yapılacak iş/uyarı üretmez.

FlowTiger'ın kimlik/şirket omurgası ve web üzerindeki temel işletme modülleri
uygulanmıştır. Aktif faz Aşama 9 — Web Release Stabilization'dır.
Testleri geçen kod vardır; doğrulanmış canlı release henüz yoktur.
Kullanıcının son bildirimine göre sunucu kapalıdır. API adresi, sunucu dizini,
aktif dal/commit, TLS, yedek ve gerçek e-posta teslimi doğrulanmamıştır.

Sıra: mevcut web kabulü → kontrollü yayın → kullanım/işletim doğrulaması →
ayrıca yetkilendirilirse mobil → Finance V2 → AI → resmi çok platformlu çıkış.
SaaS abonelikleri resmi ticari çıkış öncesi ayrı domain olarak ele alınır.
Takvim, sunucunun açılma ve kabul sonuçları bilinmeden tarih taahhüdüne çevrilmez.

## 2. Kanıt ve doğrulama durumu

Son çalıştırılmış kontroller: backend 17.10.2026, UX-01 düzeltmesi sonrası web 18.10.2026.

| Kapı | Sonuç | Kanıtın sınırı |
|---|---|---|
| Backend tam paket | 824 test, 3.083 assertion geçti | Ayrı `flowtiger_test`; canlı doğrulama değil |
| Web regresyon | 50 dosya, 843 test geçti | Taklit HTTP yanıtları gerçek sunucunun yerine geçmez |
| Yayın adresi kontrolü | 14 test geçti | DNS/TLS/erişilebilirlik kontrolü yapmaz |
| TypeScript, normal build | Geçti | Gerçek API ile yayın paketi henüz üretilmedi |
| Pint | Değişen üç PHP dosyası geçti | Tüm deponun stil kontrolü olarak yorumlanmaz |
| `git diff --check` | Geçti | İşlevsellik veya canlı çalışma kanıtı değil |
| Gerçek browser/API turu | Bekliyor | İzole test şirketleriyle çalıştırılmalı |
| Canlı yayın/geri dönüş | Bekliyor | Sunucu envanteri ve yedek gerekli |

İlk envanterdeki sonuçlar sonraki uygulama checkpoint'leriyle güncellenmiştir.
Her yayın öncesi aday commit ve uzak dal tekrar okunur; `master` ile çalışma
dalının aynı olduğu varsayılmaz. Canlıya alınmış commit henüz doğrulanmadı.

## 3. Modül envanteri

| Alan | Uygulanmış yetenek | Eksik veya doğrulanmamış |
|---|---|---|
| Backend güvenliği | Sanctum, policy, şirket bağlamı, tenant scope, üyelik kontrolü | Canlı proxy/TLS/CORS ve çalışma ortamı |
| Hesap | Kayıt, giriş/çıkış, profil, parola değişimi/kurtarma, doğrulama | Gerçek mail teslimi ve bağlantıların uçtan uca testi |
| Şirket | Liste/seçim/değişim, şirket üyeliği | Canlı iki şirket testi; genel şirket yönetimi ekranı sınırlı |
| Müşteri | Sayfalı liste, oluşturma, detay, güncelleme, silme | Büyük listelerde ilişkili form seçicileri |
| Görev | Oluşturma, atama, tarih/saat, tamamlama/yeniden açma | Canlı saat dilimi, günlük görünüm ve atama kabulü |
| Ekip/davet | Üyelik/rol, kaldırma, davet gönderme/iptal/kabul, gelen davetler | Gerçek alıcılarla kabul ve e-posta doğrulama zinciri |
| Audit | Liste, sayfalama, güvenli detay gösterimi | Sunucu filtre sunmuyor; canlı iş işlemiyle iz tutarlılığı ve erişim kabulü |
| Dashboard | Kişisel atamayı gözeten günlük rehber, şirket planı, rehbere dönüş, alt bölümde kayıt sayıları | Öneri görünen günlük görevlerle sınırlı; dönemsel finansal raporlama API'si yok |
| İşletme finansı | Gelir/gider, KDV hesabı, ödeme/dağıtım ve iptal | Fatura, tam alacak/borç, dönem raporları, export yok |
| Güvenlik yönetimi | Backend oturum ve güvenlik olayı uçları | Web profilinde oturum/güvenlik olayı ekranları yok |
| Mali kimlik | Backend şirket/müşteri billing güncelleme uçları | Eksiksiz web mali kimlik düzenleme akışı yok |
| Mobil | Auth, şirket, müşteri, ekip/davet, audit/profil temeli | Görev/finans/ödeme eşitliği, cihaz/build/mağaza doğrulaması |
| SaaS billing | Ayrı mimari tasarımı | Plan, abonelik, checkout, webhook ve erişim sistemi yok |
| AI | Ürün vizyonu | Uygulanmış yardımcı katman yok |

Billing kimlik alanları, işletmenin faturaları ve FlowTiger SaaS aboneliği
birbirinden ayrı kavramlardır; aynı model/ödeme akışında birleştirilmez.

## 4. Teknik incelemeden çıkan öncelikler

P0: yayın kabulünü durdurur. P1: doğrulanıp çözülmesi gereken kullanım/
bütünlük konusu. P2: sonraki ürün geliştirmesi. Aşağıdaki aday riskler,
regresyon veya gerçek kullanım kanıtı olmadan kesin hata olarak kapatılmaz.

| ID | Öncelik | Bulgu ve kanıt | Yapılacak iş / kabul |
|---|---|---|---|
| REL-01 | P0 | Sunucu kapalı; yayın yolu ve sürümü bilinmiyor | Salt okunur envanter; web/API origin ve commit kaydı |
| REL-02 | P0 | Önceki HTTPS isteği ad/zincir doğrulamasında başarısız | Sunucu açılınca bağımsız doğrulama; geçerli sertifika ve tam zincir |
| REL-03 | P0 | Gerçek kullanıcı turu tamamlanmadı | İki şirket + owner/member ile ana zincirin geçmesi |
| REL-04 | P0 | Yayın yedeği/geri dönüş kanıtı yok | Yedek ve geri yükleme kontrolü, önceki uygulama paketinin korunması |
| REL-05 | P0 | Gerçek API kökü bilinmiyor | Doğru origin ile `build:release`; localhost paketi yüklenmemesi |
| FIN-01 | Tamamlandı | Eski model iptal durumunu atlayabiliyordu | Kilit altında güncel okuma; dört regresyon geçti, `a6cd7b3` |
| FIN-02 | P1 | Gerçek paralel bağlantı testi yok | Ayrı test ortamında update/void ve void/void yarışları; tek ilk iptal/audit |
| UX-01 | Yerel düzeltme tamamlandı | PaymentForm müşteri/hedef seçenekleri istek üzerine sayfalanıyor | 101. müşteri/hedef seçilip doğru kimlikle gönderildi; ek sayfa hatasında seçim ve mevcut dağıtımlar korunur. Gerçek sunucu kabulünde tekrar doğrulanacak |
| AUTH-01 | P1 inceleme | API 401 yarışı düzeltildi; AuthContext bootstrap/refresh/logout ayrı async yollar | Çıkış-yeni giriş-gecikmiş başarı/hata sıraları için kullanıcı/token tutarlılığı testleri |
| HTTP-01 | P1 koşullu | CORS `exposed_headers=[]`; client `Retry-After` okuyor | API farklı origin ise 429 bekleme süresinin tarayıcıdan okunmasını doğrula |
| OPS-01 | P1 | CI var; sunucu deployment/izleme bağlantısı kayıtlı değil | Commit→build→yayın izlenebilirliği, sağlık/log kontrolü |
| DOC-01 | P1 | Eski README/faz tarihleri güncel ürünle eşleşmiyor | Tarihsel kaydı koruyarak güncel durum ve engelleri tek checkpoint'e bağla |
| SEC-01 | P2 | Token yalnızca bellekte, yenilemede giriş gerekiyor | Mevcut davranışı kullanıcıya açıklığa kavuştur; kalıcılığı localStorage ile çözme |

UX-01 çözümünde ilk tercih mevcut sayfalı API'yle daha fazla seçenek yüklemek;
sunucu araması gerekirse ayrı ihtiyaç/kontrat kararı alınır. Tüm sayfaları
kontrolsüz indirme veya yeni bağımlılık ekleme varsayılan çözüm değildir.
Finans dağıtımlarında yön, müşteri, iptal edilmiş hedef ve fazla tahsilat
politikaları da raporlama öncesi netleştirilmelidir; bugünkü kuralların
ötesinde davranış varsayılarak mevcut veriler değiştirilemez.

18.10.2026 UX-01 uygulaması: ödeme formunda iki bağımsız "daha fazla yükle"
kontrolü, her tıklamada en fazla bir sayfa (`per_page=100`). Hata aynı sayfada
tekrar denenebilir; yüklenen kayıtlar silinmez, ID bazında tekilleştirilir.
Düzenlemede ödemenin kendi müşteri özeti ve mevcut dağıtım hedefleri ilk
sayfada olmasa veya seçici isteği başarısız olsa da seçenek olarak korunur.
Yeni API, arama kontratı veya bağımlılık eklenmedi. Diğer modüllerin
seçicileri bu değişiklik kapsamında değildir.

## 5. Şimdi yapılacaklar — Aşama 9

### İç tasarım yenilemesi — kullanıcı tarafından yetkilendirildi

Kullanıcı mevcut iç tasarımı beğenmediğini belirtti ve düzenlemeyi sıraya aldı.
Bu iş mevcut web kapsamındadır; yeni modül/ürün fazı başlatmaz. Eski ekran
görüntüleri yalnızca tasarım geçmişidir; güncel durum yerel önizlemede ölçülür.

- Yön: sade, okunaklı işletme arayüzü; marka turuncusu kontrollü vurgu,
  daha az gradyan/parlama, belirgin yüzey ve tipografi hiyerarşisi.
- Sıra: ortak kabuk/navigasyon → dashboard → müşteri/görev/finans/ekip
  listeleri → detay/formlar → profil/davet/audit → mobil ekran uyumu.
- Dar simge menüsü, gereğinden büyük karşılama alanları, tekrar eden kartlar,
  boşluk kullanımı ve aksiyonların bulunabilirliği güncel ekranlarda incelenir.
- Ortak token/bileşenler üzerinden tutarlılık sağlanır; yeni UI bağımlılığı,
  sahte finansal metrik, yetki/API değişikliği veya yeni özellik eklenmez.
- Önce kabuk ve dashboard üzerinde tasarım yönü somutlaştırılır; sonra aynı
  dil diğer mevcut ekranlara uygulanır. Kullanıcı geri bildirimiyle düzeltilir.
- Kabul: güncel 375px/masaüstü önizleme, klavye/focus/kontrast, loading/empty/
  error durumları ve mevcut işlevler korunur. Tasarım tamamlandıktan sonra
  nihai kullanıcı kabulü ve yayın kapıları yeniden çalıştırılır.

İlk uygulama geçişi yapıldı: etiketli masaüstü menüsü, ortak SVG simgeleri,
kısa dashboard başlığı/iki doğrudan aksiyon, ortak sakin yüzeyler ve dar ekran
özetleri; görev/finans/ödeme formlarında genişlik/alan boşluğu düzenlemesi.
822 web testi ve 14 yayın kontrol testi geçti; typecheck/build başarılı.
Görsel kontrol örnek verili geçici yerel önizlemedir; dosyalar kaldırıldı.
Kullanıcı görsel geri bildirimi ve gerçek sunucu kabulü hâlâ bekleniyor.

18.10.2026 günlük rehber yönü: ana giriş "Bugün" olarak adlandırıldı.
`/tasks/today` verisinden önce kişiye atanmış açık iş, yoksa atanmamış iş
önerilir; her alt kümede sunucunun sırası korunur. Başkasının işi kişisel
öneri gibi sunulmaz; finans/ödeme kayıt sayıları zorunlu aksiyona dönüştürülmez.
49 dosyada 839 web testi ve 14 yayın kontrol testi geçti; typecheck/build
başarılı. İlerleme yalnızca bugünün tüm görevleri görülebiliyorsa gösterilir. Kısmi
sayfada tamamlanma iddiası yerine tam günlük plana bağlantı sunulur.
Yeni istemci rotası `/app/tasks/today` aynı backend ucunu sayfalayarak açar;
tarih istemciden gönderilmez. Görev tamamlandığında günlük rehbere dönüş
bağlantısı vardır. Sunucu sözleşmesi ve veri modeli değiştirilmez.

18.10.2026 devam geçişi: kullanıcı ilk tasarım yönünü olumlu değerlendirdi.
Liste başlıkları/satırları, dokunma alanları, bölüm seçicileri, sayfalama ve
üye/finans/ödeme ayrıntıları ortaklaştırıldı. 822 web testi ve 14 yayın kontrol
testi, typecheck/build başarılı. Müşteri/ekip/denetim akışları örnek verili
yerel önizlemede incelendi; canlı kabul hâlâ bekliyor.

### A. Sunucu ve test ortamı

1. Kullanıcı sunucuyu açar; panel veya SSH erişim yolu belirlenir.
2. Proje/document root, aktif dal/commit, yerel farklar, PHP/Node/PostgreSQL,
   API adresi ve mevcut yayın yöntemi salt okunur olarak kaydedilir.
3. Canlı ortamdan ayrı test şirketleri/veritabanı ve izinli mail alıcıları
   belirlenir. Test paketi production veritabanında çalıştırılmaz.
4. HTTPS, gerçek mail, CORS, frontend bağlantı şablonları ve `/up` doğrulanır.
5. Aday commit ve sunucunun yayın dalı kesinleştirilir. Mevcut dal korunur;
   `master`'a geçiş gerekiyorsa ayrı inceleme/normal merge süreci kullanılır.
   Force push veya kullanıcı değişikliklerini silen komut kullanılmaz.

Çıkış: erişim/konfigürasyon/yedek bilgisi kayıtlı, geçerli HTTPS ve çalışan API.

### B. Gerçek kullanıcı kabulü ve hata kapatma

Sıra: kayıt/giriş → şirket → dashboard → müşteri → görev → finans kaydı →
ödeme/dağıtım → ekip/davet → audit → profil.

- Her modülde mutlu yol, loading/empty/error, tekrar deneme ve çift gönderim.
- Owner/member ve diğer şirkete ait kayıtların reddedilmesi; son owner koruması.
- Şirket değiştirme ve oturum kapanışından sonra eski yanıt/veri kalmaması.
- Ödeme dağıtım toplamları, KDV/yuvarlama, iptal ve audit tutarlılığı.
- E-posta doğrulama, davet ve parola kurtarmanın gerçek teslim/link kabulü.
- 375px/masaüstü, klavye odağı/Escape, doğrudan link, refresh ve geri tuşu.
- 101+ kayıt seçimi, 429 ve gerekiyorsa farklı origin CORS kabulü.
- Her hata için tekrar üretim → dar kapsamlı düzeltme → regresyon → kalite kapısı.

Çıkış: P0 açık yok; veri izolasyonu, para bütünlüğü ve ana kullanım zinciri
başarılı. Kalan P1'ler açıkça kaydedilip yayın etkisi değerlendirilmiş.

### C. Kontrollü web yayını

1. Backend tam paketini tek süreçle `flowtiger_test` üzerinde çalıştır.
2. Web testleri, yayın kontrolü, typecheck, diff kontrolünü çalıştır.
3. Gerçek API ile `npm run build:release`; aynı commit'in paketini yayınla.
4. Önceki çalışan paket ve veri yedeği korunmuş olmalı; rollback adımı hazır olmalı.
5. Yayın sonrası TLS, `/up`, giriş, şirket seçimi ve izinli test şirketindeki
   temel okuma/yazma ile mail bağlantılarını tekrar doğrula.
6. Commit, paket, zaman, kabul sonuçları ve geri dönüş referansını checkpoint'e yaz.

Çıkış: doğrulanmış sürüm gerçek sunucuda çalışıyor. Ancak bundan sonra Aşama 9
kapatılır. Ayrıntılı operasyon adımları: [WEB_RELEASE.md](WEB_RELEASE.md).

## 6. Web yayınından sonra — henüz başlatılmayacak işler

| Sıra / bağlılık | İş paketi | Teslim / kabul |
|---|---|---|
| Web kabulü sonrası | Kullanım ve işletim doğrulaması | Gerçek kullanıcı geri bildirimi, 5xx/429 ve sağlık takibi, geri yükleme tatbikatı; yayın engellerinin yeniden açılmaması |
| Aşama 10, ayrıca yetki sonrası | Mobile Productization | Auth→şirket→dashboard→müşteri→görev→finans→ödeme→ekip→profil; aynı API; analyzer/test ve gerçek cihaz kabulü |
| Mobil kapısı | Android/iOS hazırlığı | Android release build; iOS için macOS/Xcode signing/archive; Flutter CI; mağaza yayını ayrı onay/süreç |
| Aşama 11 | Finance V2 / raporlama | Şirket/dönem filtreli sunucu toplamları, iptal kayıt politikası, kısmi tahsilat/alacak-borç ve tutarlı KDV özeti |
| Raporlama temeli sonrası | Fatura ve mali kimlik | Ürün/hizmet kalemleri, miktar/birim fiyat/iskonto/KDV, durum/numaralandırma, mali kimlik UI ve tahsilat ilişkisi |
| Fatura temeli sonrası | Rapor/export ve müşavir paylaşımı | Yetkili dışa aktarma, kontrollü erişim ve audit; e-belge sağlayıcısı ayrı plan |
| Ayrı ticari hazırlık | SaaS billing | Tenant bazlı plan→abonelik→trial→checkout/provider→doğrulanmış/idempotent webhook→erişim; işletme Payment modelinden ayrı |
| Aşama 12 | AI yardımcısı | Yalnızca yetkili gerçek veriler, izlenebilir hesap/kaynak, yazma yetkisi varsayılmaması ve mali tahmin sınırları |
| Aşama 13 | Resmi çok platformlu çıkış | Web+cihaz kabulü, onboarding, destek, monitoring, fiyatlandırma/billing, yedek ve yayın prosedürü |

Web'deki oturum/güvenlik olayı ekranları ve mali kimlik UI, ihtiyaç
önceliğine göre sonraki iş paketlerine alınır; mevcut web yayınını gereksiz
özellikle büyütmez. Tam muhasebe veya resmi e-belge iddiası, yalnızca gelir/
gider kaydı ve PDF ekranı var diye yapılmaz.

## 7. Değişmez çalışma kuralları

- Güvenlik ve tenant yetkisi backend'de; UI filtreleri güvenlik sınırı değildir.
- Migration geçmişi korunur; gerekirse yeni ve uyumlu migration ayrı planlanır.
- Para hesapları mevcut Money/KDV/yuvarlama bileşenleriyle; sahte KPI yok.
- İş değişikliği ve audit transaction bütünlüğü korunur; sır/PII loglanmaz.
- Testler silinerek/gevşetilerek GREEN yapılmaz. Değişmeyen kod için test
  sayısı artırmak başarı hedefi değildir; risk/iş davranışı ölçülür.
- Aynı test veritabanında paralel PHPUnit çalıştırılmaz. Canlıda suite çalışmaz.
- Her iş: kanıt → küçük değişiklik → ilgili regresyon → gereken tam kapılar
  → checkpoint → açıkça seçilmiş dalda commit/push → sunucuda ayrıca kabul.
- Mevcut takip dışı kullanıcı dosyaları kapsam dışıdır; topluca stage edilmez.
- Eski 05.09 ve 01.10 hedefleri tarihsel kayıttır; gerçekleşmiş sayılmaz.

## 8. Bir sonraki somut adım

Sunucu açılınca proje klasöründen `pwd`, `git status -sb`,
`git branch --show-current`, `git log -1 --oneline` çıktılarıyla yayın
envanterini başlatmak. Sunucu kapalı kaldığı sürece tamamlanmış canlı
release veya yeni faz iddiasında bulunmamak.

Kaynaklar: ana playbook §3/§9/§11/§12, backend route/policy/service/test
katmanları, web route/feature/API client/test katmanları, mobil feature dizini,
CI ve [SaaS billing mimarisi](FLOWTIGER_BILLING_ARCHITECTURE.md).
