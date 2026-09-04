<?php

namespace Tests\Feature\Hardening;

use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use LogicException;
use RuntimeException;
use Tests\TestCase;

/**
 * Faz 10 — production sertleştirmesinin bekçileri.
 *
 * Bu dosya bir özellik test etmez; PROJENİN KENDİSİ hakkındaki
 * varsayımları test eder. Buradaki her assertion, bir gün sessizce
 * bozulabilecek ve ancak production'da fark edilecek bir kuralı
 * korur:
 *
 *   - hata yanıtları iç yapıyı sızdırmıyor mu?
 *   - CORS herkese açık hale gelmiş mi?
 *   - config:cache uygulamayı bozar mı?
 *   - audit hâlâ değiştirilemez mi?
 *   - veritabanı kısıtları duruyor mu?
 *
 * Faz 0–9'un davranışlarını YENİDEN test etmez; yalnızca altyapının
 * production varsayımlarını sabitler.
 */
class ProductionHardeningTest extends TestCase
{
    use RefreshDatabase;

    // ===============================================================
    // SAĞLIK KONTROLÜ
    // ===============================================================

    public function test_the_health_endpoint_reports_up(): void
    {
        $this->getJson('/up')
            ->assertOk()
            ->assertExactJson(['status' => 'up']);
    }

    /**
     * §13: sağlık yanıtı kimlik bilgisi sızdırmamalı.
     *
     * Laravel'in health route'u, yakaladığı istisnanın MESAJINI yanıta
     * koyar. PDO bağlantı hataları host, veritabanı adı ve kullanıcı adı
     * içerir; bu yüzden AppServiceProvider'daki dinleyici hatayı
     * sanitize eder.
     */
    public function test_the_health_response_never_exposes_infrastructure(): void
    {
        $body = $this->getJson('/up')->assertOk()->getContent();

        $secrets = array_filter([
            config('database.connections.pgsql.username'),
            config('database.connections.pgsql.database'),
            config('database.connections.pgsql.host'),
            'password',
            'pgsql',
        ], fn ($value): bool => is_string($value) && $value !== '');

        $this->assertNotEmpty($secrets);

        foreach ($secrets as $secret) {
            $this->assertStringNotContainsString(
                $secret,
                $body,
                'Sağlık yanıtı altyapı bilgisi sızdırıyor.'
            );
        }
    }

    // ===============================================================
    // HATA YANITLARI
    // ===============================================================

    /**
     * §5: production'da stack trace, dosya yolu ve satır numarası
     * yanıta ÇIKMAMALI.
     */
    public function test_exceptions_are_redacted_when_debug_is_disabled(): void
    {
        config(['app.debug' => false]);

        Route::middleware('api')->get('/api/v1/_test/boom', function (): void {
            throw new RuntimeException('Beklenmedik bir hata: /var/www/gizli/yol.php');
        });

        $response = $this->getJson('/api/v1/_test/boom')->assertStatus(500);

        $payload = $response->json();

        $this->assertSame(['message'], array_keys($payload));
        $this->assertSame('Server Error', $payload['message']);

        $body = $response->getContent();

        $this->assertStringNotContainsString('/var/www', $body);
        $this->assertStringNotContainsString('trace', $body);
        $this->assertStringNotContainsString('.php', $body);
    }

    /**
     * Hata zarfı tutarlı olmalı (§6): her hata yanıtında `message`.
     */
    public function test_error_responses_share_a_consistent_envelope(): void
    {
        // 401 — kimlik yok
        $this->getJson('/api/v1/me')
            ->assertUnauthorized()
            ->assertJsonStructure(['message']);

        // 422 — doğrulama; ayrıca `errors`
        $this->postJson('/api/v1/auth/login', [])
            ->assertStatus(422)
            ->assertJsonStructure(['message', 'errors']);

        // 404 — bilinmeyen uç
        $this->getJson('/api/v1/bilinmeyen-uc')
            ->assertNotFound()
            ->assertJsonStructure(['message']);
    }

