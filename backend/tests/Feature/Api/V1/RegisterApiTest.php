<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Exceptions\RegistrationException;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Invitation;
use App\Models\User;
use App\Services\CompanySelectionService;
use App\Services\RegistrationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * P0-01 — self-servis kayıt + şirket onboarding'in HTTP yüzü.
 *
 * Bu dosya, RegistrationService/RegisterRequest/AuthController::register()
 * ÜÇLÜSÜNÜN birlikte doğru çalıştığını kanıtlar. AuthApiTest ile aynı
 * konvansiyonlar kullanılır: gerçek Bearer token yolu, RefreshDatabase,
 * postJson/getJson.
 */
class RegisterApiTest extends TestCase
{
    use RefreshDatabase;

    private const REGISTER_URI = '/api/v1/auth/register';

    private const CUSTOMERS_URI = '/api/v1/customers';

    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Mami Kaplan',
            'email' => 'mami@flowtiger.test',
            'password' => 'gizli-parola-123',
            'company_name' => 'Kaplan Ticaret',
        ], $overrides);
    }

    // ---------------------------------------------------------------
    // 1-7) MUTLU YOL
    // ---------------------------------------------------------------

    public function test_successful_registration_returns_201_with_token_and_user(): void
    {
        $response = $this->postJson(self::REGISTER_URI, $this->validPayload());

        $response->assertCreated()
            ->assertJsonStructure([
                'data' => [
                    'token',
                    'user' => ['id', 'name', 'email', 'active_company_id'],
                ],
            ])
            ->assertJsonPath('data.user.name', 'Mami Kaplan')
            ->assertJsonPath('data.user.email', 'mami@flowtiger.test');

        $this->assertIsString($response->json('data.token'));
        $this->assertNotSame('', $response->json('data.token'));
    }

    public function test_registration_creates_the_user(): void
    {
        $this->postJson(self::REGISTER_URI, $this->validPayload())->assertCreated();

        $this->assertDatabaseHas('users', [
            'name' => 'Mami Kaplan',
            'email' => 'mami@flowtiger.test',
        ]);
    }

    public function test_registration_creates_the_company(): void
    {
        $this->postJson(self::REGISTER_URI, $this->validPayload())->assertCreated();

        $this->assertDatabaseHas('companies', [
            'name' => 'Kaplan Ticaret',
        ]);
    }

    public function test_registration_creates_an_owner_membership(): void
    {
        $response = $this->postJson(self::REGISTER_URI, $this->validPayload())->assertCreated();

        $userId = $response->json('data.user.id');
        $user = User::query()->findOrFail($userId);
        $company = Company::query()->where('name', 'Kaplan Ticaret')->firstOrFail();

        $pivot = DB::table('company_users')
            ->where('user_id', $user->getKey())
            ->where('company_id', $company->getKey())
            ->first();

        $this->assertNotNull($pivot, 'Owner üyeliği (company_users satırı) oluşmadı.');
        $this->assertSame('owner', $pivot->role);
    }

    public function test_registration_sets_active_company_id_to_the_new_company(): void
    {
        $response = $this->postJson(self::REGISTER_URI, $this->validPayload())->assertCreated();

        $userId = $response->json('data.user.id');
        $company = Company::query()->where('name', 'Kaplan Ticaret')->firstOrFail();

        $this->assertSame(
            $company->getKey(),
            $response->json('data.user.active_company_id'),
            'Yanıttaki active_company_id yeni şirketle eşleşmiyor.'
        );

        $this->assertSame(
            $company->getKey(),
            User::query()->findOrFail($userId)->active_company_id,
            'Veritabanındaki active_company_id yeni şirketle eşleşmiyor.'
        );
    }

    public function test_registration_returns_a_sanctum_token(): void
    {
        $token = $this->postJson(self::REGISTER_URI, $this->validPayload())
            ->assertCreated()
            ->json('data.token');

        // Sanctum formatı: "<id>|<plaintext>" — AuthApiTest ile aynı kanıt.
        $this->assertStringContainsString('|', $token);

        [$tokenId, $plainTextPart] = explode('|', $token, 2);

        $stored = DB::table('personal_access_tokens')->where('id', (int) $tokenId)->first();

        $this->assertNotNull($stored);
        $this->assertSame(hash('sha256', $plainTextPart), $stored->token);
    }

    public function test_returned_token_can_access_a_tenant_endpoint_immediately(): void
    {
        $token = $this->postJson(self::REGISTER_URI, $this->validPayload())
            ->assertCreated()
            ->json('data.token');

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::CUSTOMERS_URI)
            ->assertOk();
    }

    // ---------------------------------------------------------------
    // 8-10) VALIDATION
    // ---------------------------------------------------------------

    public function test_duplicate_email_returns_422(): void
    {
        User::factory()->create(['email' => 'mami@flowtiger.test']);

        $this->postJson(self::REGISTER_URI, $this->validPayload())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_missing_company_name_returns_422(): void
    {
        $payload = $this->validPayload();
        unset($payload['company_name']);

        $this->postJson(self::REGISTER_URI, $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['company_name']);
    }

    public function test_invalid_company_name_returns_422(): void
    {
        $this->postJson(self::REGISTER_URI, $this->validPayload(['company_name' => '']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['company_name']);
    }

    public function test_weak_password_returns_422(): void
    {
        // Password::defaults() → min(8). 7 karakter kuralı ihlal eder.
        $this->postJson(self::REGISTER_URI, $this->validPayload(['password' => 'kisa123']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    // ---------------------------------------------------------------
    // 11) RATE LIMIT
    // ---------------------------------------------------------------

    public function test_registration_is_rate_limited_after_repeated_attempts(): void
    {
        // Aynı e-posta + IP ile art arda istekler: ilki 201, ardından
        // ikinci-beşinci "email zaten alındı" ile 422 döner (kullanıcı zaten
        // var), ama HEPSİ throttle sayacını tüketir — tıpkı
        // AuthApiTest::test_login_is_rate_limited_after_repeated_failures'ta
        // olduğu gibi. Limiter 5/dakika (register).
        $payload = $this->validPayload();

        $this->postJson(self::REGISTER_URI, $payload)->assertCreated();

        for ($attempt = 2; $attempt <= 5; $attempt++) {
            $this->postJson(self::REGISTER_URI, $payload)->assertStatus(422);
        }

        $this->postJson(self::REGISTER_URI, $payload)->assertStatus(429);
    }

    // ---------------------------------------------------------------
    // 12-14) İSTEMCİ role / company_id / active_company_id BELİRLEYEMEZ
    // ---------------------------------------------------------------

    public function test_client_sent_role_field_is_ignored_user_stays_owner(): void
    {
        $response = $this->postJson(self::REGISTER_URI, $this->validPayload(['role' => 'member']))
            ->assertCreated();

        $userId = $response->json('data.user.id');
        $company = Company::query()->where('name', 'Kaplan Ticaret')->firstOrFail();

        $pivot = DB::table('company_users')
            ->where('user_id', $userId)
            ->where('company_id', $company->getKey())
            ->first();

        $this->assertSame('owner', $pivot->role, 'Gönderilen role alanı yok sayılmalıydı.');
    }

    public function test_client_sent_company_id_is_not_accepted(): void
    {
        $existingCompany = Company::factory()->create();

        $response = $this->postJson(
            self::REGISTER_URI,
            $this->validPayload(['company_id' => $existingCompany->getKey()])
        )->assertCreated();

        $newCompanyId = Company::query()->where('name', 'Kaplan Ticaret')->firstOrFail()->getKey();

        $this->assertNotSame($existingCompany->getKey(), $newCompanyId);
        $this->assertSame($newCompanyId, $response->json('data.user.active_company_id'));

        $this->assertFalse(
            User::query()->findOrFail($response->json('data.user.id'))->isMemberOf($existingCompany),
            'Kullanıcı, gövdede gönderilen company_id ile eşleşen şirkete üye olmamalıydı.'
        );
    }

    public function test_client_sent_active_company_id_is_not_accepted(): void
    {
        $otherCompany = Company::factory()->create();

        $response = $this->postJson(
            self::REGISTER_URI,
            $this->validPayload(['active_company_id' => $otherCompany->getKey()])
        )->assertCreated();

        $newCompanyId = Company::query()->where('name', 'Kaplan Ticaret')->firstOrFail()->getKey();

        $this->assertSame(
            $newCompanyId,
            $response->json('data.user.active_company_id'),
            'active_company_id, gövdede gönderilen değere değil yeni şirkete eşit olmalıydı.'
        );
    }

    // ---------------------------------------------------------------
    // 15) AUDIT SIZINTISI YOK
    // ---------------------------------------------------------------

    public function test_audit_never_contains_password_hash_or_token(): void
    {
        $response = $this->postJson(self::REGISTER_URI, $this->validPayload())->assertCreated();

        $token = $response->json('data.token');
        [, $plainTextPart] = explode('|', $token, 2);

        $userId = $response->json('data.user.id');
        $user = User::query()->findOrFail($userId);
        $passwordHash = $user->getAuthPassword();

        // Global scope'u BİLİNÇLİ olarak atlıyoruz: bu, "tüm audit
        // satırlarında sızıntı var mı?" sorusudur, tek bir tenant'ın
        // görebileceği alt kümeyle sınırlı değildir.
        $rows = AuditLog::withoutGlobalScopes()->get();

        $this->assertGreaterThan(0, $rows->count(), 'Kayıt olayları hiç audit üretmedi.');

        foreach ($rows as $row) {
            $serialized = json_encode([
                'old_values' => $row->old_values,
                'new_values' => $row->new_values,
                'metadata' => $row->metadata,
            ]);

            $this->assertStringNotContainsString('gizli-parola-123', $serialized);
            $this->assertStringNotContainsString($passwordHash, $serialized);
            $this->assertStringNotContainsString($plainTextPart, $serialized);
            $this->assertStringNotContainsString($token, $serialized);
        }
    }

    // ---------------------------------------------------------------
    // 16) TRANSACTION ROLLBACK
    // ---------------------------------------------------------------

    public function test_a_failure_after_user_and_company_creation_rolls_back_everything(): void
    {
        $this->mock(CompanySelectionService::class, function ($mock): void {
            $mock->shouldReceive('select')->andThrow(new \RuntimeException('boom'));
        });

        $service = app(RegistrationService::class);

        try {
            $service->register('Mami Kaplan', 'rollback@flowtiger.test', 'gizli-parola-123', 'Rollback A.Ş.');
            $this->fail('RuntimeException bekleniyordu.');
        } catch (\RuntimeException $e) {
            $this->assertSame('boom', $e->getMessage());
        }

        $this->assertDatabaseMissing('users', ['email' => 'rollback@flowtiger.test']);
        $this->assertDatabaseMissing('companies', ['name' => 'Rollback A.Ş.']);
    }

    // ---------------------------------------------------------------
    // 17) ÇAPRAZ TENANT ERİŞİMİ YOK
    // ---------------------------------------------------------------

    public function test_newly_registered_user_cannot_access_another_companys_customer(): void
    {
        $otherOwner = User::factory()->create();
        $otherCompany = Company::factory()->withOwner($otherOwner)->create();
        $otherCustomer = Customer::factory()->forCompany($otherCompany)->create();

        $token = $this->postJson(self::REGISTER_URI, $this->validPayload())
            ->assertCreated()
            ->json('data.token');

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::CUSTOMERS_URI.'/'.$otherCustomer->getKey())
            ->assertNotFound();
    }

    // ---------------------------------------------------------------
    // 18) MEVCUT BİR DAVETLE ETKİLEŞİM YOK
    // ---------------------------------------------------------------

    public function test_registration_does_not_disturb_a_pending_invitation_for_the_same_email(): void
    {
        $invitingCompany = Company::factory()->create();
        $invitation = Invitation::factory()
            ->forCompany($invitingCompany)
            ->forEmail('mami@flowtiger.test')
            ->create();

        $this->postJson(self::REGISTER_URI, $this->validPayload())->assertCreated();

        $invitation->refresh();

        $this->assertNull($invitation->accepted_at, 'Register, bekleyen daveti kabul edilmiş gibi işaretlememeli.');
        $this->assertNull($invitation->revoked_at);
    }

    // ---------------------------------------------------------------
    // 19) REGISTER + INVITATION AYNI E-POSTA YARIŞI → KONTROLLÜ DAVRANIŞ
    // ---------------------------------------------------------------

    public function test_concurrent_registration_race_on_the_same_email_is_handled_cleanly(): void
    {
        // Gerçek paralel thread PHPUnit'te üretilemez. Yarışı simüle etmek
        // için RegistrationService::register() AYNI e-posta için art arda
        // İKİ KEZ çağrılır — FormRequest'in unique:users kuralını (yalnızca
        // sıralı istekleri yakalar) atlayarak servisin kendi DB-seviyesi
        // güvencesini (UniqueConstraintViolationException → RegistrationException)
        // doğrudan test eder.
        $service = app(RegistrationService::class);

        $first = $service->register('Birinci', 'yaris@flowtiger.test', 'gizli-parola-123', 'Yarış A.Ş. 1');
        $this->assertNotNull($first->getKey());

        $this->expectException(RegistrationException::class);

        try {
            $service->register('Ikinci', 'yaris@flowtiger.test', 'gizli-parola-123', 'Yarış A.Ş. 2');
        } finally {
            // İkinci çağrının yarıda kalan Company'si de geri alınmalı.
            $this->assertDatabaseMissing('companies', ['name' => 'Yarış A.Ş. 2']);
            $this->assertSame(1, User::where('email', 'yaris@flowtiger.test')->count());
        }
    }

    // ---------------------------------------------------------------
    // 20) email_verified_at NULL BAŞLAR
    // ---------------------------------------------------------------

    public function test_email_verified_at_starts_null(): void
    {
        $response = $this->postJson(self::REGISTER_URI, $this->validPayload())->assertCreated();

        $userId = $response->json('data.user.id');

        $this->assertNull(User::query()->findOrFail($userId)->email_verified_at);
        $this->assertNull(
            DB::table('users')->where('id', $userId)->value('email_verified_at')
        );
    }
}
