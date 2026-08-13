<?php

namespace Tests\Feature\Api\V1;

use App\Http\Middleware\ResolveCompanyContext;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Faz 2.3'ün asıl amacı: zincirin HTTP üzerinde gerçekten kurulduğunu
 * kanıtlamak.
 *
 *   Request → auth:sanctum → company.context → CompanyContext
 *           → CompanyScope → yalnızca aktif şirketin verisi
 *
 * Customer CRUD API'si bu fazda bilinçli olarak YOK. Zinciri kanıtlamak
 * için testin kendi içinde geçici bir "probe" route'u tanımlanır; böylece
 * üretim route dosyasına henüz onaylanmamış bir uç eklenmez.
 */
class TenantContextChainTest extends TestCase
{
    use RefreshDatabase;

    private const PROBE_URI = '/api/v1/_test/tenant-probe';

    /** company.context OLMADAN, sadece auth arkasında duran uç. */
    private const UNGUARDED_PROBE_URI = '/api/v1/_test/unguarded-probe';

    private User $user;

    private Company $companyA;

    private Company $companyB;

    private Customer $customerA;

    private Customer $customerB;

    /** Probe controller'ına gerçekten ulaşıldı mı? */
    private bool $probeReached = false;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();

        $this->companyA = Company::factory()->withOwner($this->user)->create();
        $this->companyB = Company::factory()->withOwner(User::factory()->create())->create();

        // Fixture'lar context YOKKEN kuruluyor (Faz 1 testlerindeki yaklaşım).
        $this->customerA = Customer::factory()->forCompany($this->companyA)->create(['name' => 'A Musterisi']);
        $this->customerB = Customer::factory()->forCompany($this->companyB)->create(['name' => 'B Musterisi']);

