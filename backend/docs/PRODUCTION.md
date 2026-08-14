# FlowTiger Backend — Production Checklist

Bu belge **hiçbir gerçek sır içermez** ve içermemelidir. Değerler dağıtım ortamının kendi secret yönetiminden gelir.

---

## 1. Dağıtımdan önce — zorunlu ayarlar

| Değişken | Production değeri | Neden |
|---|---|---|
| `APP_ENV` | `production` | |
| `APP_DEBUG` | **`false`** | `true` bırakılırsa hata yanıtları stack trace, dosya yolu, SQL ve ortam değişkeni sızdırır |
| `APP_KEY` | `php artisan key:generate` ile üretilmiş | Şifreleme ve imzalı bağlantıların (e-posta doğrulama) temeli |
| `APP_URL` | Gerçek HTTPS adresi | İmzalı bağlantılar bu adresten üretilir; yanlışsa doğrulama linkleri çalışmaz |
| `LOG_LEVEL` | `info` veya `warning` | `debug` istek ayrıntılarını loga taşır |
| `MAIL_MAILER` | Gerçek sağlayıcı | **`log` KULLANMAYIN**: davet ve parola sıfırlama token'ları log dosyasına düşer |
| `CORS_ALLOWED_ORIGINS` | Tam origin listesi | Boş = hiçbir tarayıcı cross-origin isteği. `*` asla |
| `DB_PASSWORD` | Secret yöneticisinden | `.env` repoya girmez |
| `CACHE_STORE` | `redis` önerilir | Rate limiter sayaçları burada tutulur |
| `BCRYPT_ROUNDS` | `12` (varsayılan) | Test ortamı 4 kullanır; production'da düşürmeyin |

### Dağıtım komutları

```bash
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan event:cache
```

> `config:cache` sonrası `env()` çağrıları **yalnızca config dosyalarında** çalışır. Proje bu kurala uyar; uygulama kodunda `env()` kullanılmaz.

---

## 2. HTTPS ve transport

API kimliği `Authorization: Bearer` başlığıyla taşır. **TLS zorunludur** — aksi halde token ağda düz metin dolaşır.

- TLS sonlandırma reverse proxy'de yapılıyorsa `TrustProxies` yapılandırılmalıdır; aksi halde `$request->ip()` proxy'nin IP'sini döndürür ve **rate limiter'lar ile audit kayıtları yanlış IP'ye bağlanır**.
- Çerez tabanlı kimlik doğrulama kullanılmıyor (`supports_credentials: false`). Sanctum'un SPA/çerez modu açılırsa CSRF ve `SESSION_SECURE_COOKIE` ayrıca ele alınmalıdır.

---

## 3. Veritabanı

### Migration

Tümü ileriye dönük ve yıkıcı değildir. `2026_08_14_000000_add_production_lookup_indexes` iki indeks ekler.

> **Canlı ve büyük bir tabloda:** `CREATE INDEX` yazma kilidi alır. Veri hacmi yüksekse migration yerine elle
> `CREATE INDEX CONCURRENTLY ...` çalıştırıp migration'ı `--pretend` ile doğrulayın; `CONCURRENTLY` transaction içinde çalışamaz.

### Bütünlük kısıtları (uygulamaya güvenilmez, şema zorlar)

| Tablo | Kısıt |
|---|---|
| `customers` | `UNIQUE(company_id, customer_no)` |
| `company_users` | `UNIQUE(company_id, user_id)` · `CHECK(role IN ('owner','member'))` |
| `invitations` | `UNIQUE(token_hash)` · `CHECK(role IN (...))` · bekleyen davet için partial unique |
| `personal_access_tokens` | `UNIQUE(token)` — yalnızca SHA-256 hash |
| `password_reset_tokens` | `PRIMARY KEY(email)` — yalnızca bcrypt hash |

### Büyüyen tablolar

`audit_logs` **asla silinmez** (Faz 5 kararı: değişmez ve kalıcı). Saklama politikası bir ürün/hukuk kararıdır; alındığında bölümlendirme (partitioning) veya arşivleme planlanmalıdır.

Düzenli bakım komutları (henüz zamanlanmadı):

```bash
php artisan auth:clear-resets      # süresi dolmuş parola sıfırlama kayıtları
php artisan sanctum:prune-expired  # süresi dolmuş token'lar
```

---

## 4. Yedekleme ve kurtarma

