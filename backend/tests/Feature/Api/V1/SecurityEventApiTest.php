<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Enums\Role;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Faz 9 — kullanıcının kendi güvenlik olayları.
 *
 * Bu ucun tehlikeli yanı, AuditLog'un global tenant scope'unu kaldıran
 * TEK yol olmasıdır. Bu yüzden testlerin ağırlığı da orada:
 *
 *   - başka kullanıcının olayı görünüyor mu?
 *   - ŞİRKETE ait bir audit satırı buradan sızıyor mu?
 *   - şirket audit ucu bundan etkilendi mi?
 *
 * Üçünün de cevabı hayır olmalı; scope kaldırıldı ama yerine iki
 * ayrılamaz kısıt kondu (user_id + company_id IS NULL).
 */
class SecurityEventApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/profile/security-events';

    private User $user;

    private User $otherUser;

    private Company $company;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create(['email' => 'kullanici@flowtiger.test']);
        $this->otherUser = User::factory()->create(['email' => 'baskasi@flowtiger.test']);

        $this->company = Company::factory()->withOwner($this->user)->create();
        $this->company->users()->syncWithoutDetaching([
            $this->otherUser->getKey() => ['role' => Role::Member->value],
        ]);

        $this->clearAuditLog();
    }

    // ---------------------------------------------------------------
    // YARDIMCILAR
    // ---------------------------------------------------------------

    private function clearAuditLog(): void
    {
        DB::table('audit_logs')->delete();
    }

    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->flushHeaders()
            ->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    private function identityEvent(User $user, AuditAction $action): AuditLog
    {
        return AuditLog::factory()
            ->withoutCompany()
            ->by($user)
            ->action($action)
            ->create();
    }

    private function companyEvent(User $user, AuditAction $action): AuditLog
    {
        return AuditLog::factory()
            ->forCompany($this->company)
            ->by($user)
            ->action($action)
            ->create();
    }

    // ===============================================================
    // GÖRÜNÜRLÜK
    // ===============================================================

    public function test_a_user_sees_their_own_identity_events(): void
    {
        $this->identityEvent($this->user, AuditAction::LoginSucceeded);
        $this->identityEvent($this->user, AuditAction::PasswordChanged);

        $this->apiAs($this->user)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonStructure([
                'data' => [['id', 'action', 'ip_address', 'metadata', 'created_at']],
                'links',
                'meta',
            ]);
    }

    public function test_another_users_events_are_never_visible(): void
    {
        $mine = $this->identityEvent($this->user, AuditAction::LoginSucceeded);
        $foreign = $this->identityEvent($this->otherUser, AuditAction::PasswordChanged);

        $response = $this->apiAs($this->user)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $mine->getKey());

        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertNotContains($foreign->getKey(), $ids);
    }

    /**
     * EN KRİTİK TEST.
     *
     * securityEventsFor() tenant scope'unu kaldırıyor. Kaldırma
     * yeterince dar değilse, kullanıcının ÜYESİ OLDUĞU şirketin audit
     * kayıtları buradan sızar — üstelik rol kontrolü olmadan, yani bir
     * member owner'a özel kayıtları görebilir.
     */
    public function test_company_audit_records_never_leak_into_security_events(): void
    {
        $this->companyEvent($this->user, AuditAction::CustomerDeleted);
        $this->companyEvent($this->user, AuditAction::MemberRemoved);
        $mine = $this->identityEvent($this->user, AuditAction::LoginSucceeded);

        $response = $this->apiAs($this->user)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $mine->getKey());

        $actions = collect($response->json('data'))->pluck('action')->all();

        $this->assertNotContains('customer.deleted', $actions);
        $this->assertNotContains('member.removed', $actions);
    }

    /**
     * §13: kullanıcı kendi güvenlik olaylarını rolünden bağımsız görür.
     * Bir member için owner olmak gerekmez.
     */
    public function test_a_member_can_read_their_own_security_events(): void
    {
        $this->identityEvent($this->otherUser, AuditAction::LoginSucceeded);

        $this->apiAs($this->otherUser)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    /**
     * Uç company.context taşımaz: hiçbir şirkete üye olmayan kullanıcı da
     * kendi güvenlik geçmişini görebilmeli.
     */
    public function test_it_works_without_an_active_company(): void
    {
        $stranger = User::factory()->create();
        $this->identityEvent($stranger, AuditAction::LoginSucceeded);

        $this->assertNull($stranger->active_company_id);

        $this->apiAs($stranger)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_reading_security_events_requires_authentication(): void
    {
        $this->getJson(self::URI)->assertUnauthorized();
    }

    /**
     * Başarısız giriş denemeleri kullanıcıya GÖSTERİLİR: "birisi senin
     * hesabınla giriş denedi" sinyali, güvenlik akışının en değerli
     * kayıtlarından biridir.
     */
    public function test_failed_login_attempts_are_visible(): void
    {
        $this->identityEvent($this->user, AuditAction::LoginFailed);

        $this->apiAs($this->user)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonPath('data.0.action', 'login.failed');
    }

    // ===============================================================
    // YANIT ŞEKLİ
    // ===============================================================

    public function test_the_resource_exposes_only_whitelisted_fields(): void
    {
        $this->identityEvent($this->user, AuditAction::PasswordChanged);

        $payload = $this->apiAs($this->user)
            ->getJson(self::URI)
            ->assertOk()
            ->json('data.0');

        $keys = array_keys($payload);
        sort($keys);

        $this->assertSame(
            ['action', 'created_at', 'id', 'ip_address', 'metadata'],
            $keys,
            'SecurityEventResource beklenmeyen bir alan döndürüyor.'
        );
    }

    public function test_the_response_never_exposes_credentials(): void
    {
        $this->identityEvent($this->user, AuditAction::PasswordChanged);
        $this->identityEvent($this->user, AuditAction::EmailChanged);

        $body = $this->apiAs($this->user)->getJson(self::URI)->assertOk()->getContent();

        $this->assertStringNotContainsString('remember_token', $body);
        $this->assertStringNotContainsString($this->user->getAuthPassword(), $body);
        $this->assertStringNotContainsString($this->tokens[$this->user->getKey()], $body);

        // Kimlik olaylarında e-posta zaten özetlenerek saklanıyor
        // (Faz 6.1 PII kuralı); düz metin adres yanıta da çıkamaz.
        $this->assertStringNotContainsString('kullanici@flowtiger.test', $body);
    }

    // ===============================================================
    // SIRALAMA VE SAYFALAMA
    // ===============================================================

    public function test_events_are_returned_newest_first(): void
    {
        $oldest = AuditLog::factory()->withoutCompany()->by($this->user)
            ->action(AuditAction::LoginSucceeded)
            ->create(['created_at' => now()->subDays(3)]);

        $newest = AuditLog::factory()->withoutCompany()->by($this->user)
            ->action(AuditAction::PasswordChanged)
            ->create(['created_at' => now()->subDay()]);

        $middle = AuditLog::factory()->withoutCompany()->by($this->user)
            ->action(AuditAction::LoggedOut)
            ->create(['created_at' => now()->subDays(2)]);

        $ids = collect(
            $this->apiAs($this->user)->getJson(self::URI)->assertOk()->json('data')
        )->pluck('id')->all();

        $this->assertSame([$newest->getKey(), $middle->getKey(), $oldest->getKey()], $ids);
    }

    public function test_the_default_page_size_is_twenty(): void
    {
        for ($i = 0; $i < 25; $i++) {
            $this->identityEvent($this->user, AuditAction::LoginSucceeded);
        }

        $this->apiAs($this->user)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('meta.total', 25);
    }

    public function test_the_page_size_can_be_changed(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->identityEvent($this->user, AuditAction::LoginSucceeded);
        }

        $this->apiAs($this->user)
            ->getJson(self::URI.'?per_page=2')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total', 5);
    }

    public function test_the_page_size_cannot_exceed_one_hundred(): void
    {
        $this->apiAs($this->user)
            ->getJson(self::URI.'?per_page=500')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['per_page']);
    }

    // ===============================================================
    // ŞİRKET AUDIT UCU BOZULMADI
    // ===============================================================

    /**
     * §21.18: Faz 5'in şirket audit ucu bu fazdan etkilenmemeli —
     * hâlâ tenant scope'una tabi ve hâlâ owner'a özel.
     */
    public function test_the_company_audit_endpoint_still_behaves_as_before(): void
    {
        app(CompanySelectionService::class)->select($this->user, $this->company);
        app(CompanySelectionService::class)->select($this->otherUser, $this->company);
        app(CompanyContext::class)->clear();
        $this->clearAuditLog();

        $companyRow = $this->companyEvent($this->user, AuditAction::CustomerCreated);
        $this->identityEvent($this->user, AuditAction::LoginSucceeded);

        // Owner ŞİRKET kayıtlarını görür; kimlik olayları oraya sızmaz.
        $this->apiAs($this->user)
            ->getJson('/api/v1/audit-logs')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $companyRow->getKey());

        // Member şirket audit'ini hâlâ göremez...
        $this->apiAs($this->otherUser)
            ->getJson('/api/v1/audit-logs')
            ->assertForbidden();

        // ...ama kendi güvenlik olaylarını görebilir.
        $this->identityEvent($this->otherUser, AuditAction::PasswordChanged);

        $this->apiAs($this->otherUser)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }
}