        $this->registerProbeRoutes();
    }

    /**
     * Tenant zincirinin arkasındaki geçici uçlar.
     *
     * Yalnızca bu test sınıfı içinde yaşarlar; routes/api.php'ye
     * dokunulmaz.
     */
    private function registerProbeRoutes(): void
    {
        Route::middleware(['api', 'auth:sanctum', 'company.context'])
            ->get(self::PROBE_URI, function (): array {
                $this->probeReached = true;

                return [
                    'active_company_id' => app(CompanyContext::class)->id(),
                    'customer_ids' => Customer::query()->pluck('id')->all(),
                    'customer_names' => Customer::query()->pluck('name')->all(),
                ];
            })->name('test.tenant-probe');

        // company.context BİLİNÇLİ olarak yok: context'siz bir tenant
        // sorgusunun ne döndüğünü ölçmek için.
        Route::middleware(['api', 'auth:sanctum'])
            ->get(self::UNGUARDED_PROBE_URI, function (): array {
                return ['customer_ids' => Customer::query()->pluck('id')->all()];
            })->name('test.unguarded-probe');
    }

    private function withTokenFor(User $user): self
    {
        return $this->withHeader(
            'Authorization',
            'Bearer '.$user->createToken('test-cihaz')->plainTextToken
        );
    }

    /**
     * Kullanıcının aktif şirketini veritabanına yazar, ancak testin
     * kendi container'ındaki context'i TEMİZLER.
     *
     * Böylece istekten sonra gözlemlenen context'i middleware'in kurduğu
     * kesinleşir; testin kendi hazırlığı sonucu maskelemez.
     */
    private function giveActiveCompany(User $user, Company $company): void
    {
        app(CompanySelectionService::class)->select($user, $company);
        app(CompanyContext::class)->clear();
    }

    // ---------------------------------------------------------------
    // A) ZİNCİR ÇALIŞIYOR
    // ---------------------------------------------------------------

    public function test_the_chain_grants_access_when_an_active_company_is_valid(): void
    {
        $this->giveActiveCompany($this->user, $this->companyA);

        $this->withTokenFor($this->user)
            ->getJson(self::PROBE_URI)
            ->assertOk()
            ->assertJsonPath('active_company_id', $this->companyA->getKey());

        $this->assertTrue($this->probeReached, 'İstek controller\'a ulaşmalıydı.');
    }

    public function test_the_middleware_establishes_the_company_context_during_the_request(): void
    {
        $this->giveActiveCompany($this->user, $this->companyA);

        $this->assertFalse(
            app(CompanyContext::class)->has(),
            'Test hazırlığı context\'i temizlemiş olmalıydı.'
        );

        $this->withTokenFor($this->user)->getJson(self::PROBE_URI)->assertOk();

        $this->assertSame(
            $this->companyA->getKey(),
            app(CompanyContext::class)->id(),
            'Context\'i kuran şey company.context middleware\'i olmalıydı.'
        );
    }

    // ---------------------------------------------------------------
    // B) TENANT İZOLASYONU — HTTP ÜZERİNDE
    // ---------------------------------------------------------------

    /**
     * Faz 1'in izolasyon matrisi, artık gerçek bir HTTP isteği üzerinden.
     */
    public function test_a_tenant_endpoint_only_returns_data_of_the_active_company(): void
    {
        $this->giveActiveCompany($this->user, $this->companyA);

        $response = $this->withTokenFor($this->user)
            ->getJson(self::PROBE_URI)
            ->assertOk()
            ->assertJsonPath('customer_ids', [$this->customerA->getKey()]);

        $this->assertNotContains(
            $this->customerB->getKey(),
            $response->json('customer_ids'),
            'Başka tenant\'ın müşterisi yanıta sızmış.'
        );

        $this->assertStringNotContainsString(
            'B Musterisi',
            $response->getContent(),
            'Başka tenant\'ın müşteri adı yanıta sızmış.'
        );
    }

    // ---------------------------------------------------------------
    // C) FAIL CLOSED
    // ---------------------------------------------------------------

    public function test_a_tenant_endpoint_is_blocked_when_no_company_is_active(): void
    {
        $this->assertNull($this->user->fresh()->active_company_id);

        $this->withTokenFor($this->user)
            ->getJson(self::PROBE_URI)
            ->assertForbidden();

        $this->assertFalse(
            $this->probeReached,
            'İstek controller\'a ULAŞMAMALIYDI; middleware fail-closed davranmalı.'
        );
    }

    /**
     * Bayat bir active_company_id erişim vermemeli: üyelik her istekte
     * yeniden doğrulanır (Anayasa §6).
     */
    public function test_access_is_revoked_when_the_membership_is_removed(): void
    {
        $this->giveActiveCompany($this->user, $this->companyA);

        $this->withTokenFor($this->user)->getJson(self::PROBE_URI)->assertOk();

        $this->companyA->users()->detach($this->user->getKey());

        // active_company_id hâlâ dolu; değişen tek şey üyelik.
        $this->assertSame($this->companyA->getKey(), $this->user->fresh()->active_company_id);

        $this->probeReached = false;

        $this->withTokenFor($this->user)
            ->getJson(self::PROBE_URI)
            ->assertForbidden();

        $this->assertFalse($this->probeReached);
    }

    public function test_access_is_revoked_when_the_company_is_deleted(): void
    {
        $this->giveActiveCompany($this->user, $this->companyA);

        $this->companyA->delete();

        // Veritabanı seviyesindeki nullOnDelete devreye girmeli.
        $this->assertNull(
            $this->user->fresh()->active_company_id,
            'Şirket silindiğinde active_company_id NULL olmalıydı.'
        );

        $this->withTokenFor($this->user)
            ->getJson(self::PROBE_URI)
            ->assertForbidden();

        $this->assertFalse($this->probeReached);
    }

    /**
     * Kimlik doğrulaması company.context'ten ÖNCE gelir. Aksi halde
     * middleware kullanıcısız bir istekte context kurmaya çalışırdı.
     */
    public function test_an_unauthenticated_request_is_rejected_with_401(): void
    {
        $this->getJson(self::PROBE_URI)->assertUnauthorized();

        $this->assertFalse($this->probeReached);
    }

    public function test_an_invalid_token_is_rejected_with_401(): void
    {
        $this->withHeader('Authorization', 'Bearer 1|gecersiz-token')
            ->getJson(self::PROBE_URI)
            ->assertUnauthorized();

        $this->assertFalse($this->probeReached);
    }

    /**
     * Bir tenant sorgusu context olmadan çalışırsa CompanyScope exception
     * fırlatır. Bu, 500 değil 403 olarak dönmelidir: sızıntı değil,
     * reddedilmiş bir erişimdir.
     */
    public function test_a_tenant_query_without_context_is_a_403_not_a_500(): void
    {
        $this->withTokenFor($this->user)
            ->getJson(self::UNGUARDED_PROBE_URI)
            ->assertForbidden();
    }

    // ---------------------------------------------------------------
    // D) MIDDLEWARE KAYDI
    // ---------------------------------------------------------------

    public function test_the_company_context_alias_is_registered(): void
    {
        $this->assertSame(
            ResolveCompanyContext::class,
            Route::getMiddleware()['company.context'] ?? null,
            'company.context alias\'ı ResolveCompanyContext\'e bağlanmamış.'
        );
    }

    /**
     * Anayasa gereği company.context GLOBAL middleware OLMAMALIDIR.
     * Global olsaydı login ve şirket listeleme uçları da tenant context
     * isterdi; kullanıcı sisteme hiç giremezdi.
     */
    public function test_the_company_context_middleware_is_not_global(): void
    {
        $globalMiddleware = app(Kernel::class)->getGlobalMiddleware();

        $this->assertNotContains(ResolveCompanyContext::class, $globalMiddleware);
        $this->assertNotContains('company.context', $globalMiddleware);
    }

    /**
     * Global olmadığının davranışsal kanıtı: aktif şirketi olmayan bir
     * kullanıcı tenant dışı uçları kullanmaya devam edebilmeli.
     */
    public function test_non_tenant_endpoints_still_work_without_an_active_company(): void
    {
        $this->assertNull($this->user->fresh()->active_company_id);

        $this->withTokenFor($this->user)->getJson('/api/v1/me')->assertOk();
        $this->withTokenFor($this->user)->getJson('/api/v1/companies')->assertOk();
    }
}