- **Günlük tam yedek** + WAL arşivi ile **point-in-time recovery**.
- Yedekler **uygulama sunucusundan ayrı** bir konumda ve şifreli tutulmalı.
- **Geri yükleme tatbikatı** düzenli yapılmalı: test edilmemiş yedek, yedek değildir.
- `audit_logs` yedekleme kapsamının dışında bırakılmamalı — güvenlik incelemesinin tek kaynağıdır.
- Secret rotasyonu: `APP_KEY` değiştirilirse **mevcut imzalı e-posta doğrulama bağlantıları geçersiz olur** (parola sıfırlama token'ları da `APP_KEY` ile HMAC'lenir). Rotasyon bir bakım penceresi gerektirir.

---

## 5. Kuyruk (queue)

Şu an `QUEUE_CONNECTION=sync`; mail'ler istek içinde senkron gönderilir. `jobs` tablosu migration'ı hazırdır.

> **Kuyruğa geçmeden önce okunmalı:** Davet ve parola sıfırlama mail'leri **plaintext token taşır**. Bunlar kuyruğa alınırsa token, `jobs` tablosuna serialize edilir — yani "token asla kalıcı depolamaya yazılmaz" garantisi kırılır. `InvitationMail` bu yüzden bilinçli olarak `ShouldQueue` **değildir**.
>
> Kuyruğa geçilecekse: kuyruk payload'ı şifrelenmeli ya da mail, token yerine yalnızca davet id'si taşıyıp token'ı gönderim anında üretmelidir.

---

## 6. İzleme

- **Readiness:** `GET /up` → 200 `{"status":"up"}`. Veritabanını gerçekten dener; hata mesajı sanitize edilir.
- **Loglar:** `LOG_STACK=daily`. Loglarda parola, token, `Authorization` başlığı **bulunmamalıdır** — uygulama kodunda hiçbir log çağrısı yoktur, kayıtlar audit tablosuna gider.
- **Audit ≠ application log:** audit iş olaylarının kalıcı kaydıdır, log ise teknik teşhis içindir. İkisi karıştırılmamalıdır.
- İzlenmesi anlamlı sinyaller: `login.failed` yoğunluğu, 429 oranı, `/up` başarısızlıkları, 5xx oranı.

---

## 7. Rate limitleri

| Limiter | Sınır | Anahtar |
|---|---|---|
| `login` | 5/dk | e-posta + IP |
| `password-forgot` | 5/dk | e-posta + IP |
| `password-reset` | 5/dk | e-posta + IP |
| `verification-notification` | 6/dk | kullanıcı |
| `password-change` | 6/dk | kullanıcı |
| `email-verification` | 10/dk | IP |
| `invitation-accept` | 10/dk | IP |

Sayaçlar cache'te tutulur: **birden fazla uygulama sunucusu varsa cache paylaşılmalıdır** (redis). `CACHE_STORE=file` ile her sunucu kendi sayacını tutar ve gerçek sınır sunucu sayısıyla çarpılır.

---

## 8. Geri alma (rollback)

1. Uygulama kodunu bir önceki sürüme al.
2. `php artisan config:clear && php artisan config:cache`
3. **Migration'ları geri almayın.** `migrate:rollback` bu projede veri kaybettirir (örneğin `invitations` tablosunun düşmesi). Şema geri alınacaksa önce yedekten dönülmelidir.
4. Sağlık kontrolü: `GET /up`.

İleriye dönük uyumluluk kuralı: yeni sürüm önce şemayı ekler, kodu sonra kullanır. Sütun silme/yeniden adlandırma ayrı bir sürüme bırakılır.

---

## 9. Dağıtım öncesi kontrol listesi

- [ ] `APP_DEBUG=false`
- [ ] `APP_KEY` üretildi ve secret yöneticisinde
- [ ] `MAIL_MAILER` gerçek sağlayıcı (log değil)
- [ ] `CORS_ALLOWED_ORIGINS` dolu ve `*` içermiyor
- [ ] TLS aktif, `TrustProxies` doğru
- [ ] `CACHE_STORE` paylaşımlı (çok sunuculu ise)
- [ ] `php artisan migrate --force` çalıştı
- [ ] `config:cache` + `route:cache` + `event:cache`
- [ ] `GET /up` → 200
- [ ] Yedekleme ve geri yükleme tatbikatı doğrulandı
- [ ] `composer audit` temiz
- [ ] `php artisan test` GREEN
