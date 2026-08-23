# FlowTiger Billing Architecture

## Amaç

FlowTiger'ın kendi SaaS abonelik sistemi ile FlowTiger kullanan işletmelerin FlowTiger'a ödediği abonelik ücretlerini, işletmelerin kendi finans sisteminden kesin olarak ayırmak.

Bu doküman, ileride geliştirilecek billing/subscription özellikleri için mimari referanstır.

---

## 1. Kritik Ayrım

FlowTiger'da iki farklı finans alanı vardır.

### A. İşletme Finans Sistemi

Bu, FlowTiger müşterisinin kendi işletmesinin finansıdır.

Örnek:

- Gelir
- Gider
- Tahsilat
- Ödeme
- Fatura
- KDV
- Vergi
- Finansal raporlar

Mevcut domain:

- `FinanceEntry`
- `Payment`
- `PaymentAllocation`
- ileride `Invoice`
- ileride `Tax`

### B. FlowTiger SaaS Billing

Bu, FlowTiger'ın kendi ürününü kullanan şirketlerin FlowTiger'a yaptığı abonelik ödemeleridir.

Örnek:

- Plan
- Abonelik
- Deneme
- Checkout
- Kupon
- Ödeme sağlayıcısı
- Abonelik durumu
- Erişim yetkisi

Bu iki alan aynı şey değildir ve birbirine karıştırılmamalıdır.

---

## 2. Abonelik Şirket/Tenant Bazlıdır

Abonelik kullanıcıya değil şirkete aittir.

```text
User
  ↓
Company
  ↓
Subscription
  ↓
Plan
```

Aynı kullanıcı birden fazla şirkete erişebilir ve her şirketin farklı abonelik durumu olabilir.

Örnek:

```text
Kullanıcı
├── Şirket A → aktif abonelik
└── Şirket B → deneme
```

Aktif şirketin aboneliği uygulamanın erişim durumunu belirler.

---

## 3. Kullanıcı Girişi

Kullanıcı uygulamaya normal şekilde giriş yapar:

```text
E-posta
Şifre
↓
Authentication
↓
User
↓
Active Company
↓
Subscription State
```

Uygulama giriş sonrasında aktif şirketin abonelik durumunu öğrenmelidir.

Önerilen durumlar:

- `trial`
- `active`
- `grace_period`
- `expired`
- `cancelled`

Uygulama bu duruma göre kendini otomatik uyarlamalıdır.

---

## 4. Trial ve Fiyat Sabit Kodlanmamalıdır

Deneme süresi ve fiyat kaynak koduna hard-code edilmemelidir.

Plan sistemi konfigürasyon tabanlı olmalıdır.

Örnek:

```text
Plan
├── name
├── price
├── currency
├── billing_interval
├── trial_days
└── is_active
```

Bir planın deneme süresi veya fiyatı değiştiğinde uygulamanın kodunu değiştirmek gerekmemelidir.

### Mevcut Abonelikler

Bir şirket denemeye veya ücretli döneme başladığında ilgili dönem tarihi şirket/subscription üzerinde sabitlenmelidir.

Plan daha sonra değiştirilse bile mevcut şirketin aktif trial/period tarihi geriye dönük değiştirilmemelidir.

---

## 5. Ödeme Modeli

Ödeme merkezi olarak FlowTiger'ın web billing sisteminden yapılır.

Ancak ödeme uygulamanın içinden başlatılabilir.

Önerilen akış:

```text
FlowTiger App
    ↓
"Aboneliği Başlat"
    ↓
FlowTiger Web Billing / Checkout
    ↓
Payment Provider
    ↓
Backend doğrulaması
    ↓
Subscription = active
    ↓
App
```

Uygulamanın içine doğrudan ödeme sağlayıcısı mantığı gömülmemelidir.

Uygulama yalnızca abonelik durumunu tüketmeli ve ödeme sayfasına yönlendirmelidir.

---

## 6. Billing Web Alanı

FlowTiger'ın web tarafında uygulamadan ayrı bir billing alanı bulunmalıdır.

Örnek:

```text
Billing
├── Plans
├── Pricing
├── Checkout
├── Subscription
├── Payment Result
└── Coupon
```

Bu alan gerçek FlowTiger uygulamasının dashboard/finance/customer ekranlarıyla karıştırılmamalıdır.

---

## 7. Internal Admin Panel

FlowTiger sahibi/yöneticisi için ayrı bir internal admin panel bulunacaktır.

Örnek:

