# FlowTiger — Backend

Çok kiracılı (multi-tenant) SaaS backend'i. Laravel 13 · PHP 8.3+ · PostgreSQL 17 · Sanctum.

Faz 0–10 tamamlandı; backend çekirdeği **foundation freeze** durumundadır. Web ve Flutter istemcileri bu API üzerine kurulacaktır.

---

## Temel güvenlik modeli

Her şey tek bir cümleye dayanır:

> **Authentication ≠ Authorization ≠ Tenant Context**
>
> Sisteme giriş yapmış olmak, herhangi bir şirketin verisine erişebilmek anlamına gelmez.

```
User → Company membership → Active company → CompanyContext → Tenant data
```

Zincirin katmanları:

| Katman | Nerede | Ne yapar |
|---|---|---|
| Kimlik | `auth:sanctum` | Bearer token'ı kullanıcıya çözer |
| Bağlam | `company.context` | Aktif şirketi çözer, üyeliği **her istekte** yeniden doğrular |
| Kapsam | `CompanyScope` | Tenant sorgularına `company_id` filtresini otomatik ekler |
| Yetki | Policy'ler | Rol ve sahiplik kararını verir |

Bağlam yoksa tenant sorguları **fail-closed** davranır: boş sonuç değil, istisna.

---

## Kurulum

```bash
cp .env.example .env
composer install
php artisan key:generate

# PostgreSQL: iki veritabanı gerekir
#   flowtiger_db    → geliştirme
#   flowtiger_test  → test (yıkıcıdır, ayrı tutulur)
createdb flowtiger_db
createdb flowtiger_test

php artisan migrate
php artisan db:seed        # opsiyonel geliştirme verisi
php artisan serve
```

`.env` içindeki `DB_USERNAME` / `DB_PASSWORD` değerlerini kendi PostgreSQL kullanıcınıza göre doldurun. `.env` **repoya girmez**.

---

## Test

```bash
php artisan test
```

Test suite'i yalnızca `flowtiger_test` veritabanında çalışır. Bu bir kolaylık değil **güvenlik bariyeridir**: `RefreshDatabase` yıkıcıdır ve yanlış yapılandırılmış bir `.env`, testleri geliştirme veya production veritabanına yöneltebilirdi. `tests/TestCase.php` başka bir veritabanı görürse tek bir test bile çalıştırmaz.

SQLite'a geçmeyin: `lockForUpdate()` SQLite'ta sessizce hiçbir şey yapmaz ve eşzamanlılık korumaları test edilemez hale gelir.

---

## API

Tüm uçlar `/api/v1` altındadır. Yanıt standardı: başarıda `data` zarfı, hatada `message` (+ `errors` / `code`).

### Kimlik doğrulama gerektirmeyenler

| Method | URI |
|---|---|
| POST | `/auth/login` |
| POST | `/auth/password/forgot` |
| POST | `/auth/password/reset` |
| POST | `/invitations/accept` |
| GET | `/auth/email/verify/{id}/{hash}` *(imzalı bağlantı)* |

### Kimlik doğrulamalı (`auth:sanctum`)

| Method | URI |
|---|---|
| POST | `/auth/logout` |
| GET | `/me` |
| GET · PUT | `/profile` |
| PUT | `/profile/password` |
| GET | `/profile/sessions` |
| DELETE | `/profile/sessions/others` · `/profile/sessions/{id}` |
| GET | `/profile/security-events` |
| POST | `/auth/email/verification-notification` |
| GET | `/companies` |
| POST | `/companies/{company}/select` |

### Tenant uçları (`auth:sanctum` + `company.context`)

| Method | URI | Kim |
|---|---|---|
| GET · POST · GET/PUT/DELETE `{id}` | `/customers` | üye |
| GET · POST · GET/PUT/DELETE `{user}` | `/members` | **owner** |
| PATCH | `/members/{user}/role` | **owner** |
| GET · POST · DELETE `{id}` | `/invitations` | **owner** |
| GET | `/audit-logs` | **owner** |

---

## Roller

`owner` ve `member` (`App\Enums\Role`). Rol **kullanıcıya değil üyeliğe** aittir: aynı kişi A şirketinde owner, B şirketinde member olabilir.

Bir şirket **asla ownersız kalamaz** — son owner ne silinebilir ne de member'a düşürülebilir.

---

## Sağlık kontrolü

```
GET /up
```

`{"status":"up"}` (200) veya `{"status":"down"}` (500). Veritabanı bağlantısını gerçekten dener; hata mesajı sanitize edilir, kimlik bilgisi sızdırmaz.

Yük dengeleyici / konteyner readiness probe'u olarak kullanılabilir.

---

## Production

Dağıtım, yedekleme, güvenlik ve geri alma adımları için: **[docs/PRODUCTION.md](docs/PRODUCTION.md)**

---

## Faz geçmişi

| Faz | İçerik |
|---|---|
| 0 | Git, PostgreSQL, factory/seeder altyapısı |
| 1 | Tenant isolation (scope, context, policy) |
| 2 | Authentication (Sanctum) + şirket seçimi + HTTP API |
| 3 | Customer CRUD |
| 4 | Üyelik ve rol yönetimi |
| 5 | Audit log |
| 6 | Davet sistemi |
| 7 | E-posta doğrulama, profil, parola değiştirme |
| 8 | Parola sıfırlama |
| 9 | Oturum yönetimi ve güvenlik olayları |
| 10 | Production hardening + foundation freeze |
