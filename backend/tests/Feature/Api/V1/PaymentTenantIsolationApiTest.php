<?php

namespace Tests\Feature\Api\V1;

use App\Models\Company;
use App\Models\Payment;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * AŞAMA 7 / Adım 4 — ödemelerin izolasyon ve yetki kanıtı.
 *
 * CRUD davranışı ayrı dosyada (PaymentApiTest). Burada ölçülen şey
 * işlevsellik değil GÜVENLİKTİR ve bir güvenlik kanıtının CRUD testleri
 * arasında kaybolmaması gerekir.
 *
 *                      A'nın ödemesi   B'nin ödemesi
 *   A kullanıcısı           ✅              ❌
 *   B kullanıcısı           ❌              ✅
 *
 * REDDİN ŞEKLİ: başka tenant'ın kaydı için 404, member için 403.
 * Fark önemli — 404 varlığı gizler (kullanıcı o şirkette değil), 403 ise
 * yalnızca yetki eksikliğini söyler (kullanıcı şirkette, kayıt var).
 *
 * YETKİ: OWNER-ONLY, FinanceEntry ile aynı sınıf.
 */
class PaymentTenantIsolationApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/payments';

    private User $ownerA;

    private User $ownerB;

    private User $memberA;

    private Company $companyA;

    private Company $companyB;

    private Payment $paymentA;

    private Payment $paymentB;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->ownerA = User::factory()->create();
        $this->ownerB = User::factory()->create();
        $this->memberA = User::factory()->create();

        $this->companyA = Company::factory()->withOwner($this->ownerA)->create(['name' => 'Sirket A']);
        $this->companyB = Company::factory()->withOwner($this->ownerB)->create(['name' => 'Sirket B']);

        $this->companyA->users()->attach($this->memberA, ['role' => 'member']);

        // Fixture'lar context YOKKEN kuruluyor.
        $this->paymentA = Payment::factory()->forCompany($this->companyA)->create();
        $this->paymentB = Payment::factory()->forCompany($this->companyB)->create();

        $this->giveActiveCompany($this->ownerA, $this->companyA);
        $this->giveActiveCompany($this->ownerB, $this->companyB);
        $this->giveActiveCompany($this->memberA, $this->companyA);
    }

    private function giveActiveCompany(User $user, Company $company): void
    {
        app(CompanySelectionService::class)->select($user, $company);
        app(CompanyContext::class)->clear();
    }

    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    private function uriFor(Payment $payment): string
    {
        return self::URI.'/'.$payment->getKey();
    }

    private function rawPayment(int $id): ?Payment
    {
        return Payment::withoutTenantScope('izolasyon testi doğrulaması')->find($id);
    }

    /**
     * @return array<string, mixed>
     */
    private function minimalPayload(): array
    {
        return [
            'financial_date' => '2026-08-22',
            'amount_minor' => 1000,
            'currency' => 'TRY',
            'method' => 'bank',
        ];
    }

    // =================================================================
    // İZOLASYON
    // =================================================================

    public function test_a_company_sees_only_its_own_payments(): void
    {
        $ids = $this->apiAs($this->ownerA)->getJson(self::URI)->assertOk()->json('data.*.id');

        $this->assertSame([$this->paymentA->getKey()], $ids);
    }

    public function test_the_other_company_sees_only_its_own_payments(): void
    {
        $ids = $this->apiAs($this->ownerB)->getJson(self::URI)->assertOk()->json('data.*.id');

        $this->assertSame([$this->paymentB->getKey()], $ids);
    }

    public function test_another_tenants_payment_cannot_be_read(): void
    {
        $this->apiAs($this->ownerA)->getJson($this->uriFor($this->paymentB))->assertNotFound();
    }

    public function test_another_tenants_payment_cannot_be_updated(): void
    {
        $this->apiAs($this->ownerA)
            ->putJson($this->uriFor($this->paymentB), $this->minimalPayload())
            ->assertNotFound();

        $this->assertNotSame(1000, $this->rawPayment($this->paymentB->getKey())->amount_minor);
    }

    public function test_another_tenants_payment_cannot_be_voided(): void
    {
        $this->apiAs($this->ownerA)
            ->postJson($this->uriFor($this->paymentB).'/void', [])
            ->assertNotFound();

        $this->assertNull($this->rawPayment($this->paymentB->getKey())->voided_at);
    }

    /**
     * REGRESYON: reddin şekli 404'tür, 403 değil — varlık gizlenir.
     */
    public function test_the_cross_tenant_rejection_hides_existence(): void
    {
        $this->apiAs($this->ownerA)
            ->getJson($this->uriFor($this->paymentB))
            ->assertNotFound()
            ->assertJsonMissingPath('data');
    }

    // =================================================================
    // YETKİ — OWNER ONLY
    // =================================================================

    public function test_a_member_cannot_list_payments(): void
    {
        $this->apiAs($this->memberA)->getJson(self::URI)->assertForbidden();
    }

    public function test_a_member_cannot_read_a_payment(): void
    {
        $this->apiAs($this->memberA)->getJson($this->uriFor($this->paymentA))->assertForbidden();
    }

    public function test_a_member_cannot_create_a_payment(): void
    {
        $this->apiAs($this->memberA)
            ->postJson(self::URI, $this->minimalPayload())
            ->assertForbidden();

        $this->assertSame(1, Payment::withoutTenantScope('doğrulama')
            ->where('company_id', $this->companyA->getKey())->count());
    }

    public function test_a_member_cannot_update_a_payment(): void
    {
        $this->apiAs($this->memberA)
            ->putJson($this->uriFor($this->paymentA), $this->minimalPayload())
            ->assertForbidden();
    }

    public function test_a_member_cannot_void_a_payment(): void
    {
        $this->apiAs($this->memberA)
            ->postJson($this->uriFor($this->paymentA).'/void', [])
            ->assertForbidden();

        $this->assertNull($this->rawPayment($this->paymentA->getKey())->voided_at);
    }

    /**
     * REGRESYON: member'a boş liste değil 403 döner.
     *
     * Boş liste "kayıt yok" derdi; doğru cevap "yetkin yok".
     */
    public function test_a_member_gets_forbidden_not_an_empty_list(): void
    {
        $response = $this->apiAs($this->memberA)->getJson(self::URI)->assertForbidden();

        $this->assertNull($response->json('data'));
    }

    // =================================================================
    // KİMLİK VE BAĞLAM
    // =================================================================

    public function test_it_requires_authentication(): void
    {
        $this->getJson(self::URI)->assertUnauthorized();
        $this->postJson(self::URI, [])->assertUnauthorized();
    }

    public function test_it_requires_an_active_company(): void
    {
        $stranger = User::factory()->create();

        $this->apiAs($stranger)->getJson(self::URI)->assertForbidden();
    }

    public function test_switching_the_active_company_switches_the_visible_payments(): void
    {
        $this->companyB->users()->attach($this->ownerA, ['role' => 'owner']);

        $ids = $this->apiAs($this->ownerA)->getJson(self::URI)->assertOk()->json('data.*.id');
        $this->assertSame([$this->paymentA->getKey()], $ids);

        $this->apiAs($this->ownerA)
            ->postJson('/api/v1/companies/'.$this->companyB->getKey().'/select')
            ->assertOk();

        $ids = $this->apiAs($this->ownerA)->getJson(self::URI)->assertOk()->json('data.*.id');
        $this->assertSame([$this->paymentB->getKey()], $ids);
    }
}
