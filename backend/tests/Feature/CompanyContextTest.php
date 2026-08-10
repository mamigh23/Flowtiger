<?php

namespace Tests\Feature;

use App\Exceptions\CrossTenantAccessException;
use App\Exceptions\TenantContextMissingException;
use App\Models\Company;
use App\Models\User;
use App\Services\CompanyContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * CompanyContext, tenant isolation'ın dayandığı tek değerdir.
 * Bu yüzden içine yalnızca DOĞRULANMIŞ bir şirket girebilir (Anayasa §5, §21).
 */
class CompanyContextTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_enter_a_company_they_belong_to(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        $context = app(CompanyContext::class);
        $context->setForUser($user, $company);

        $this->assertTrue($context->has());
        $this->assertSame($company->id, $context->id());
    }

    public function test_a_user_cannot_enter_a_company_they_do_not_belong_to(): void
    {
        $user = User::factory()->create();
        $foreignCompany = Company::factory()->create();

        $this->expectException(CrossTenantAccessException::class);

        app(CompanyContext::class)->setForUser($user, $foreignCompany);
    }

    public function test_context_stays_empty_after_a_rejected_assignment(): void
    {
        $user = User::factory()->create();
        $foreignCompany = Company::factory()->create();
        $context = app(CompanyContext::class);

        try {
            $context->setForUser($user, $foreignCompany);
        } catch (CrossTenantAccessException) {
            // beklenen
        }

        $this->assertFalse($context->has(), 'Reddedilen atama sonrası context kirlenmemeliydi.');
        $this->assertNull($context->id());
    }

    public function test_id_or_fail_throws_when_no_company_is_active(): void
    {
        $this->expectException(TenantContextMissingException::class);

        app(CompanyContext::class)->idOrFail();
    }

    public function test_clear_removes_the_active_company(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();
        $context = app(CompanyContext::class);

        $context->setForUser($user, $company);
        $context->clear();

        $this->assertFalse($context->has());
    }

    /**
     * Container binding'i singleton DEĞİL scoped olmalı. Singleton, uzun ömürlü
     * süreçlerde (queue worker / Octane) context'in istekler arasında sızmasına
     * yol açar — bu, testlerde görünmeyen türden bir tenant sızıntısıdır.
     *
     * Yapıyı değil davranışı doğruluyoruz: Laravel her istek/job sonunda
     * forgetScopedInstances() çağırır; context bunu atlatmamalı.
     */
    public function test_scoped_instance_is_reset_when_scoped_instances_are_flushed(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        app(CompanyContext::class)->setForUser($user, $company);
        $this->assertTrue(app(CompanyContext::class)->has());

        // Laravel'in her istek/job sonunda yaptığı temizlik.
        $this->app->forgetScopedInstances();

        $this->assertFalse(
            app(CompanyContext::class)->has(),
            'Scoped instance sıfırlandıktan sonra context taşınmamalıydı.'
        );
    }
}
