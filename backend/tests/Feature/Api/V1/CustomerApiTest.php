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
 * Faz 3 — Customer CRUD ucunun davranış kanıtı.
 *
 * Bu dosya "uç doğru çalışıyor mu?" sorusuna bakar: CRUD, validation,
 * pagination, yetki ve mass assignment koruması. Tenant izolasyonu ayrı
 * bir dosyada, kendi başına ele alınır (CustomerTenantIsolationApiTest) —
 * çünkü orada ölçülen şey işlevsellik değil GÜVENLİKTİR ve bir güvenlik
 * kanıtının CRUD testlerinin arasında kaybolmaması gerekir.
 */
class CustomerApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/customers';

    /** setUp'ta oluşturulan müşteri sayısı. */
    private const SEEDED = 3;

    private User $user;

    /**
     * P0-04 — Member Permission Hardening: Customer DELETE artık Owner'a
     * özel. Diğer tüm testler `$this->user` (owner) üzerinden çalışmaya
     * devam ediyor; bu alan yalnızca DELETE'in yetki tarafını ölçmek için
     * eklendi.
     */
    private User $member;

    private Company $company;

    /** @var array<int, string> user id → plaintext token */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->member = User::factory()->create();
        $this->company = Company::factory()->withOwner($this->user)->create();
        $this->company->users()->attach($this->member, ['role' => 'member']);

        // Fixture'lar company context YOKKEN kuruluyor: test, ölçtüğü
        // mekanizmayı kurarken kullanmamalı (Faz 1'deki yaklaşım).
        Customer::factory()->forCompany($this->company)->create(['name' => 'Ayse']);
        Customer::factory()->forCompany($this->company)->create(['name' => 'Burak']);
        Customer::factory()->forCompany($this->company)->create(['name' => 'Cem']);

        $this->giveActiveCompany($this->user, $this->company);
        $this->giveActiveCompany($this->member, $this->company);
    }

    /**
     * Aktif şirketi veritabanına yazar, testin kendi context'ini temizler.
     */
    private function giveActiveCompany(User $user, Company $company): void
    {
        app(CompanySelectionService::class)->select($user, $company);
        app(CompanyContext::class)->clear();
    }

    /**
     * Kimliği doğrulanmış istek.
     *
     * Auth::forgetGuards() ZORUNLUDUR: RequestGuard çözdüğü kullanıcıyı
     * önbelleğe alır ve feature testlerinde tüm istekler tek container
     * üzerinde koşar. Unutulursa ikinci istek, birincinin kullanıcısını
     * (ve onun BAYAT active_company_id'sini) devralır.
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

    /**
     * Scope'suz okuma — testin kendisi tenant filtresine güvenmemeli.
     */
    private function rawCustomer(int $id): ?Customer
    {
        return Customer::withoutTenantScope('test doğrulaması')->find($id);
    }

    private function firstSeededCustomer(): Customer
    {
        return Customer::withoutTenantScope('test fixture')
            ->where('company_id', $this->company->getKey())
            ->orderBy('customer_no')
            ->firstOrFail();
    }

    // ===============================================================
    // INDEX
    // ===============================================================

    public function test_index_returns_the_customers_of_the_active_company(): void
    {
        $this->apiAs($this->user)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(self::SEEDED, 'data')
            ->assertJsonStructure([
                'data' => [['id', 'customer_no', 'name', 'phone', 'created_at', 'updated_at']],
                'links',
                'meta',
            ]);
    }

    public function test_index_is_ordered_by_customer_no(): void
    {
        $response = $this->apiAs($this->user)->getJson(self::URI)->assertOk();

        $numbers = collect($response->json('data'))->pluck('customer_no')->all();

        $sorted = $numbers;
        sort($sorted);

        $this->assertSame($sorted, $numbers, 'Müşteriler customer_no sırasında dönmeliydi.');
    }

    public function test_index_uses_a_default_page_size_of_fifteen(): void
    {
        // create() DEĞİL createMany(): create(), count(N) ile kullanıldığında
        // N modelin TAMAMINI önce bellekte üretir, sonra kaydeder. Bu sırada
        // CustomerFactory'nin customer_no hesabı N kez aynı max() değerini
        // görür ve (company_id, customer_no) UNIQUE kısıtı patlar.
        // createMany() ise her kaydı tek tek create() eder.
        Customer::factory()->count(17)->forCompany($this->company)->createMany();

        $this->apiAs($this->user)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(15, 'data')
            ->assertJsonPath('meta.per_page', 15)
            ->assertJsonPath('meta.total', self::SEEDED + 17)
            ->assertJsonPath('meta.current_page', 1);
    }

    public function test_index_honours_the_per_page_parameter(): void
    {
        $this->apiAs($this->user)
            ->getJson(self::URI.'?per_page=2')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.per_page', 2)
            ->assertJsonPath('meta.total', self::SEEDED);
    }

    public function test_index_returns_the_requested_page(): void
    {
        $this->apiAs($this->user)
            ->getJson(self::URI.'?per_page=2&page=2')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.current_page', 2);
    }

    /**
     * Üst sınır olmasaydı tek istek tüm tenant'ı belleğe çekebilirdi.
     */
    public function test_index_rejects_a_per_page_above_the_maximum(): void
    {
        $this->apiAs($this->user)
            ->getJson(self::URI.'?per_page=1000')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['per_page']);
    }

    public function test_index_rejects_a_non_integer_per_page(): void
    {
        $this->apiAs($this->user)
            ->getJson(self::URI.'?per_page=hepsi')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['per_page']);
    }

    public function test_index_returns_an_empty_page_when_the_company_has_no_customers(): void
    {
        $emptyUser = User::factory()->create();
        $emptyCompany = Company::factory()->withOwner($emptyUser)->create();
        $this->giveActiveCompany($emptyUser, $emptyCompany);

        $this->apiAs($emptyUser)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.total', 0);
    }

    public function test_index_requires_authentication(): void
    {
        $this->getJson(self::URI)->assertUnauthorized();
    }

    public function test_index_requires_an_active_company(): void
    {
        $userWithoutCompany = User::factory()->create();

        $this->apiAs($userWithoutCompany)
            ->getJson(self::URI)
            ->assertForbidden();
    }

    // ===============================================================
    // STORE
    // ===============================================================

    public function test_store_creates_a_customer_and_returns_201(): void
    {
        $this->apiAs($this->user)
            ->postJson(self::URI, ['name' => 'Yeni Musteri', 'phone' => '05551112233'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Yeni Musteri')
            ->assertJsonPath('data.phone', '05551112233');

        $this->assertDatabaseHas('customers', [
            'name' => 'Yeni Musteri',
            'company_id' => $this->company->getKey(),
        ]);
    }

    public function test_store_writes_the_customer_into_the_active_company(): void
    {
        $id = $this->apiAs($this->user)
            ->postJson(self::URI, ['name' => 'Sirket Testi'])
            ->assertCreated()
            ->json('data.id');

        $this->assertSame(
            $this->company->getKey(),
            (int) $this->rawCustomer($id)->company_id,
            'Müşteri aktif şirkete yazılmalıydı.'
        );
    }

    /**
     * customer_no şirket içinde artar ve sistem tarafından üretilir (§7).
     */
    public function test_store_generates_the_next_customer_no(): void
    {
        $first = $this->apiAs($this->user)
            ->postJson(self::URI, ['name' => 'Birinci'])
            ->assertCreated()
            ->json('data.customer_no');

        $second = $this->apiAs($this->user)
            ->postJson(self::URI, ['name' => 'Ikinci'])
            ->assertCreated()
            ->json('data.customer_no');

        $this->assertSame(self::SEEDED + 1, $first);
        $this->assertSame($first + 1, $second);
    }

    /**
     * Tenant sahipliği istek gövdesinden belirlenemez (§9).
     */
    public function test_store_ignores_a_company_id_in_the_payload(): void
    {
        $foreignCompany = Company::factory()->withOwner(User::factory()->create())->create();

        $id = $this->apiAs($this->user)
            ->postJson(self::URI, [
                'name' => 'Kacak',
                'company_id' => $foreignCompany->getKey(),
            ])
            ->assertCreated()
            ->json('data.id');

        $this->assertSame(
            $this->company->getKey(),
            (int) $this->rawCustomer($id)->company_id,
            'company_id istek gövdesinden ezilebiliyor — tenant sahipliği kırılmış.'
        );
    }

    public function test_store_ignores_a_customer_no_in_the_payload(): void
    {
        $customerNo = $this->apiAs($this->user)
            ->postJson(self::URI, ['name' => 'Numara Testi', 'customer_no' => 9999])
            ->assertCreated()
            ->json('data.customer_no');

        $this->assertSame(
            self::SEEDED + 1,
            $customerNo,
            'customer_no istemci tarafından belirlenebiliyor.'
        );
    }

    public function test_store_requires_a_name(): void
    {
        $this->apiAs($this->user)
            ->postJson(self::URI, ['phone' => '05551112233'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_rejects_a_name_longer_than_the_column(): void
    {
        $this->apiAs($this->user)
            ->postJson(self::URI, ['name' => str_repeat('a', 256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_rejects_a_too_long_phone(): void
    {
        $this->apiAs($this->user)
            ->postJson(self::URI, ['name' => 'Telefon', 'phone' => str_repeat('5', 33)])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_store_accepts_a_customer_without_a_phone(): void
    {
        $this->apiAs($this->user)
            ->postJson(self::URI, ['name' => 'Telefonsuz'])
            ->assertCreated()
            ->assertJsonPath('data.phone', null);
    }

    public function test_store_requires_authentication(): void
    {
        $this->postJson(self::URI, ['name' => 'Kimliksiz'])->assertUnauthorized();

        $this->assertDatabaseMissing('customers', ['name' => 'Kimliksiz']);
    }

    public function test_store_requires_an_active_company(): void
    {
        $userWithoutCompany = User::factory()->create();

        $this->apiAs($userWithoutCompany)
            ->postJson(self::URI, ['name' => 'Sirketsiz'])
            ->assertForbidden();

        $this->assertDatabaseMissing('customers', ['name' => 'Sirketsiz']);
    }

    // ===============================================================
    // SHOW
    // ===============================================================

    public function test_show_returns_a_customer_of_the_active_company(): void
    {
        $customer = $this->firstSeededCustomer();

        $this->apiAs($this->user)
            ->getJson($this->uriFor($customer))
            ->assertOk()
            ->assertJsonPath('data.id', $customer->getKey())
            ->assertJsonPath('data.name', $customer->name);
    }

    public function test_show_returns_404_for_an_unknown_customer(): void
    {
        $this->apiAs($this->user)
            ->getJson(self::URI.'/999999')
            ->assertNotFound();
    }

    public function test_show_requires_authentication(): void
    {
        $customer = $this->firstSeededCustomer();

        $this->getJson($this->uriFor($customer))->assertUnauthorized();
    }

    // ===============================================================
    // UPDATE
    // ===============================================================

    public function test_update_changes_the_name_and_phone(): void
    {
        $customer = $this->firstSeededCustomer();

        $this->apiAs($this->user)
            ->putJson($this->uriFor($customer), [
                'name' => 'Guncellenmis Ad',
                'phone' => '05009998877',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $customer->getKey())
            ->assertJsonPath('data.name', 'Guncellenmis Ad')
            ->assertJsonPath('data.phone', '05009998877');

        $this->assertDatabaseHas('customers', [
            'id' => $customer->getKey(),
            'name' => 'Guncellenmis Ad',
            'phone' => '05009998877',
        ]);
    }

    /**
     * PUT tam değiştirmedir: gönderilmeyen phone temizlenir.
     */
    public function test_update_clears_the_phone_when_it_is_omitted(): void
    {
        $customer = $this->firstSeededCustomer();

        $this->assertNotNull($customer->phone, 'Fixture telefonlu olmalıydı.');

        $this->apiAs($this->user)
            ->putJson($this->uriFor($customer), ['name' => 'Telefonsuz Kaldi'])
            ->assertOk()
            ->assertJsonPath('data.phone', null);

        $this->assertNull($this->rawCustomer($customer->getKey())->phone);
    }

    public function test_update_cannot_change_the_customer_no(): void
    {
        $customer = $this->firstSeededCustomer();
        $originalNo = (int) $customer->customer_no;

        $this->apiAs($this->user)
            ->putJson($this->uriFor($customer), [
                'name' => $customer->name,
                'customer_no' => 9999,
            ])
            ->assertOk()
            ->assertJsonPath('data.customer_no', $originalNo);

        $this->assertSame(
            $originalNo,
            (int) $this->rawCustomer($customer->getKey())->customer_no,
            'customer_no istemci tarafından değiştirilebiliyor.'
        );
    }

    public function test_update_requires_a_name(): void
    {
        $customer = $this->firstSeededCustomer();

        $this->apiAs($this->user)
            ->putJson($this->uriFor($customer), ['phone' => '05001112233'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name']);
    }

    public function test_update_requires_authentication(): void
    {
        $customer = $this->firstSeededCustomer();

        $this->putJson($this->uriFor($customer), ['name' => 'Kimliksiz'])
            ->assertUnauthorized();

        $this->assertDatabaseMissing('customers', ['name' => 'Kimliksiz']);
    }

    // ===============================================================
    // DESTROY
    // ===============================================================

    public function test_destroy_deletes_the_customer_and_returns_204(): void
    {
        $customer = $this->firstSeededCustomer();

        $this->apiAs($this->user)
            ->deleteJson($this->uriFor($customer))
            ->assertNoContent();

        $this->assertNull(
            $this->rawCustomer($customer->getKey()),
            'Müşteri gerçekten silinmeliydi.'
        );
    }

    public function test_destroy_requires_authentication(): void
    {
        $customer = $this->firstSeededCustomer();

        $this->deleteJson($this->uriFor($customer))->assertUnauthorized();

        $this->assertNotNull($this->rawCustomer($customer->getKey()));
    }

    public function test_destroy_returns_404_for_an_unknown_customer(): void
    {
        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/999999')
            ->assertNotFound();
    }

    /**
     * P0-04 — Member Permission Hardening.
     *
     * Member şirketin TÜM operasyonel müşteri kayıtlarını görüntüleyebilir,
     * oluşturabilir ve güncelleyebilir ama SİLEMEZ — ürün kararı budur.
     * 403 doğrudur, 404 değil: kayıt gerçekten var ve Member gerçekten bu
     * şirketin üyesi; eksik olan yalnızca yetki (§ tenant vs. authorization
     * ayrımı, CustomerPolicy docblock'u).
     */
    public function test_a_member_cannot_destroy_a_customer(): void
    {
        $customer = $this->firstSeededCustomer();

        $this->apiAs($this->member)
            ->deleteJson($this->uriFor($customer))
            ->assertForbidden();

        $this->assertNotNull(
            $this->rawCustomer($customer->getKey()),
            'Member silme isteği reddedilmeliydi; müşteri veritabanında kalmalı.'
        );
    }

    /**
     * REGRESYON — Member'ın view/create/update yetkisi P0-04'ten
     * ETKİLENMEDİ. Yalnızca delete() yeni bir üçüncü koşul (rol) kazandı;
     * diğer üç eylem hâlâ yalnızca tenant üyeliği ister.
     */
    public function test_a_member_can_still_view_create_and_update_customers(): void
    {
        $customer = $this->firstSeededCustomer();

        $this->apiAs($this->member)->getJson(self::URI)->assertOk();
        $this->apiAs($this->member)->getJson($this->uriFor($customer))->assertOk();

        $this->apiAs($this->member)
            ->postJson(self::URI, ['name' => 'Member Musterisi'])
            ->assertCreated();

        $this->apiAs($this->member)
            ->putJson($this->uriFor($customer), ['name' => 'Guncellenen Isim'])
            ->assertOk();
    }

    // ===============================================================
    // RESOURCE ŞEKLİ
    // ===============================================================

    /**
     * Resource bir whitelist'tir. Modele yeni bir sütun eklendiğinde
     * kendiliğinden dışarı sızmamalı.
     */
    public function test_the_resource_exposes_only_whitelisted_fields(): void
    {
        $customer = $this->firstSeededCustomer();

        $payload = $this->apiAs($this->user)
            ->getJson($this->uriFor($customer))
            ->assertOk()
            ->json('data');

        $keys = array_keys($payload);
        sort($keys);

        $this->assertSame(
            ['created_at', 'customer_no', 'id', 'name', 'phone', 'updated_at'],
            $keys,
            'CustomerResource beklenmeyen bir alan döndürüyor.'
        );

        $this->assertArrayNotHasKey(
            'company_id',
            $payload,
            'company_id yanıta sızmış.'
        );
    }
}
