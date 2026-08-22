<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Scopes\CompanyScope;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * AŞAMA 7 / Adım 2 — müşterinin fatura kimliği.
 *
 *   PATCH /api/v1/customers/{customer}/billing
 *
 * NEDEN MEVCUT PUT /customers/{customer} GENİŞLETİLMEDİ:
 * O uç bilinçli olarak TAM DEĞİŞTİRME semantiğindedir —
 * CustomerUpdateRequest docblock'u açıkça yazıyor: "gönderilmeyen
 * `phone` null olarak yazılır". Web ve Flutter istemcileri o uca YALNIZCA
 * {name, phone} gönderiyor ve kendi testleri bu gövdeyi birebir
 * çiviliyor. Fatura alanları aynı gövdeye eklenseydi, mevcut arayüzden
 * yapılan HER müşteri düzenlemesi vergi numarasını ve fatura adresini
 * SESSİZCE SİLERDİ.
 *
 * Depoda bu sorunun çözülmüş emsali var: rol değişimi
 * PUT /members/{user}'dan ayrılıp PATCH /members/{user}/role yapıldı.
 * Aynı desen, aynı gerekçe.
 *
 * YETKİ: mevcut CustomerPolicy kuralı. Fatura bilgisi müşteri kaydının
 * parçasıdır; müşteriyi düzenleyebilen onu da düzenleyebilir. Şirketin
 * mali kimliğinden farkı budur — o şirket yapılandırmasıdır ve
 * owner-only'dir.
 *
 * Başka tenant'ın müşterisi 404 döner, 403 değil: mevcut müşteri
 * uçlarındaki kararla aynı (CustomerTenantIsolationApiTest).
 */
class CustomerBillingApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Company $company;

    private Customer $customer;

    /** @var array<int, string> user id → plaintext token */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->company = Company::factory()->withOwner($this->user)->create();

        $this->customer = Customer::factory()
            ->forCompany($this->company)
            ->create(['name' => 'Zeynep Kaya', 'phone' => '05551112233']);

        app(CompanySelectionService::class)->select($this->user, $this->company);
        app(CompanyContext::class)->clear();
    }

    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    private function uri(?Customer $customer = null): string
    {
        return '/api/v1/customers/'.($customer ?? $this->customer)->getKey().'/billing';
    }

    /**
     * @return array<string, mixed>
     */
    private function fullPayload(): array
    {
        return [
            'billing_email' => 'fatura@zeynepkaya.test',
            'tax_number' => '11111111111',
            'tax_office' => 'Şişli',
            'billing_address' => 'Mecidiyeköy Mah. No:5 Şişli/İstanbul',
            'country' => 'TR',
        ];
    }

    // =================================================================
    // GÜNCELLEME
    // =================================================================

    public function test_the_billing_identity_can_be_set(): void
    {
        $this->apiAs($this->user)
            ->patchJson($this->uri(), $this->fullPayload())
            ->assertOk();

        $customer = $this->customer->fresh();

        $this->assertSame('fatura@zeynepkaya.test', $customer->billing_email);
        $this->assertSame('11111111111', $customer->tax_number);
        $this->assertSame('Şişli', $customer->tax_office);
        $this->assertSame('TR', $customer->country);
    }

    public function test_the_response_returns_the_updated_billing_identity(): void
    {
        $payload = $this->apiAs($this->user)
            ->patchJson($this->uri(), $this->fullPayload())
            ->assertOk()
            ->json('data');

        $this->assertSame('fatura@zeynepkaya.test', $payload['billing_email']);
        $this->assertSame('11111111111', $payload['tax_number']);
    }

    public function test_the_response_exposes_only_whitelisted_fields(): void
    {
        $payload = $this->apiAs($this->user)
            ->patchJson($this->uri(), $this->fullPayload())
            ->assertOk()
            ->json('data');

        $keys = array_keys($payload);
        sort($keys);

        $this->assertSame(
            [
                'billing_address',
                'billing_email',
                'country',
                'customer_no',
                'id',
                'name',
                'tax_number',
                'tax_office',
            ],
            $keys,
            'CustomerBillingResource beklenmeyen bir alan döndürüyor.'
        );
    }

    public function test_an_omitted_field_is_left_untouched(): void
    {
        $this->apiAs($this->user)->patchJson($this->uri(), $this->fullPayload())->assertOk();

        $this->apiAs($this->user)
            ->patchJson($this->uri(), ['tax_office' => 'Beşiktaş'])
            ->assertOk();

        $customer = $this->customer->fresh();

        $this->assertSame('Beşiktaş', $customer->tax_office);
        $this->assertSame('11111111111', $customer->tax_number, 'Gönderilmeyen alan silindi.');
    }

    public function test_an_explicit_null_clears_the_field(): void
    {
        $this->apiAs($this->user)->patchJson($this->uri(), $this->fullPayload())->assertOk();

        $this->apiAs($this->user)
            ->patchJson($this->uri(), ['tax_number' => null])
            ->assertOk();

        $this->assertNull($this->customer->fresh()->tax_number);
    }

    public function test_an_empty_string_is_normalised_to_null(): void
    {
        $this->apiAs($this->user)->patchJson($this->uri(), $this->fullPayload())->assertOk();

        $this->apiAs($this->user)
            ->patchJson($this->uri(), ['tax_office' => '  '])
            ->assertOk();

        $this->assertNull($this->customer->fresh()->tax_office);
    }

    // =================================================================
    // DOĞRULAMA
    // =================================================================

    public function test_an_invalid_billing_email_is_rejected(): void
    {
        $this->apiAs($this->user)
            ->patchJson($this->uri(), ['billing_email' => 'gecersiz'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('billing_email');
    }

    /**
     * REGRESYON: bu uçtan ad ya da telefon değiştirilemez.
     *
     * İkisi de mali kimlik değildir ve bu ucun gövdesinde tanınmaz —
     * tıpkı rol ucunun {name, email} tanımaması gibi.
     */
    public function test_the_name_and_phone_cannot_be_changed_through_this_endpoint(): void
    {
        $this->apiAs($this->user)
            ->patchJson($this->uri(), ['name' => 'Başka Ad', 'phone' => '05559998877'])
            ->assertOk();

        $customer = $this->customer->fresh();

        $this->assertSame('Zeynep Kaya', $customer->name);
        $this->assertSame('05551112233', $customer->phone);
    }

    // =================================================================
    // TENANT İZOLASYONU
    // =================================================================

    /**
     * Başka şirketin müşterisi 404 döner.
     *
     * 403 dönmek o id'de bir müşterinin VAR OLDUĞUNU doğrular ve id
     * taramasıyla başka tenant'ın müşteri sayısı öğrenilebilirdi.
     * Mevcut müşteri uçlarındaki kararla aynı.
     */
    public function test_another_tenants_customer_returns_not_found(): void
    {
        $otherCompany = Company::factory()->create();
        $otherCustomer = Customer::factory()->forCompany($otherCompany)->create();

        $this->apiAs($this->user)
            ->patchJson($this->uri($otherCustomer), ['tax_number' => '9999999999'])
            ->assertNotFound();

        $this->assertNull($otherCustomer->fresh()->tax_number);
    }

    public function test_it_requires_an_active_company(): void
    {
        $stranger = User::factory()->create();

        $this->apiAs($stranger)
            ->patchJson($this->uri(), ['tax_number' => '9999999999'])
            ->assertForbidden();
    }

    public function test_it_requires_authentication(): void
    {
        $this->patchJson($this->uri(), ['tax_number' => '1234567890'])
            ->assertUnauthorized();
    }

    // =================================================================
    // AUDIT
    // =================================================================

    public function test_a_billing_change_is_audited(): void
    {
        $this->apiAs($this->user)
            ->patchJson($this->uri(), ['tax_number' => '11111111111'])
            ->assertOk();

        $log = AuditLog::withoutGlobalScope(CompanyScope::class)
            ->where('action', AuditAction::CustomerBillingUpdated->value)
            ->latest('id')
            ->first();

        $this->assertNotNull($log, 'customer.billing_updated kaydı bulunamadı.');
        $this->assertSame($this->company->getKey(), (int) $log->company_id);
        $this->assertSame($this->customer->getKey(), (int) $log->auditable_id);
    }

    /**
     * REGRESYON: audit'e düz metin e-posta YAZILMAZ.
     *
     * AuditLogService `email` anahtarını tek yönlü özete çevirir; fatura
     * e-postası da bir kişisel veridir ve audit tablosu tasarım gereği
     * kalıcıdır. Anahtar adı bu yüzden hash'lenecek biçimde seçilmelidir.
     */
    public function test_the_audit_entry_does_not_store_the_plaintext_billing_email(): void
    {
        $this->apiAs($this->user)
            ->patchJson($this->uri(), ['billing_email' => 'fatura@zeynepkaya.test'])
            ->assertOk();

        $rows = AuditLog::withoutGlobalScope(CompanyScope::class)
            ->where('action', AuditAction::CustomerBillingUpdated->value)
            ->get();

        foreach ($rows as $row) {
            $this->assertStringNotContainsString(
                'fatura@zeynepkaya.test',
                json_encode([$row->old_values, $row->new_values, $row->metadata], JSON_UNESCAPED_UNICODE)
            );
        }
    }

    // =================================================================
    // MEVCUT SÖZLEŞME KORUNUYOR — EN KRİTİK BÖLÜM
    // =================================================================

    /**
     * EN KRİTİK REGRESYON: mevcut PUT ucu fatura alanlarını SİLMEZ.
     *
     * PUT /customers/{customer} tam değiştirme semantiğindedir ve mevcut
     * istemciler ona yalnızca {name, phone} gönderir. Fatura alanları o
     * gövdenin parçası OLMADIĞI için, oradan yapılan bir güncelleme mali
     * kimliğe dokunmamalıdır. Bu test, ayrı uç kararının asıl gerekçesini
     * kanıtlar.
     */
    public function test_the_existing_update_endpoint_does_not_wipe_the_billing_identity(): void
    {
        $this->apiAs($this->user)->patchJson($this->uri(), $this->fullPayload())->assertOk();

        $this->apiAs($this->user)
            ->putJson('/api/v1/customers/'.$this->customer->getKey(), [
                'name' => 'Zeynep Kaya-Demir',
                'phone' => '05559998877',
            ])
            ->assertOk();

        $customer = $this->customer->fresh();

        $this->assertSame('Zeynep Kaya-Demir', $customer->name);
        $this->assertSame('05559998877', $customer->phone);

        $this->assertSame('11111111111', $customer->tax_number, 'PUT fatura kimliğini sildi.');
        $this->assertSame('Şişli', $customer->tax_office);
        $this->assertSame('fatura@zeynepkaya.test', $customer->billing_email);
    }

    /**
     * REGRESYON: CustomerResource whitelist'i DEĞİŞMEDİ.
     *
     * Fatura alanları liste/detay yanıtına eklenmedi; ayrı bir resource
     * kullanılıyor. Bu sayede mevcut web ve Flutter istemcileri ile
     * CustomerApiTest'teki çivili iddia bozulmuyor.
     */
    public function test_the_customer_resource_contract_is_unchanged(): void
    {
        $this->apiAs($this->user)->patchJson($this->uri(), $this->fullPayload())->assertOk();

        $payload = $this->apiAs($this->user)
            ->getJson('/api/v1/customers/'.$this->customer->getKey())
            ->assertOk()
            ->json('data');

        $keys = array_keys($payload);
        sort($keys);

        $this->assertSame(
            ['created_at', 'customer_no', 'id', 'name', 'phone', 'updated_at'],
            $keys,
            'CustomerResource fatura alanlarıyla kirlendi.'
        );
    }

    /**
     * REGRESYON: müşteri oluşturma ve listeleme davranışı bozulmadı.
     */
    public function test_customer_create_and_list_still_behave_as_before(): void
    {
        $created = $this->apiAs($this->user)
            ->postJson('/api/v1/customers', ['name' => 'Yeni Müşteri', 'phone' => null])
            ->assertCreated()
            ->json('data');

        $this->assertSame('Yeni Müşteri', $created['name']);
        $this->assertNull($created['phone']);
        $this->assertArrayNotHasKey('tax_number', $created);

        $this->apiAs($this->user)
            ->getJson('/api/v1/customers')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }
}