    /**
     * §5: tenant istisnaları 500 DEĞİL, anlamlı durum kodları döner.
     */
    public function test_domain_exceptions_map_to_stable_status_codes(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        // Aktif şirketi olmayan kullanıcı tenant ucuna giremez → 403,
        // 500 değil.
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/customers')
            ->assertForbidden()
            ->assertJsonStructure(['message', 'code']);
    }

    // ===============================================================
    // CORS
    // ===============================================================

    /**
     * §22: yayınlanmamış config, Laravel'in wildcard varsayılanını
     * kullanır ve internetteki her siteye API'yi açardı.
     */
    public function test_cors_does_not_allow_every_origin(): void
    {
        $this->assertNotContains(
            '*',
            config('cors.allowed_origins'),
            'CORS her origin\'e açık — herhangi bir site tarayıcıdan API\'yi çağırabilir.'
        );

        $this->assertNotContains('*', config('cors.allowed_origins_patterns') ?? []);
    }

    /**
     * §21: kimlik Bearer token ile taşınır, çerezle değil.
     * supports_credentials açılırsa CSRF yüzeyi doğar.
     */
    public function test_cors_does_not_support_credentials(): void
    {
        $this->assertFalse(config('cors.supports_credentials'));
    }

    public function test_cors_covers_the_api_prefix(): void
    {
        $this->assertContains('api/*', config('cors.paths'));
    }

    // ===============================================================
    // CONFIG GÜVENLİĞİ
    // ===============================================================

    /**
     * config:cache sonrası env() YALNIZCA config dosyalarında çalışır;
     * uygulama kodundaki her env() çağrısı production'da sessizce null
     * döner. Bu test o sınıf hatayı imkânsız kılar.
     */
    public function test_application_code_never_reads_env_directly(): void
    {
        $offenders = $this->grepPhpFiles(['app', 'routes', 'database'], '/(?<![\w:>$])env\s*\(/');

        $this->assertSame(
            [],
            $offenders,
            "config:cache sonrası bu env() çağrıları null dönecek:\n".implode("\n", $offenders)
        );
    }

    /**
     * §9: uygulama kodunda hiçbir log/dump çağrısı yok.
     *
     * Bu, Faz 2.3'ten beri korunan bir kuraldır: iş olayları audit
     * tablosuna gider, teknik hatalar exception handler'a. Elle yazılmış
     * bir log satırı, bir gün istek gövdesini (parola, token) diske
     * taşıyan satır olur.
     */
    public function test_application_code_contains_no_manual_logging_or_debug_calls(): void
    {
        $offenders = $this->grepPhpFiles(
            ['app', 'routes'],
            '/(?<![\w:>$])(Log::|logger\s*\(|dd\s*\(|dump\s*\(|var_dump\s*\(|ray\s*\()/',
        );

        $this->assertSame([], $offenders, implode("\n", $offenders));
    }

    public function test_the_testing_environment_uses_the_isolated_database(): void
    {
        $this->assertSame('pgsql', config('database.default'));
        $this->assertSame('flowtiger_test', config('database.connections.pgsql.database'));
        $this->assertSame('array', config('cache.default'));
        $this->assertSame('array', config('mail.default'));
    }

    // ===============================================================
    // RATE LIMIT
    // ===============================================================

    /**
     * §8: hepsi kayıtlı olmalı. Kayıtsız bir limiter adı route'ta
     * kullanıldığında Laravel istisna fırlatır — yani eksik bir limiter
     * ucu tamamen kırar.
     */
    public function test_every_named_rate_limiter_is_registered(): void
    {
        foreach ([
            'login',
            'password-forgot',
            'password-reset',
            'password-change',
            'verification-notification',
            'email-verification',
            'invitation-accept',
        ] as $limiter) {
            $this->assertNotNull(
                RateLimiter::limiter($limiter),
                "Rate limiter kayıtlı değil: [{$limiter}]"
            );
        }
    }

    // ===============================================================
    // AUDIT BÜTÜNLÜĞÜ
    // ===============================================================

