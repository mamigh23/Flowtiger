<?php

namespace Tests\Feature;

use App\Exceptions\CrossTenantAccessException;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CustomerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Yazma tarafındaki tenant isolation (Anayasa §3, §9).
 *
 * Okuma tarafını global scope + policy koruyor; burada kanıtlanan şey
 * bir müşterinin request gövdesi ya da güncelleme yoluyla başka bir
 * şirkete taşınamayacağıdır.
 */
class CustomerTenantWriteTest extends TestCase
{
    use RefreshDatabase;

    private Company $companyA;

    private Company $companyB;

    private User $userA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->userA = User::factory()->create();
        $this->companyA = Company::factory()->withOwner($this->userA)->create();
        $this->companyB = Company::factory()->create();
    }

    // ---------------------------------------------------------------
    // MASS ASSIGNMENT
    // ---------------------------------------------------------------

    public function test_company_id_is_not_mass_assignable(): void
    {
        // Kullanıcıdan gelmiş gibi davranan bir request gövdesi.
        $payload = [
            'company_id' => $this->companyB->id,
            'customer_no' => 999,
            'name' => 'Sizinti Denemesi',
        ];

        $customer = new Customer();
        $customer->fill($payload);

        $this->assertNull(
            $customer->company_id,
            'company_id request gövdesinden doldurulabiliyor — tenant kaçışı mümkün.'
        );
        $this->assertNull(
            $customer->customer_no,
            'customer_no sistem tarafından üretilir, request gövdesinden gelmemeli.'
        );
        $this->assertSame('Sizinti Denemesi', $customer->name);
    }

    public function test_an_existing_customer_cannot_be_transferred_to_another_company(): void
    {
        $customer = Customer::factory()->forCompany($this->companyA)->create();

        app(CompanyContext::class)->setForUser($this->userA, $this->companyA);

        $customer->company_id = $this->companyB->id;

        $this->expectException(CrossTenantAccessException::class);

        $customer->save();
    }

    public function test_a_customer_cannot_be_created_for_a_company_other_than_the_active_one(): void
    {
        app(CompanyContext::class)->setForUser($this->userA, $this->companyA);

        $customer = new Customer(['name' => 'Sizinti']);
        $customer->company_id = $this->companyB->id;
        $customer->customer_no = 1;

        $this->expectException(CrossTenantAccessException::class);

        $customer->save();
    }

    public function test_company_id_is_filled_from_the_active_context_when_omitted(): void
    {
        app(CompanyContext::class)->setForUser($this->userA, $this->companyA);

        $customer = new Customer(['name' => 'Baglamdan Gelen']);
        $customer->customer_no = 1;
        $customer->save();

        $this->assertSame($this->companyA->id, $customer->fresh()->company_id);
    }

    // ---------------------------------------------------------------
    // CUSTOMER SERVICE — MEVCUT DAVRANIŞ KORUNUYOR MU?
    // ---------------------------------------------------------------

    public function test_customer_service_still_numbers_customers_per_company(): void
    {
        $service = app(CustomerService::class);

        $first = $service->create($this->companyA, 'Ahmet', '05050000000');
        $second = $service->create($this->companyA, 'Mehmet', '05050000001');
        $otherTenant = $service->create($this->companyB, 'John');

        $this->assertSame(1, $first->customer_no);
        $this->assertSame(2, $second->customer_no);

        // customer_no global değil, şirket içinde artar.
        $this->assertSame(1, $otherTenant->customer_no);
        $this->assertSame($this->companyB->id, $otherTenant->company_id);
    }

    public function test_customer_service_refuses_to_write_outside_the_active_company(): void
    {
        app(CompanyContext::class)->setForUser($this->userA, $this->companyA);

        $this->expectException(CrossTenantAccessException::class);

        app(CustomerService::class)->create($this->companyB, 'Sizinti');
    }

    public function test_customer_service_works_inside_the_active_company(): void
    {
        app(CompanyContext::class)->setForUser($this->userA, $this->companyA);

        $customer = app(CustomerService::class)->create($this->companyA, 'Ahmet');

        $this->assertSame($this->companyA->id, $customer->company_id);
        $this->assertSame(1, $customer->customer_no);
    }
}
