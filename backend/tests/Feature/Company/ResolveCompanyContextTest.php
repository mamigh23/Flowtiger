<?php

namespace Tests\Feature\Company;

use App\Exceptions\ActiveCompanyException;
use App\Http\Middleware\ResolveCompanyContext;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Tests\TestCase;

/**
 * Faz 2.2 — zincirin son halkası:
 * Active Company → CompanyContext → Tenant Isolation.
 *
 * Middleware bilinçli olarak route'a bağlanmadan, doğrudan çağrılarak test
 * ediliyor: davranışı HTTP altyapısından bağımsız olarak kanıtlanmalı.
 * Route bağlantısı Faz 2.3'te yapılacak.
 */
class ResolveCompanyContextTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Middleware'i gerçek bir istek üzerinde çalıştırır.
     *
     * @return array{0: bool, 1: ?Response} [$next çağrıldı mı, dönen yanıt]
     */
    private function runMiddleware(?User $user): array
    {
        $request = Request::create('/tenant-kaynagi', 'GET');
        $request->setUserResolver(fn () => $user);

        $nextWasCalled = false;

        $response = app(ResolveCompanyContext::class)->handle(
            $request,
            function () use (&$nextWasCalled): Response {
                $nextWasCalled = true;

                return new Response('ok');
            }
        );

        return [$nextWasCalled, $response];
    }

    private function selection(): CompanySelectionService
    {
        return app(CompanySelectionService::class);
    }

    // ---------------------------------------------------------------
    // J) MUTLU YOL
    // ---------------------------------------------------------------

    public function test_a_valid_active_company_establishes_the_context(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        $this->selection()->select($user, $company);
        app(CompanyContext::class)->clear();

        [$nextWasCalled, $response] = $this->runMiddleware($user->fresh());

        $this->assertTrue($nextWasCalled, 'İstek devam etmeliydi.');
        $this->assertSame('ok', $response->getContent());
        $this->assertSame($company->id, app(CompanyContext::class)->id());
    }

    // ---------------------------------------------------------------
    // K) TENANT ISOLATION GERÇEKTEN DEVREDE Mİ?
    // ---------------------------------------------------------------

    public function test_queries_after_the_middleware_are_scoped_to_the_active_company(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $companyA = Company::factory()->withOwner($userA)->create();
        $companyB = Company::factory()->withOwner($userB)->create();

        $customerA = Customer::factory()->forCompany($companyA)->create();
        Customer::factory()->forCompany($companyB)->create();

        $this->selection()->select($userA, $companyA);
        app(CompanyContext::class)->clear();

        $this->runMiddleware($userA->fresh());

        $customers = Customer::all();

        $this->assertCount(1, $customers);
        $this->assertSame($customerA->id, $customers->first()->id);
    }

    // ---------------------------------------------------------------
    // G, H, I) FAIL CLOSED
    // ---------------------------------------------------------------

    public function test_a_user_without_an_active_company_cannot_pass(): void
    {
        $user = User::factory()->create();
        Company::factory()->withOwner($user)->create();
        Company::factory()->withMember($user)->create();

        $this->expectException(ActiveCompanyException::class);

        $this->runMiddleware($user);
    }

    public function test_the_request_does_not_continue_when_the_context_cannot_be_established(): void
    {
        $user = User::factory()->create();

        $nextWasCalled = false;

        try {
            $request = Request::create('/tenant-kaynagi', 'GET');
            $request->setUserResolver(fn () => $user);

            app(ResolveCompanyContext::class)->handle($request, function () use (&$nextWasCalled) {
                $nextWasCalled = true;

                return new Response('ok');
            });
        } catch (ActiveCompanyException) {
            // beklenen
        }

        $this->assertFalse($nextWasCalled, 'Context kurulamadığı hâlde istek devam etti.');
        $this->assertFalse(app(CompanyContext::class)->has());
    }

    public function test_a_revoked_membership_prevents_the_context_from_being_established(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        $this->selection()->select($user, $company);
        app(CompanyContext::class)->clear();

        // Kullanıcı şirketten çıkarılıyor; active_company_id ise hâlâ o şirketi
        // gösteriyor. Bayat bir aktif şirket erişim vermemelidir.
        $company->users()->detach($user->getKey());

        $this->expectException(ActiveCompanyException::class);

        $this->runMiddleware($user->fresh());
    }

    public function test_a_deleted_active_company_prevents_the_context_from_being_established(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        $this->selection()->select($user, $company);
        app(CompanyContext::class)->clear();

        $company->delete();

        $this->expectException(ActiveCompanyException::class);

        $this->runMiddleware($user->fresh());
    }

    public function test_an_unauthenticated_request_cannot_establish_a_context(): void
    {
        $this->expectException(ActiveCompanyException::class);

        $this->runMiddleware(null);
    }

    // ---------------------------------------------------------------
    // CONTEXT KİRLENMESİ
    // ---------------------------------------------------------------

    public function test_a_failed_resolution_leaves_no_context_behind(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        $this->selection()->select($user, $company);
        app(CompanyContext::class)->clear();

        $company->users()->detach($user->getKey());

        try {
            $this->runMiddleware($user->fresh());
        } catch (ActiveCompanyException) {
            // beklenen
        }

        $this->assertFalse(
            app(CompanyContext::class)->has(),
            'Başarısız çözümleme sonrası context kurulmuş kalmış.'
        );
    }
}