    public function test_audit_records_remain_immutable(): void
    {
        $log = AuditLog::factory()->forCompany(Company::factory()->create())->create();

        $this->expectException(LogicException::class);

        $log->update(['action' => 'login.success']);
    }

    public function test_audit_records_cannot_be_deleted(): void
    {
        $log = AuditLog::factory()->forCompany(Company::factory()->create())->create();

        $this->expectException(LogicException::class);

        $log->delete();
    }

    // ===============================================================
    // VERİTABANI KISITLARI VE İNDEKSLER
    // ===============================================================

    /**
     * §11, §12: veri bütünlüğü uygulamaya değil şemaya emanettir.
     */
    public function test_the_schema_enforces_the_core_invariants(): void
    {
        $constraints = collect(DB::select("
            SELECT conname FROM pg_constraint
        "))->pluck('conname')->all();

        foreach ([
            'company_users_role_check',
            'invitations_role_check',
        ] as $expected) {
            $this->assertContains($expected, $constraints, "Eksik CHECK kısıtı: {$expected}");
        }

        $indexes = collect(DB::select('SELECT indexname FROM pg_indexes'))->pluck('indexname')->all();

        foreach ([
            // Faz 1 — şirket içinde tekil müşteri numarası
            'customers_company_id_customer_no_unique',
            // Faz 4 — bir kullanıcı bir şirkete iki kez üye olamaz
            'company_users_company_id_user_id_unique',
            // Faz 6 — token benzersiz + aynı anda tek bekleyen davet
            'invitations_token_hash_unique',
            'invitations_company_email_pending_unique',
            // Faz 10 — bu fazda eklenen okuma indeksleri
            'company_users_user_id_index',
            'audit_logs_user_id_created_at_index',
        ] as $expected) {
            $this->assertContains($expected, $indexes, "Eksik indeks: {$expected}");
        }
    }

    /**
     * Faz 10'da eklenen indeksler gerçekten doğru sütunlara mı bakıyor?
     */
    public function test_the_new_lookup_indexes_cover_the_intended_columns(): void
    {
        $definition = DB::selectOne("
            SELECT indexdef FROM pg_indexes WHERE indexname = 'audit_logs_user_id_created_at_index'
        ");

        $this->assertNotNull($definition);
        $this->assertStringContainsString('user_id', $definition->indexdef);
        $this->assertStringContainsString('created_at', $definition->indexdef);
    }

    // ===============================================================
    // SEEDER PRODUCTION GUARD
    // ===============================================================

    /**
     * DatabaseSeeder sabit şifreli bir owner hesabı (owner@flowtiger.test)
     * üretir. Production'da çalıştırılırsa doğrudan bir hesap ele geçirme
     * riski olur — bu yüzden production'da SESSİZCE NO-OP olmak yerine
     * açık bir istisnayla durmalı, ve hiçbir satır yazılmadan önce
     * durmalı (transaction hiç açılmamalı).
     *
     * Ortam GERÇEKTEN 'production' yapılır (`app()->instance('env', ...)`
     * — Laravel'in `app()->environment()` metodunun okuduğu container
     * bağlaması) ki guard, seeder'ın kendi bir metodunu değil GERÇEK
     * production davranışını ölçsün. Orijinal değer `finally` içinde
     * assertion'lar başarısız olsa bile geri yüklenir — aksi hâlde bu
     * testten sonra çalışan her test 'production' ortamında kalırdı.
     */
    public function test_the_seeder_refuses_to_run_in_production_and_writes_nothing(): void
    {
        $originalEnv = app()->environment();

        app()->instance('env', 'production');

        try {
            $this->assertTrue(app()->environment('production'), 'Ortam gerçekten production yapılamadı.');

            $thrown = null;

            try {
                (new DatabaseSeeder)->run();
            } catch (RuntimeException $exception) {
                $thrown = $exception;
            }

            $this->assertNotNull($thrown, 'Seeder production ortamında istisna fırlatmadı — sessiz no-op oldu.');
            $this->assertStringContainsString('production', $thrown->getMessage());

            // Fail-fast: transaction hiç açılmamalı, tek satır bile yazılmamalı.
            $this->assertDatabaseMissing('users', ['email' => 'owner@flowtiger.test']);
            $this->assertDatabaseMissing('companies', ['name' => 'FlowTiger Test Company']);
        } finally {
            app()->instance('env', $originalEnv);
        }

        $this->assertSame($originalEnv, app()->environment(), 'Ortam bir sonraki teste sızdı.');
    }

    /**
     * REGRESYON: guard eklenmeden önceki davranış (local/testing'de seed)
     * BOZULMADI. Testler zaten `flowtiger_test` veritabanında çalışıyor
     * (TestCase'in fail-closed bariyeri) — bu yüzden ayrıca bir ortam
     * kurulumu YAPILMAZ, gerçek test ortamı kullanılır.
     */
    public function test_the_seeder_still_creates_the_expected_fixtures_outside_production(): void
    {
        $this->assertFalse(app()->environment('production'));

        (new DatabaseSeeder)->run();

        $owner = User::where('email', 'owner@flowtiger.test')->firstOrFail();
        $company = Company::where('name', 'FlowTiger Test Company')->firstOrFail();

        $this->assertTrue($owner->password !== 'password', 'Şifre düz metin saklanmamalı (hashed cast).');
        $this->assertTrue(Hash::check('password', $owner->password));

        $this->assertSame(
            'owner',
            $company->users()->where('users.id', $owner->getKey())->first()->pivot->role,
        );

        $this->assertDatabaseHas('customers', [
            'company_id' => $company->getKey(),
            'customer_no' => 1,
            'name' => 'Ahmet',
        ]);
        $this->assertDatabaseHas('customers', [
            'company_id' => $company->getKey(),
            'customer_no' => 2,
            'name' => 'Mehmet',
        ]);
    }

    /**
     * İkinci kez çalıştırmak duplicate kayıt ÜRETMEMELİ — mevcut
     * idempotency sözleşmesi guard'la bozulmadı.
     */
    public function test_the_seeder_remains_idempotent_outside_production(): void
    {
        (new DatabaseSeeder)->run();
        (new DatabaseSeeder)->run();

        $this->assertSame(1, User::where('email', 'owner@flowtiger.test')->count());
        $this->assertSame(1, Company::where('name', 'FlowTiger Test Company')->count());
        $this->assertSame(2, Customer::withoutTenantScope('test doğrulaması')->count());
    }

    // ===============================================================
    // PRODUCTION DEBUG GUARD
    // ===============================================================

    /**
     * debug=true iken her istisna, kullanıcıya stack trace, dosya yolu ve
     * SQL sorgusunu olduğu gibi döner. Production'da bu doğrudan bir bilgi
     * sızıntısıdır — bu yüzden bu kombinasyon SESSİZCE ÇALIŞMAK yerine
     * uygulama BOOT sırasında açıkça durmalı.
     *
     * Ortam VE debug bayrağı GERÇEKTEN değiştirilir (`app()->instance('env', ...)`
     * ve `config(['app.debug' => ...])`) ki guard, provider'ın kendi bir
     * varsayımını değil GERÇEK production+debug davranışını ölçsün. Guard
     * boot()'un İLK İŞİ olduğu için, fırlatılan istisna hiçbir yan etki
     * (rate limiter/policy/health check kaydı) bırakmadan durur. Orijinal
     * değerler `finally` içinde geri yüklenir — aksi hâlde bu testten sonra
     * çalışan her test bu ortamda kalırdı.
     */
    public function test_the_application_refuses_to_boot_with_debug_enabled_in_production(): void
    {
        $originalEnv = app()->environment();
        $originalDebug = config('app.debug');

        app()->instance('env', 'production');
        config(['app.debug' => true]);

        try {
            $this->assertTrue(app()->environment('production'), 'Ortam gerçekten production yapılamadı.');
            $this->assertTrue(config('app.debug'), 'Debug bayrağı gerçekten true yapılamadı.');

            $thrown = null;

            try {
                (new AppServiceProvider(app()))->boot();
            } catch (RuntimeException $exception) {
                $thrown = $exception;
            }

            $this->assertNotNull($thrown, 'Uygulama production+debug=true iken boot oldu — sessiz no-op.');
            $this->assertStringContainsString('APP_DEBUG', $thrown->getMessage());
            $this->assertStringContainsString('production', $thrown->getMessage());
        } finally {
            app()->instance('env', $originalEnv);
            config(['app.debug' => $originalDebug]);
        }

        $this->assertSame($originalEnv, app()->environment(), 'Ortam bir sonraki teste sızdı.');
        $this->assertSame($originalDebug, config('app.debug'), 'Debug bayrağı bir sonraki teste sızdı.');
    }

    /**
     * REGRESYON: production + debug=false → uygulama normal boot olur.
     * Bu, gerçek bir production dağıtımının çalışması gereken durumdur.
     */
    public function test_the_application_boots_normally_in_production_with_debug_disabled(): void
    {
        $originalEnv = app()->environment();
        $originalDebug = config('app.debug');

        app()->instance('env', 'production');
        config(['app.debug' => false]);

        try {
            $this->assertTrue(app()->environment('production'));
            $this->assertFalse(config('app.debug'));

            (new AppServiceProvider(app()))->boot();

            $this->assertNotNull(RateLimiter::limiter('login'), 'Guard geçtikten sonra normal boot devam etmedi.');
        } finally {
            app()->instance('env', $originalEnv);
            config(['app.debug' => $originalDebug]);
        }

        $this->assertSame($originalEnv, app()->environment(), 'Ortam bir sonraki teste sızdı.');
        $this->assertSame($originalDebug, config('app.debug'), 'Debug bayrağı bir sonraki teste sızdı.');
    }

    /**
     * REGRESYON: local/testing'de debug=true GAYET NORMALDİR (bkz. .env) ve
     * guard'la BOZULMAMALI. Testler zaten bu tam kombinasyonla çalışıyor
     * (ortam 'testing', debug varsayılan olarak true) — bu yüzden ayrıca bir
     * ortam kurulumu YAPILMAZ, gerçek test ortamı kullanılır.
     */
    public function test_the_guard_does_not_fire_outside_production(): void
    {
        $this->assertFalse(app()->environment('production'));

        (new AppServiceProvider(app()))->boot();

        $this->assertNotNull(RateLimiter::limiter('login'), 'Guard dışı ortamda normal boot devam etmedi.');
    }

    // ===============================================================
    // YARDIMCI
    // ===============================================================

    /**
     * Verilen dizinlerdeki PHP dosyalarında desen arar; yorum satırları
     * hariç tutulur.
     *
     * @param  list<string>  $directories
     * @return list<string>
     */
    private function grepPhpFiles(array $directories, string $pattern): array
    {
        $offenders = [];

        foreach ($directories as $directory) {
            $path = base_path($directory);

            if (! is_dir($path)) {
                continue;
            }

            // SKIP_DOTS zorunlu: '.' ve '..' girişleri olmadan yinelemeli
            // gezinti sonsuz döngüye girebilir.
            $files = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS)
            );

            foreach ($files as $file) {
                if (! $file->isFile() || $file->getExtension() !== 'php') {
                    continue;
                }

                foreach (file($file->getPathname()) as $number => $line) {
                    $trimmed = ltrim($line);

                    // Yorum satırlarını atla: bu kuralları ANLATAN
                    // açıklamalar kuralın ihlali değildir.
                    if (str_starts_with($trimmed, '*')
                        || str_starts_with($trimmed, '//')
                        || str_starts_with($trimmed, '/*')
                        || str_starts_with($trimmed, '#')) {
                        continue;
                    }

                    if (preg_match($pattern, $line) === 1) {
                        $offenders[] = $directory.'/'.$file->getFilename().':'.($number + 1);
                    }
                }
            }
        }

        return $offenders;
    }
}
