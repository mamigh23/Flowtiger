<?php

namespace Tests\Feature\Api\V1;

use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * Faz 3 — tenant izolasyonunun HTTP üzerindeki kanıtı.
 *
 * Faz 1 bu matrisi model katmanında kanıtlamıştı. Burada aynı matris
 * GERÇEK İSTEKLERLE, gerçek middleware zinciri ve gerçek route model
 * binding'i üzerinden yeniden kanıtlanıyor:
 *
 *                     A'nın müşterisi   B'nin müşterisi
 *   A kullanıcısı           ✅                ❌
 *   B kullanıcısı           ❌                ✅
 *
 * Reddin ŞEKLİ de önemlidir: başka tenant'ın kaydı için 403 değil 404
 * döner. 403, "böyle bir kayıt var ama senin değil" bilgisini verirdi;
 * bu, id'leri tarayarak rakip şirketin müşteri sayısını çıkarmaya yeter.
 *
 * Testler bilinçli olarak withoutTenantScope() ile doğrulama yapar:
 * ölçtüğü mekanizmaya güvenerek sonuç okuyan bir test hiçbir şey kanıtlamaz.
 */
class CustomerTenantIsolationApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/customers';

    private User $userA;

    private User $userB;

    private Company $companyA;

    private Company $companyB;

    private Customer $customerA;

    private Customer $customerB;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->userA = User::factory()->create();
        $this->userB = User::factory()->create();

        $this->companyA = Company::factory()->withOwner($this->userA)->create(['name' => 'Sirket A']);
        $this->companyB = Company::factory()->withOwner($this->userB)->create(['name' => 'Sirket B']);

        // TÜM fixture'lar context yokken kuruluyor; ilk HTTP isteğinden önce.
        $this->customerA = Customer::factory()->forCompany($this->companyA)->create(['name' => 'A Musterisi']);
        $this->customerB = Customer::factory()->forCompany($this->companyB)->create(['name' => 'B Musterisi']);

        $this->giveActiveCompany($this->userA, $this->companyA);
        $this->giveActiveCompany($this->userB, $this->companyB);
    }

    private function giveActiveCompany(User $user, Company $company): void
    {
        app(CompanySelectionService::class)->select($user, $company);
        app(CompanyContext::class)->clear();
    }

    /**
     * Auth::forgetGuards() burada kritiktir: bu dosyadaki testler AYNI
     * test içinde FARKLI kullanıcılar olarak istek atar. Guard önbelleği
     * temizlenmezse ikinci istek birincinin kullanıcısıyla çalışır ve
     * izolasyon testi sessizce anlamsızlaşır.
     */
    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    private function uriFor(Customer $customer): string
    {
        return self::URI.'/'.$customer->getKey();
    }

    private function rawCustomer(int $id): ?Customer
    {
        return Customer::withoutTenantScope('test doğrulaması')->find($id);
    }

    // ===============================================================
    // OKUMA
    // ===============================================================

    public function test_index_only_returns_customers_of_the_active_company(): void
    {
        $response = $this->apiAs($this->userA)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->customerA->getKey());

        $this->assertNotContains(
            $this->customerB->getKey(),
            collect($response->json('data'))->pluck('id')->all(),
            'Başka tenant\'ın müşterisi listeye sızmış.'
        );
    }

    public function test_index_does_not_leak_another_tenants_customer_names(): void
    {
        $body = $this->apiAs($this->userA)->getJson(self::URI)->assertOk()->getContent();

        $this->assertStringContainsString('A Musterisi', $body);
        $this->assertStringNotContainsString('B Musterisi', $body);
    }

    public function test_each_company_sees_its_own_total_only(): void
    {
        // createMany() zorunlu: create(), count(N) ile tüm modelleri önce
        // bellekte üretir ve customer_no'lar çakışır (bkz. CustomerFactory).
        Customer::factory()->count(4)->forCompany($this->companyB)->createMany();

        $this->apiAs($this->userA)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonPath('meta.total', 1);

        $this->apiAs($this->userB)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonPath('meta.total', 5);
    }

    public function test_show_of_another_tenants_customer_returns_404(): void
    {
        $this->apiAs($this->userA)
            ->getJson($this->uriFor($this->customerB))
            ->assertNotFound();
    }

    /**
     * 404 yanıtı, var olan bir kaydın adını sızdırmamalı.
     */
    public function test_the_404_response_does_not_leak_the_foreign_customer(): void
    {
        $body = $this->apiAs($this->userA)
            ->getJson($this->uriFor($this->customerB))
            ->assertNotFound()
            ->getContent();

        $this->assertStringNotContainsString('B Musterisi', $body);
    }

    // ===============================================================
    // YAZMA
    // ===============================================================

    public function test_update_of_another_tenants_customer_returns_404(): void
    {
        $this->apiAs($this->userA)
            ->putJson($this->uriFor($this->customerB), ['name' => 'Ele Gecirildi'])
            ->assertNotFound();
    }

    public function test_update_of_another_tenants_customer_does_not_modify_it(): void
    {
        $this->apiAs($this->userA)
            ->putJson($this->uriFor($this->customerB), ['name' => 'Ele Gecirildi'])
            ->assertNotFound();

        $this->assertSame(
            'B Musterisi',
            $this->rawCustomer($this->customerB->getKey())->name,
            'Başka tenant\'ın müşterisi değiştirilmiş.'
        );
    }

    public function test_destroy_of_another_tenants_customer_returns_404(): void
    {
        $this->apiAs($this->userA)
            ->deleteJson($this->uriFor($this->customerB))
            ->assertNotFound();
    }

    public function test_destroy_of_another_tenants_customer_does_not_delete_it(): void
    {
        $this->apiAs($this->userA)
            ->deleteJson($this->uriFor($this->customerB))
            ->assertNotFound();

        $this->assertNotNull(
            $this->rawCustomer($this->customerB->getKey()),
            'Başka tenant\'ın müşterisi silinmiş.'
        );
    }

    public function test_store_always_writes_to_the_active_company(): void
    {
        $id = $this->apiAs($this->userB)
            ->postJson(self::URI, [
                'name' => 'B Icin Yeni',
                // Saldırı denemesi: kaydı A şirketine yazdırmaya çalış.
                'company_id' => $this->companyA->getKey(),
            ])
            ->assertCreated()
            ->json('data.id');

        $this->assertSame(
            $this->companyB->getKey(),
            (int) $this->rawCustomer($id)->company_id,
            'Kayıt saldırganın istediği şirkete yazılmış.'
        );
    }

    /**
     * customer_no şirket içinde artar; tenant'lar birbirinin sayacını
     * görmez ve etkilemez (§7).
     */
    public function test_customer_numbers_are_independent_per_company(): void
    {
        $firstForA = $this->apiAs($this->userA)
            ->postJson(self::URI, ['name' => 'A-2'])
            ->assertCreated()
            ->json('data.customer_no');

        $firstForB = $this->apiAs($this->userB)
            ->postJson(self::URI, ['name' => 'B-2'])
            ->assertCreated()
            ->json('data.customer_no');

        $this->assertSame(2, $firstForA);
        $this->assertSame(2, $firstForB, 'customer_no şirketler arasında paylaşılıyor.');
    }

    // ===============================================================
    // BAĞLAM DEĞİŞİMİ
    // ===============================================================

    /**
     * Aynı kullanıcı iki şirkete üye olabilir; gördüğü veri AKTİF şirkete
     * göre değişmeli, üyeliklerinin toplamına göre değil.
     */
    public function test_switching_the_active_company_switches_the_visible_data(): void
    {
        $this->companyB->users()->syncWithoutDetaching([$this->userA->getKey() => ['role' => 'member']]);

        $this->apiAs($this->userA)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->customerA->getKey());

        $this->giveActiveCompany($this->userA, $this->companyB);

        $this->apiAs($this->userA)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->customerB->getKey());
    }

    /**
     * Üyelik kaldırıldığında bayat bir active_company_id erişim vermemeli.
     */
    public function test_access_is_lost_when_the_membership_is_revoked(): void
    {
        $this->apiAs($this->userA)->getJson(self::URI)->assertOk();

        $this->companyA->users()->detach($this->userA->getKey());

        $this->apiAs($this->userA)
            ->getJson(self::URI)
            ->assertForbidden();
    }

    public function test_a_user_without_an_active_company_cannot_reach_customers(): void
    {
        $stranger = User::factory()->create();

        $this->apiAs($stranger)->getJson(self::URI)->assertForbidden();
        $this->apiAs($stranger)->getJson($this->uriFor($this->customerA))->assertForbidden();
    }

    // ===============================================================
    // MIDDLEWARE SIRALAMASI
    // ===============================================================

    /**
     * Bu testin varlık sebebi bir regresyon korkusudur.
     *
     * Route model binding (SubstituteBindings) Laravel'in middleware
     * priority listesindedir; company.context ise oraya bootstrap/app.php'de
     * ELLE eklenmiştir. O kayıt silinirse binding, company context
     * kurulmadan önce çalışır; CompanyScope context bulamaz ve KENDİ
     * müşterini istemek bile 403 döner.
     *
     * 200 beklemek bu sıralamanın davranışsal kanıtıdır.
     */
    public function test_route_model_binding_runs_after_the_company_context_is_established(): void
    {
        $response = $this->apiAs($this->userA)->getJson($this->uriFor($this->customerA));

        $this->assertSame(
            200,
            $response->getStatusCode(),
            'Kendi müşterisini isteyen kullanıcı 200 almalıydı. 403 geldiyse '.
            'company.context, SubstituteBindings\'ten SONRA çalışıyor demektir '.
            '(bkz. bootstrap/app.php prependToPriorityList).'
        );

        $response->assertJsonPath('data.id', $this->customerA->getKey());
    }
}
