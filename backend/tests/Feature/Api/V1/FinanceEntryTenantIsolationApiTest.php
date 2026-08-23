<?php

namespace Tests\Feature\Api\V1;

use App\Models\Company;
use App\Models\Customer;
use App\Models\FinanceEntry;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * AŞAMA 7 / Adım 3 — finans kaydının izolasyon ve yetki kanıtı.
 *
 * CRUD davranışı ayrı dosyada (FinanceEntryApiTest). Burada ölçülen şey
 * işlevsellik değil GÜVENLİKTİR ve bir güvenlik kanıtının CRUD testleri
 * arasında kaybolmaması gerekir — CustomerTenantIsolationApiTest ile aynı
 * ayrım.
 *
 *                      A'nın kaydı    B'nin kaydı
 *   A kullanıcısı          ✅              ❌
 *   B kullanıcısı          ❌              ✅
 *
 * REDDİN ŞEKLİ: başka tenant'ın kaydı için 403 değil 404. 403, "böyle bir
 * kayıt var ama senin değil" bilgisini verirdi ve id taramasıyla rakip
 * şirketin kaç kaydı olduğu çıkarılabilirdi.
 *
 * YETKİ: OWNER-ONLY. Finance Foundation kararı gereği finans kayıtları
 * şirketin mali görünümüdür ve audit ile aynı sınıfa girer. Soru
 * Role'ün yetenek metoduna sorulur, `$role === Role::Owner` diye
 * dağıtılmaz (AuditLogPolicy deseni).
 *
 * MEMBER İÇİN 403 DOĞRUDUR, 404 DEĞİL: kayıt vardır ve kullanıcı da
 * şirketin üyesidir; eksik olan yalnızca yetkidir. Burada varlık
 * gizlemenin bir anlamı yok — kullanıcı zaten şirkette.
 */
class FinanceEntryTenantIsolationApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/finance-entries';

    private User $ownerA;

    private User $ownerB;

    private User $memberA;

    private Company $companyA;

    private Company $companyB;

    private FinanceEntry $entryA;

    private FinanceEntry $entryB;

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

        // Fixture'lar context YOKKEN kuruluyor: test, ölçtüğü mekanizmayı
        // kurarken kullanmamalı.
        $this->entryA = FinanceEntry::factory()->forCompany($this->companyA)->create();
        $this->entryB = FinanceEntry::factory()->forCompany($this->companyB)->create();

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

    private function uriFor(FinanceEntry $entry): string
    {
        return self::URI.'/'.$entry->getKey();
    }

    /** Scope'suz okuma — test kendi ölçtüğü filtreye güvenmemeli. */
    private function rawEntry(int $id): ?FinanceEntry
    {
        return FinanceEntry::withoutTenantScope('izolasyon testi doğrulaması')->find($id);
    }

    // =================================================================
    // LİSTELEME
    // =================================================================

    public function test_a_company_sees_only_its_own_entries(): void
    {
        $ids = $this->apiAs($this->ownerA)->getJson(self::URI)->assertOk()->json('data.*.id');

        $this->assertSame([$this->entryA->getKey()], $ids);
    }

    public function test_the_other_company_sees_only_its_own_entries(): void
    {
        $ids = $this->apiAs($this->ownerB)->getJson(self::URI)->assertOk()->json('data.*.id');

        $this->assertSame([$this->entryB->getKey()], $ids);
    }

    // =================================================================
    // TEKİL ERİŞİM
    // =================================================================

    public function test_another_tenants_entry_cannot_be_read(): void
    {
        $this->apiAs($this->ownerA)
            ->getJson($this->uriFor($this->entryB))
            ->assertNotFound();
    }

    public function test_another_tenants_entry_cannot_be_updated(): void
    {
        $this->apiAs($this->ownerA)
            ->putJson($this->uriFor($this->entryB), [
                'direction' => 'in',
                'financial_date' => '2026-08-22',
                'amount_basis' => 'net',
                'amount_minor' => 1,
                'vat_rate_bp' => null,
                'currency' => 'TRY',
            ])
            ->assertNotFound();

        $this->assertNotSame('in', $this->rawEntry($this->entryB->getKey())->direction->value);
    }

    public function test_another_tenants_entry_cannot_be_voided(): void
    {
        $this->apiAs($this->ownerA)
            ->postJson($this->uriFor($this->entryB).'/void', [])
            ->assertNotFound();

        $this->assertNull($this->rawEntry($this->entryB->getKey())->voided_at);
    }

    /**
     * REGRESYON: reddin şekli 404'tür, 403 değil.
     *
     * 403 dönmek o id'de bir kaydın VAR OLDUĞUNU doğrulardı.
     */
    public function test_the_rejection_hides_existence(): void
    {
        $this->apiAs($this->ownerA)
            ->getJson($this->uriFor($this->entryB))
            ->assertNotFound()
            ->assertJsonMissingPath('data');
    }

    // =================================================================
    // MÜŞTERİ BAĞLANTISI DA SINIRI AŞAMAZ
    // =================================================================

    /**
     * Başka tenant'ın müşterisi bir kayda bağlanamaz.
     *
     * Bağlanabilseydi, A şirketi B'nin müşteri id'lerini deneyerek hangi
     * id'lerin var olduğunu öğrenebilirdi — üstelik kendi kaydı üzerinden.
     */
    public function test_an_entry_cannot_reference_another_tenants_customer(): void
    {
        $customerB = Customer::factory()->forCompany($this->companyB)->create();

        $this->apiAs($this->ownerA)
            ->postJson(self::URI, [
                'direction' => 'in',
                'financial_date' => '2026-08-22',
                'amount_basis' => 'net',
                'amount_minor' => 100000,
                'vat_rate_bp' => 2000,
                'currency' => 'TRY',
                'customer_id' => $customerB->getKey(),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_id');
    }

    // =================================================================
    // YETKİ — OWNER ONLY
    // =================================================================

    public function test_a_member_cannot_list_entries(): void
    {
        $this->apiAs($this->memberA)->getJson(self::URI)->assertForbidden();
    }

    public function test_a_member_cannot_read_an_entry(): void
    {
        $this->apiAs($this->memberA)->getJson($this->uriFor($this->entryA))->assertForbidden();
    }

    public function test_a_member_cannot_create_an_entry(): void
    {
        $this->apiAs($this->memberA)
            ->postJson(self::URI, [
                'direction' => 'in',
                'financial_date' => '2026-08-22',
                'amount_basis' => 'net',
                'amount_minor' => 100000,
                'vat_rate_bp' => 2000,
                'currency' => 'TRY',
            ])
            ->assertForbidden();

        $this->assertSame(1, FinanceEntry::withoutTenantScope('doğrulama')
            ->where('company_id', $this->companyA->getKey())->count());
    }

    public function test_a_member_cannot_update_an_entry(): void
    {
        $this->apiAs($this->memberA)
            ->putJson($this->uriFor($this->entryA), [
                'direction' => 'in',
                'financial_date' => '2026-08-22',
                'amount_basis' => 'net',
                'amount_minor' => 1,
                'vat_rate_bp' => null,
                'currency' => 'TRY',
            ])
            ->assertForbidden();
    }

    public function test_a_member_cannot_void_an_entry(): void
    {
        $this->apiAs($this->memberA)
            ->postJson($this->uriFor($this->entryA).'/void', [])
            ->assertForbidden();

        $this->assertNull($this->rawEntry($this->entryA->getKey())->voided_at);
    }

    /**
     * REGRESYON: rol kararı İSTEMCİDE değil backend'de verilir ve
     * member'ın isteği gerçekten yapılır — sonra reddedilir. Bu test,
     * ucun member için sessizce boş liste döndürmediğini de sabitler:
     * boş liste "kayıt yok" derdi, oysa doğru cevap "yetkin yok".
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

    /**
     * Aktif şirketi olmayan kullanıcı geçemez.
     *
     * company.context middleware'i fail-closed'dur: context kurulamazsa
     * istek hiç controller'a ulaşmaz.
     */
    public function test_it_requires_an_active_company(): void
    {
        $stranger = User::factory()->create();

        $this->apiAs($stranger)->getJson(self::URI)->assertForbidden();
    }

    /**
     * Şirket değişince görünen kayıtlar da değişir.
     *
     * Aynı kullanıcı iki şirketin üyesiyse, aktif şirket neyse onun
     * kayıtlarını görür — üyeliklerin birleşimini değil.
     */
    public function test_switching_the_active_company_switches_the_visible_entries(): void
    {
        $this->companyB->users()->attach($this->ownerA, ['role' => 'owner']);

        $ids = $this->apiAs($this->ownerA)->getJson(self::URI)->assertOk()->json('data.*.id');
        $this->assertSame([$this->entryA->getKey()], $ids);

        $this->apiAs($this->ownerA)
            ->postJson('/api/v1/companies/'.$this->companyB->getKey().'/select')
            ->assertOk();

        $ids = $this->apiAs($this->ownerA)->getJson(self::URI)->assertOk()->json('data.*.id');
        $this->assertSame([$this->entryB->getKey()], $ids);
    }
}
