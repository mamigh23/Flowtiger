<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Enums\Role;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Faz 5 — audit geçmişinin OKUNMASI.
 *
 * Üç bağımsız soru burada kanıtlanır:
 *   1. Yalnızca owner okuyabiliyor mu?          (§16)
 *   2. Yalnızca AKTİF şirketin kayıtları mı?     (§2, §17)
 *   3. Yanıt sır sızdırıyor mu?                  (§14, §25)
 *
 * Üretim tarafı (hangi olay hangi izi bırakıyor) ayrı dosyada:
 * tests/Feature/Audit/AuditTrailTest.php
 */
class AuditLogApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/audit-logs';

    private User $owner;

    private User $member;

    private Company $company;

    private Company $foreignCompany;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create(['name' => 'Sahip']);
        $this->member = User::factory()->create(['name' => 'Uye']);

        $this->company = Company::factory()->withOwner($this->owner)->create();
        $this->company->users()->syncWithoutDetaching([
            $this->member->getKey() => ['role' => Role::Member->value],
        ]);

        $this->foreignCompany = Company::factory()
            ->withOwner(User::factory()->create())
            ->create();

        $this->giveActiveCompany($this->owner);
        $this->giveActiveCompany($this->member);

        // Hazırlığın ürettiği company.selected kayıtları temizlenir; her
        // test kendi kurduğu veriyi ölçsün.
        $this->clearAuditLog();
    }

    // ---------------------------------------------------------------
    // YARDIMCILAR
    // ---------------------------------------------------------------

    private function giveActiveCompany(User $user, ?Company $company = null): void
    {
        app(CompanySelectionService::class)->select($user, $company ?? $this->company);
        app(CompanyContext::class)->clear();
    }

    /**
     * Fixture sıfırlama; AuditLog modeli silmeyi bilinçli olarak yasakladığı
     * için query builder üzerinden yapılır.
     */
    private function clearAuditLog(): void
    {
        DB::table('audit_logs')->delete();
    }

    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    // ===============================================================
    // YETKİ
    // ===============================================================

    public function test_an_owner_can_list_the_audit_logs(): void
    {
        AuditLog::factory()->forCompany($this->company)->by($this->owner)->create();

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonStructure([
                'data' => [['id', 'action', 'created_at']],
                'links',
                'meta',
            ]);
    }

    /**
     * §16: audit log yanlış ellerde bir gözetleme aracıdır. Bir üyenin,
     * iş arkadaşlarının her hareketini görebilmesi varsayılan olamaz.
     */
    public function test_a_member_cannot_list_the_audit_logs(): void
    {
        AuditLog::factory()->forCompany($this->company)->create();

        $this->apiAs($this->member)->getJson(self::URI)->assertForbidden();
    }

    public function test_listing_requires_authentication(): void
    {
        $this->getJson(self::URI)->assertUnauthorized();
    }

    public function test_listing_requires_an_active_company(): void
    {
        $stranger = User::factory()->create();

        $this->apiAs($stranger)->getJson(self::URI)->assertForbidden();
    }

    // ===============================================================
    // TENANT İZOLASYONU
    // ===============================================================

    public function test_only_logs_of_the_active_company_are_returned(): void
    {
        $mine = AuditLog::factory()->forCompany($this->company)->create();
        AuditLog::factory()->forCompany($this->foreignCompany)->create();

        $response = $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $mine->getKey());

        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_another_tenants_logs_are_never_visible(): void
    {
        $foreign = AuditLog::factory()
            ->forCompany($this->foreignCompany)
            ->action(AuditAction::CustomerDeleted)
            ->create();

        $response = $this->apiAs($this->owner)->getJson(self::URI)->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertNotContains($foreign->getKey(), $ids);
        $this->assertSame(0, $response->json('meta.total'));
    }

    /**
     * §17: şirkete bağlı olmayan sistem kayıtları (login/logout)
     * kullanıcıya açık API'de GÖRÜNMEZ.
     */
    public function test_company_less_system_logs_are_not_visible(): void
    {
        AuditLog::factory()
            ->withoutCompany()
            ->action(AuditAction::LoginSucceeded)
            ->create();

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_switching_the_active_company_switches_the_visible_logs(): void
    {
        $secondCompany = Company::factory()->withOwner($this->owner)->create();

        $first = AuditLog::factory()->forCompany($this->company)->create();

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonPath('data.0.id', $first->getKey());

        $this->giveActiveCompany($this->owner, $secondCompany);
        $this->clearAuditLog();

        $second = AuditLog::factory()->forCompany($secondCompany)->create();

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $second->getKey());
    }

    // ===============================================================
    // SAYFALAMA VE SIRALAMA
    // ===============================================================

    public function test_the_default_page_size_is_twenty(): void
    {
        for ($i = 0; $i < 25; $i++) {
            AuditLog::factory()->forCompany($this->company)->create();
        }

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('meta.total', 25);
    }

    public function test_the_page_size_can_be_changed(): void
    {
        for ($i = 0; $i < 5; $i++) {
            AuditLog::factory()->forCompany($this->company)->create();
        }

        $this->apiAs($this->owner)
            ->getJson(self::URI.'?per_page=2')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.per_page', 2)
            ->assertJsonPath('meta.total', 5);
    }

    public function test_the_page_size_cannot_exceed_one_hundred(): void
    {
        $this->apiAs($this->owner)
            ->getJson(self::URI.'?per_page=500')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['per_page']);
    }

    public function test_logs_are_returned_newest_first(): void
    {
        $oldest = AuditLog::factory()->forCompany($this->company)
            ->create(['created_at' => now()->subDays(3)]);
        $newest = AuditLog::factory()->forCompany($this->company)
            ->create(['created_at' => now()->subDay()]);
        $middle = AuditLog::factory()->forCompany($this->company)
            ->create(['created_at' => now()->subDays(2)]);

        $ids = collect(
            $this->apiAs($this->owner)->getJson(self::URI)->assertOk()->json('data')
        )->pluck('id')->all();

        $this->assertSame(
            [$newest->getKey(), $middle->getKey(), $oldest->getKey()],
            $ids,
            'Audit kayıtları en yeniden eskiye sıralanmalıydı.'
        );
    }

    // ===============================================================
    // YANIT ŞEKLİ VE SIR SIZINTISI
    // ===============================================================

    public function test_the_resource_exposes_only_whitelisted_fields(): void
    {
        AuditLog::factory()
            ->forCompany($this->company)
            ->by($this->owner)
            ->create([
                'auditable_type' => Customer::class,
                'auditable_id' => 42,
                'new_values' => ['name' => 'Musteri'],
            ]);

        $payload = $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->json('data.0');

        $keys = array_keys($payload);
        sort($keys);

        $this->assertSame(
            ['action', 'actor', 'auditable', 'created_at', 'id', 'ip_address', 'metadata', 'new_values', 'old_values'],
            $keys,
            'AuditLogResource beklenmeyen bir alan döndürüyor.'
        );

        // Aktör TAM kullanıcı kaydı değil, ÖZET olarak döner.
        $this->assertSame(['id', 'name'], array_keys($payload['actor']));

        // Sınıf yolu değil kısa ad.
        $this->assertSame('customer', $payload['auditable']['type']);
    }

    public function test_the_response_never_exposes_credentials(): void
    {
        AuditLog::factory()->forCompany($this->company)->by($this->owner)->create();

        $body = $this->apiAs($this->owner)->getJson(self::URI)->assertOk()->getContent();

        $this->assertStringNotContainsString('password', $body);
        $this->assertStringNotContainsString('remember_token', $body);
        $this->assertStringNotContainsString($this->owner->getAuthPassword(), $body);
        $this->assertStringNotContainsString($this->owner->email, $body);
    }

    /**
     * Audit ucu SALT OKUNURDUR: yazma yolu yoktur ve olmamalıdır.
     * Yazılabilseydi iz uydurmak mümkün olurdu.
     */
    public function test_the_audit_endpoint_is_read_only(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, ['action' => 'login.success'])
            ->assertStatus(405);
    }
}
