<?php

namespace Tests\Feature;

use App\Exceptions\TenantContextMissingException;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

/**
 * FlowTiger'ın en kritik güvenlik kuralı: tenant isolation.
 *
 * Kanıtlanması gereken matris (FlowTiger Anayasası §3, §9, §21):
 *
 *                    Customer A    Customer B
 *   Company A User        ✅            ❌
 *   Company B User        ❌            ✅
 *
 * Ek olarak: company context yoksa hiçbir erişim yoktur (fail closed).
 */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    private Company $companyA;

    private Company $companyB;

    private User $userA;

    private User $userB;

    private Customer $customerA;

    private Customer $customerB;

    protected function setUp(): void
    {
        parent::setUp();

        // Fixture'lar bilinçli olarak company context YOKKEN kuruluyor.
        // Böylece testin kendisi, ölçtüğü mekanizmayı kurarken kullanmıyor.
        $this->userA = User::factory()->create();
        $this->userB = User::factory()->create();

        $this->companyA = Company::factory()->withOwner($this->userA)->create();
        $this->companyB = Company::factory()->withOwner($this->userB)->create();

        $this->customerA = Customer::factory()->forCompany($this->companyA)->create(['name' => 'Ahmet']);
        $this->customerB = Customer::factory()->forCompany($this->companyB)->create(['name' => 'John']);
    }

    private function enterCompany(User $user, Company $company): void
    {
        app(CompanyContext::class)->setForUser($user, $company);
    }

    // ---------------------------------------------------------------
    // 1) AUTHORIZATION MATRİSİ
    // ---------------------------------------------------------------

    public function test_user_can_view_customer_of_their_own_company(): void
    {
        $this->enterCompany($this->userA, $this->companyA);

        $this->assertTrue(
            Gate::forUser($this->userA)->allows('view', $this->customerA),
            'Company A kullanıcısı kendi müşterisini görebilmeliydi.'
        );
    }

    public function test_company_b_user_cannot_view_company_a_customer(): void
    {
        $this->enterCompany($this->userB, $this->companyB);

        $this->assertTrue(
            Gate::forUser($this->userB)->denies('view', $this->customerA),
            'Company B kullanıcısı Company A müşterisine ERİŞEMEMELİYDİ.'
        );
    }

    public function test_company_a_user_cannot_view_company_b_customer(): void
    {
        $this->enterCompany($this->userA, $this->companyA);

        $this->assertTrue(
            Gate::forUser($this->userA)->denies('view', $this->customerB),
            'Company A kullanıcısı Company B müşterisine ERİŞEMEMELİYDİ.'
        );
    }

    /**
     * Matrisin tamamı tek testte — başarı kriterindeki tablonun birebir karşılığı.
     */
    public function test_full_isolation_matrix(): void
    {
        $matrix = [
            // [kullanıcı, şirket, müşteri, beklenen]
            ['A', 'A', 'A', true],
            ['A', 'A', 'B', false],
            ['B', 'B', 'B', true],
            ['B', 'B', 'A', false],
        ];

        foreach ($matrix as [$userKey, $companyKey, $customerKey, $expected]) {
            app(CompanyContext::class)->clear();

            $user = $userKey === 'A' ? $this->userA : $this->userB;
            $company = $companyKey === 'A' ? $this->companyA : $this->companyB;
            $customer = $customerKey === 'A' ? $this->customerA : $this->customerB;

            $this->enterCompany($user, $company);

            $this->assertSame(
                $expected,
                Gate::forUser($user)->allows('view', $customer),
                "User {$userKey} (Company {$companyKey}) → Customer {$customerKey} beklenen: ".
                ($expected ? 'ALLOWED' : 'DENIED')
            );
        }
    }

    // ---------------------------------------------------------------
    // 2) FAIL CLOSED — CONTEXT YOKSA ERİŞİM YOK
    // ---------------------------------------------------------------

    public function test_access_is_denied_when_there_is_no_company_context(): void
    {
        app(CompanyContext::class)->clear();

        $this->assertTrue(
            Gate::forUser($this->userA)->denies('view', $this->customerA),
            'Company context yokken erişim reddedilmeliydi (fail closed).'
        );
    }

    public function test_viewing_any_customer_is_denied_without_company_context(): void
    {
        app(CompanyContext::class)->clear();

        $this->assertTrue(Gate::forUser($this->userA)->denies('viewAny', Customer::class));
    }

    // ---------------------------------------------------------------
    // 3) QUERY ISOLATION — POLICY TEK BAŞINA YETERLİ DEĞİL
    // ---------------------------------------------------------------

    public function test_customer_query_only_returns_customers_of_the_active_company(): void
    {
        $this->enterCompany($this->userB, $this->companyB);

        $customers = Customer::all();

        $this->assertCount(1, $customers);
        $this->assertSame($this->customerB->id, $customers->first()->id);
        $this->assertFalse(
            $customers->contains('id', $this->customerA->id),
            'Company B contextinde Company A müşterisi sorgudan dönmemeliydi.'
        );
    }

    public function test_find_returns_null_for_a_customer_of_another_company(): void
    {
        $this->enterCompany($this->userB, $this->companyB);

        $this->assertNull(
            Customer::find($this->customerA->id),
            'Customer::find() başka tenant\'ın kaydını bulmamalıydı.'
        );
        $this->assertNotNull(Customer::find($this->customerB->id));
    }

    public function test_customer_queries_fail_closed_when_no_company_context_is_set(): void
    {
        app(CompanyContext::class)->clear();

        $this->expectException(TenantContextMissingException::class);

        Customer::all();
    }

    /**
     * Tenant scope kasıtlı olarak devre dışı bırakılabilmeli (seeder, system
     * işlemleri) — fakat yalnızca açık, aranabilir bir çağrı ile.
     */
    public function test_tenant_scope_can_be_bypassed_explicitly_for_system_operations(): void
    {
        app(CompanyContext::class)->clear();

        $all = Customer::withoutTenantScope('test: system-level dogrulama')->get();

        $this->assertCount(2, $all);
    }
}