```text
Admin
├── Plans
├── Pricing
├── Trial Settings
├── Coupons
├── Subscriptions
├── Companies
├── Payment Status
├── Manual Access
├── Extend Subscription
├── Cancel / Suspend
└── Reports
```

Bu panel normal FlowTiger kullanıcılarına açık değildir.

Admin panelindeki işlemler ayrıca yetkilendirilmelidir.

---

## 8. Kuponlar

Sistem gelecekte kupon kodlarını destekleyecek şekilde tasarlanmalıdır.

Örnek:

```text
code
 discount_type
 discount_value
 starts_at
 ends_at
 usage_limit
 is_active
```

İleride aşağıdaki indirim modelleri desteklenebilir:

- yüzde indirim
- sabit tutar
- ücretsiz dönem
- belirli planla sınırlı kampanya

Kupon mantığı ödeme sağlayıcısına tamamen bırakılmamalı; FlowTiger backend'i nihai ticari kuralları doğrulamalıdır.

---

## 9. Subscription Modeli

Abonelik şirket seviyesinde olmalıdır.

Önerilen kavramlar:

```text
Subscription
├── company_id
├── plan_id
├── status
├── trial_started_at
├── trial_ends_at
├── current_period_start
├── current_period_end
├── cancelled_at
├── provider
├── provider_customer_id
└── provider_subscription_id
```

Gerçek kolon isimleri implementation sırasında mevcut repository standartlarına göre kesinleştirilmelidir.

---

## 10. Erişim Kontrolü

Abonelik durumu uygulama erişimini etkiler.

### Trial

Normal uygulama erişimi.

### Active

Normal uygulama erişimi.

### Grace Period

Kullanıcıya ödeme sorunu bildirilmeli ve ürün politikası kapsamında geçici erişim sürdürülebilmelidir.

### Expired

Ürün kullanımının engellenmesi veya sınırlanması gerekir.

### Cancelled

Mevcut dönem sonuna kadar erişim devam edebilecek şekilde tasarlanabilir; nihai davranış subscription politikasında tanımlanmalıdır.

---

## 11. Veri Koruma

Abonelik sona erdiğinde kullanıcı verileri otomatik olarak silinmemelidir.

Özellikle:

- müşteriler
- ekip
- finans kayıtları
- audit kayıtları
- şirket bilgileri

korunmalıdır.

"Ödeme yapmadı" ile "verileri sil" aynı işlem değildir.

---

## 12. Audit

Billing tarafındaki kritik değişiklikler audit edilmelidir.

Özellikle:

- subscription created
- subscription activated
- subscription cancelled
- subscription extended
- coupon applied
- manual access granted/revoked

gibi olaylar ileride audit sistemine bağlanmalıdır.

Secret, token veya hassas ödeme verileri audit'e plaintext olarak yazılmamalıdır.

---

## 13. Provider Bağımlılığı

Payment provider FlowTiger domain modelinin kendisi değildir.

Provider entegrasyonu ayrı bir abstraction üzerinden yapılmalıdır.

Örneğin:

```text
FlowTiger Billing
        ↓
Payment Provider Adapter
        ↓
Stripe / iyzico / PayTR / ...
```

Böylece sağlayıcı değişimi domain modelini yeniden yazmayı gerektirmez.

---

## 14. Uygulama Sınırı

FlowTiger App:

- authentication
- company selection
- subscription status
- billing durum mesajları
- billing/checkout linki

işlerini yapabilir.

FlowTiger App şunları kendi içine gömmemelidir:

- payment provider secret keys
- provider webhook doğrulama mantığı
- plan yönetimi
- coupon yönetimi
- admin billing işlemleri

---

## 15. Mimari Kural

Her yeni özellik geliştirirken şu soru sorulmalıdır:

> Bu, FlowTiger müşterisinin kendi işletme finansı mı, yoksa FlowTiger'a yaptığı abonelik ödemesi mi?

Cevaba göre domain seçilmelidir.

Yanlış domain'e finansal veri yazılmamalıdır.

---

## 16. Gelecek Geliştirme Sırası

Önerilen billing sırası:

1. Plan Foundation
2. Subscription Foundation
3. Trial State Machine
4. Billing Web
5. Checkout
6. Payment Provider Adapter
7. Webhook Verification
8. Coupon System
9. Internal Admin Billing Panel
10. App Entitlement / Access Gate
11. Billing Notifications
12. Reporting

Billing implementasyonu, Business Finance domaininden ayrı tutulmalıdır.
