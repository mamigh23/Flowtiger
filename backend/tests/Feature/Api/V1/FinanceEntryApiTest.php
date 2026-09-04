<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Customer;
use App\Models\FinanceEntry;
use App\Models\Scopes\CompanyScope;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * AŞAMA 7 / Adım 3 — finans kaydının ilk dikey kesiti.
 *
 * TEK TABLO, İKİ YÖN: gelir ve gider aynı kayıttır, `direction` ile
 * ayrılır. Alanların neredeyse tamamı ortak ve her rapor ikisini birlikte
 * istiyor; iki tablo, her sorguyu iki kez yazmak demekti.
 *
 * İSTEMCİ TUTARI, SUNUCU HESABI VERİR.
 * Gövde `amount_minor` + `amount_basis` taşır: kullanıcının yazdığı sayı
 * ve o sayının ne anlama geldiği (net mi, brüt mü). net/vat/gross üçlüsü
 * SUNUCUDA VatCalculator ile üretilir. İstemciden gelen bir `vat_minor`
 * ya da `gross_minor` yok sayılır — aksi hâlde belge toplamı
 * uydurulabilirdi (playbook §10.2).
 *
 * BRÜT ESASI NEDEN VAR: eline fiş geçen bir işletme sahibi brüt tutarı
 * görür. Yalnızca net kabul etmek, ürünün çözmeyi vaat ettiği hesabı
 * kullanıcıya elle yaptırmak olurdu. VatCalculator::fromGross zaten bu
 * yön için yazılmıştı (§A4).
 *
 * ÜÇ AYRI KDV HÂLİ (§A4):
 *   vat_rate_bp = 2000 → %20
 *   vat_rate_bp = 0    → KDV var, oranı sıfır  (özete GİRER)
 *   vat_rate_bp = null → kayıt KDV taşımıyor    (özete GİRMEZ)
 *
 * PUT'TUR, PATCH DEĞİL. Parasal alanlar birbirine bağlıdır: yalnızca
 * `amount_minor` güncelleyen kısmi bir istek, eski `vat_minor` ve
 * `gross_minor` ile tutarsız bir kayıt bırakırdı. Gövde kaydın TAM hâlini
 * taşır ve üçlü her seferinde yeniden hesaplanır. Fatura kimliğindeki
 * karar bunun tersiydi çünkü orada alanlar birbirinden bağımsızdı.
 */
class FinanceEntryApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/finance-entries';

    private User $owner;

    /**
     * P0-05 — Payment/FinanceEntry OWNER-ONLY yetki kapsamının test
     * kanıtı. Diğer tüm testler `$this->owner` üzerinden çalışmaya devam
     * ediyor; bu alan yalnızca yetki tarafını ölçmek için eklendi (bkz.
     * CustomerApiTest'teki P0-04 destroy testleriyle aynı gerekçe).
     */
    private User $member;

    private Company $company;

    private Customer $customer;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->member = User::factory()->create();
        $this->company = Company::factory()->withOwner($this->owner)->create();
        $this->company->users()->attach($this->member, ['role' => 'member']);
        $this->customer = Customer::factory()->forCompany($this->company)->create(['name' => 'Zeynep Kaya']);

        app(CompanySelectionService::class)->select($this->owner, $this->company);
        app(CompanyContext::class)->clear();

        app(CompanySelectionService::class)->select($this->member, $this->company);
        app(CompanyContext::class)->clear();
    }

    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'direction' => 'out',
            'financial_date' => '2026-08-22',
            'amount_basis' => 'net',
            'amount_minor' => 100000,
            'vat_rate_bp' => 2000,
            'currency' => 'TRY',
            'category' => 'Kira',
            'note' => 'Ağustos ofis kirası',
        ], $overrides);
    }

    /** Scope'suz okuma — test, ölçtüğü mekanizmaya güvenerek sonuç okumamalı. */
    private function rawEntry(int $id): ?FinanceEntry
    {
        return FinanceEntry::withoutTenantScope('test doğrulaması')->find($id);
    }

    // =================================================================
    // OLUŞTURMA
    // =================================================================

    public function test_an_expense_can_be_created(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload())
            ->assertCreated()
            ->json('data');

        $this->assertSame('out', $data['direction']);
        $this->assertSame('2026-08-22', $data['financial_date']);
        $this->assertSame('Kira', $data['category']);
    }

    public function test_an_income_can_be_created(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['direction' => 'in', 'category' => 'Satış']))
            ->assertCreated()
            ->json('data');

        $this->assertSame('in', $data['direction']);
    }

    /**
     * NET ESASI: 1.000,00 TL net @ %20 → 200,00 KDV, 1.200,00 brüt.
     */
    public function test_the_server_computes_vat_from_a_net_amount(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload())
            ->assertCreated()
            ->json('data');

        $this->assertSame(100000, $data['net_minor']);
        $this->assertSame(20000, $data['vat_minor']);
        $this->assertSame(120000, $data['gross_minor']);
    }

    /**
     * BRÜT ESASI: 1.200,00 TL brüt @ %20 → 1.000,00 net.
     */
    public function test_the_server_extracts_vat_from_a_gross_amount(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'amount_basis' => 'gross',
                'amount_minor' => 120000,
            ]))
            ->assertCreated()
            ->json('data');

        $this->assertSame(100000, $data['net_minor']);
        $this->assertSame(20000, $data['vat_minor']);
        $this->assertSame(120000, $data['gross_minor']);
    }

    /**
     * Küsuratlı brüt ayrıştırma: 100,00 TL brüt @ %20 → 83,33 + 16,67.
     * Yuvarlama RoundingPolicy'den gelir; burada yeniden hesaplanmaz.
     */
    public function test_a_fractional_gross_amount_is_rounded_by_the_policy(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'amount_basis' => 'gross',
                'amount_minor' => 10000,
            ]))
            ->assertCreated()
            ->json('data');

        $this->assertSame(8333, $data['net_minor']);
        $this->assertSame(1667, $data['vat_minor']);
        $this->assertSame(10000, $data['gross_minor']);
    }

    /**
     * DEĞİŞMEZ KURAL: net + KDV = brüt. Her kayıt için, her esasta.
     */
    public function test_net_plus_vat_always_equals_gross(): void
    {
        foreach ([['net', 3333], ['gross', 10000], ['net', 0], ['gross', 1]] as [$basis, $amount]) {
            foreach ([null, 0, 100, 2000] as $rate) {
                $data = $this->apiAs($this->owner)
                    ->postJson(self::URI, $this->payload([
                        'amount_basis' => $basis,
                        'amount_minor' => $amount,
                        'vat_rate_bp' => $rate,
                    ]))
                    ->assertCreated()
                    ->json('data');

                $this->assertSame(
                    $data['gross_minor'],
                    $data['net_minor'] + $data['vat_minor'],
                    "net + KDV ≠ brüt ($basis / $amount / ".var_export($rate, true).')'
                );
            }
        }
    }

    /**
     * SIFIR ORAN bir kayıttır: KDV'lidir, oranı sıfırdır ve KDV özetine
     * girer.
     */
    public function test_a_zero_vat_rate_remains_a_vat_bearing_entry(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['vat_rate_bp' => 0]))
            ->assertCreated()
            ->json('data');

        $this->assertSame(0, $data['vat_rate_bp']);
        $this->assertSame(0, $data['vat_minor']);
        $this->assertSame(100000, $data['gross_minor']);
        $this->assertTrue($data['calculation']['vat_applicable']);
    }

    /**
     * NULL ORAN: kayıt KDV bilgisi TAŞIMIYOR. Tutar olduğu gibi geçer ama
     * bu kayıt KDV özetine girmez.
     */
    public function test_a_null_vat_rate_means_vat_is_not_applicable(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['vat_rate_bp' => null]))
            ->assertCreated()
            ->json('data');

        $this->assertNull($data['vat_rate_bp']);
        $this->assertSame(0, $data['vat_minor']);
        $this->assertSame(100000, $data['net_minor']);
        $this->assertSame(100000, $data['gross_minor']);
        $this->assertFalse($data['calculation']['vat_applicable']);
    }

    /**
     * EN KRİTİK GÜVENLİK TESTİ: istemci hesap sonucunu dayatamaz.
     *
     * Gövdeye konan vat_minor/gross_minor SESSİZCE YOK SAYILMAZ, 422 ile
     * REDDEDİLİR. Aradaki fark önemli: sessizce yok saymak, kullanıcının
     * "gönderdiğim değer uygulandı" sanmasına yol açar ve yanlış bir
     * toplamı fark etmeden kabul etmesine. Açık ret, hatayı gönderildiği
     * anda görünür kılar.
     *
     * ProfileUpdateRequest'te bilinçli olarak TERS karar verilmişti
     * (`prohibited` yok, çünkü 422 "hangi alan adları tanınıyor"
     * bilgisini sızdırırdı). Burada o gerekçe geçmiyor: finans alan
     * adları bir güvenlik ad uzayı değil, ve sessiz yok sayma burada
     * doğrudan bir hesap hatasına dönüşüyor.
     */
    public function test_client_supplied_vat_and_gross_amounts_are_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['vat_minor' => 999999]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('vat_minor');

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['gross_minor' => 999999]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('gross_minor');

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['net_minor' => 999999]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('net_minor');
    }

    /**
     * Tenant sahipliği de gövdeden gelemez.
     */
    public function test_a_company_id_in_the_payload_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['company_id' => 999]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('company_id');
    }

    // =================================================================
    // MÜŞTERİ BAĞLANTISI
    // =================================================================

    public function test_an_entry_can_be_created_without_a_customer(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload())
            ->assertCreated()
            ->json('data');

        $this->assertNull($data['customer']);
    }

    public function test_an_entry_can_reference_a_customer(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['customer_id' => $this->customer->getKey()]))
            ->assertCreated()
            ->json('data');

        $this->assertSame($this->customer->getKey(), $data['customer']['id']);
        $this->assertSame('Zeynep Kaya', $data['customer']['name']);
    }

    /**
     * MÜŞTERİ BAĞLANTISI TENANT SINIRINI AŞAMAZ.
     *
     * Reddin 422 olması bilinçli: bu bir yetki sorunu değil, gövdedeki
     * değerin geçersizliğidir. 404 dönmek ucun kendisini bulunamaz
     * gösterirdi; 403 ise o müşterinin VAR OLDUĞUNU doğrulardı.
     */
    public function test_a_customer_from_another_tenant_is_rejected(): void
    {
        $otherCompany = Company::factory()->create();
        $otherCustomer = Customer::factory()->forCompany($otherCompany)->create();

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['customer_id' => $otherCustomer->getKey()]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_id');
    }

    // =================================================================
    // DOĞRULAMA
    // =================================================================

    public function test_the_direction_is_required_and_constrained(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['direction' => null]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('direction');

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['direction' => 'sideways']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('direction');
    }

    public function test_the_financial_date_is_required_and_must_be_a_date(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['financial_date' => null]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('financial_date');

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['financial_date' => 'dün']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('financial_date');
    }

    public function test_the_amount_is_required_and_cannot_be_negative(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['amount_minor' => null]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount_minor');

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['amount_minor' => -1]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount_minor');
    }

    /**
     * Tutar TAM SAYI KURUŞTUR. Ondalık gönderilmesi bir birim
     * karışıklığıdır ve sessizce yuvarlanmamalıdır.
     */
    public function test_a_fractional_amount_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['amount_minor' => 100.5]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount_minor');
    }

    public function test_the_amount_basis_is_required_and_constrained(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['amount_basis' => 'brüt']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount_basis');
    }

    public function test_a_non_turkish_lira_currency_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['currency' => 'EUR']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('currency');
    }

    public function test_a_negative_vat_rate_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['vat_rate_bp' => -1]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('vat_rate_bp');
    }

    // =================================================================
    // YANIT ŞEKLİ VE AÇIKLANABİLİRLİK
    // =================================================================

    public function test_the_resource_exposes_only_whitelisted_fields(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['customer_id' => $this->customer->getKey()]))
            ->assertCreated()
            ->json('data');

        $keys = array_keys($data);
        sort($keys);

        $this->assertSame([
            'calculation',
            'category',
            'created_at',
            'currency',
            'customer',
            'direction',
            'financial_date',
            'gross_minor',
            'id',
            'net_minor',
            'note',
            'updated_at',
            'vat_minor',
            'vat_rate_bp',
            'void_reason',
            'voided_at',
        ], $keys, 'FinanceEntryResource beklenmeyen bir alan döndürüyor.');
    }

    /**
     * Sonuç GİRDİLERİNİ TAŞIR.
     *
     * Playbook kontrol listesi: "finansal hesaplamalar açıklanabilir".
     * Kullanıcıya yalnızca "KDV: 200,00" demek yetmez; hangi esastan ve
     * nasıl yuvarlanarak çıktığı da görünmelidir.
     *
     * Bu blok HESAPLANIR, SAKLANMAZ (§A5): ayrı bir vergi tablosu yoktur.
     */
    public function test_the_response_carries_the_calculation_inputs(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload())
            ->assertCreated()
            ->json('data');

        $this->assertSame('net', $data['calculation']['basis']);
        $this->assertSame('half_up', $data['calculation']['rounding']);
        $this->assertTrue($data['calculation']['vat_applicable']);
        $this->assertSame('TRY', $data['currency']);
    }

    public function test_the_customer_summary_is_limited_to_identifying_fields(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['customer_id' => $this->customer->getKey()]))
            ->assertCreated()
            ->json('data');

        $keys = array_keys($data['customer']);
        sort($keys);

        $this->assertSame(['customer_no', 'id', 'name'], $keys);
    }

    // =================================================================
    // LİSTELEME
    // =================================================================

    public function test_it_lists_the_entries_with_pagination_meta(): void
    {
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->assertCreated();
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->assertCreated();

        $response = $this->apiAs($this->owner)->getJson(self::URI)->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertSame(2, $response->json('meta.total'));
        $this->assertSame(1, $response->json('meta.current_page'));
    }

    /**
     * Sıralama SABİT: en yeni mali tarih önce, eşitlikte id azalan.
     *
     * İkincil sıra zorunludur — aynı güne yazılmış kayıtlarda sıralama
     * belirsizleşir ve sayfalar arasında kayıt tekrarına ya da kayıp
     * kayda yol açar (audit listesindeki aynı gerekçe).
     */
    public function test_entries_are_ordered_by_financial_date_then_id_descending(): void
    {
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload(['financial_date' => '2026-08-01']));
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload(['financial_date' => '2026-08-20']));
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload(['financial_date' => '2026-08-20']));

        $dates = $this->apiAs($this->owner)->getJson(self::URI)->assertOk()->json('data.*.financial_date');
        $ids = $this->apiAs($this->owner)->getJson(self::URI)->assertOk()->json('data.*.id');

        $this->assertSame(['2026-08-20', '2026-08-20', '2026-08-01'], $dates);
        $this->assertGreaterThan($ids[1], $ids[0]);
    }

    public function test_the_page_size_cannot_exceed_one_hundred(): void
    {
        $this->apiAs($this->owner)
            ->getJson(self::URI.'?per_page=101')
            ->assertStatus(422)
            ->assertJsonValidationErrors('per_page');
    }

    // =================================================================
    // OKUMA / GÜNCELLEME / SİLME
    // =================================================================

    public function test_a_single_entry_can_be_read(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->owner)
            ->getJson(self::URI.'/'.$id)
            ->assertOk()
            ->assertJsonPath('data.id', $id);
    }

    /**
     * PUT TAM DEĞİŞTİRMEDİR ve parasal üçlü YENİDEN HESAPLANIR.
     *
     * Kısmi güncelleme olsaydı, yalnızca tutarı değiştiren bir istek eski
     * KDV ve brüt değerlerini yerinde bırakır ve kayıt kendi içinde
     * tutarsız hâle gelirdi. Parasal alanlar birbirine bağlıdır; birlikte
     * yazılırlar.
     */
    public function test_an_update_recomputes_the_monetary_triplet(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $data = $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload([
                'amount_minor' => 50000,
                'vat_rate_bp' => 100,
            ]))
            ->assertOk()
            ->json('data');

        $this->assertSame(50000, $data['net_minor']);
        $this->assertSame(500, $data['vat_minor']);
        $this->assertSame(50500, $data['gross_minor']);
    }

    public function test_an_update_can_clear_the_vat_rate(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $data = $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload(['vat_rate_bp' => null]))
            ->assertOk()
            ->json('data');

        $this->assertNull($data['vat_rate_bp']);
        $this->assertSame(0, $data['vat_minor']);
        $this->assertFalse($data['calculation']['vat_applicable']);
    }

    public function test_an_update_can_detach_the_customer(): void
    {
        $id = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['customer_id' => $this->customer->getKey()]))
            ->json('data.id');

        $data = $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload())
            ->assertOk()
            ->json('data');

        $this->assertNull($data['customer']);
    }

    /**
     * FİNANS KAYDI SİLİNMEZ, İPTAL EDİLİR.
     *
     * DELETE ucu bilinçli olarak YOKTUR. Silinmiş bir gelir kaydı geçmiş
     * bir dönemin toplamını sessizce değiştirirdi ve "buradaki tutar
     * neden değişti?" sorusunun cevabı yalnızca audit'te kalırdı. İptal
     * edilen kayıt yerinde durur, görünür kalır ve sebebi okunabilir.
     */
    public function test_an_entry_can_be_voided(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $data = $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$id.'/void', ['reason' => 'Yanlış tutar girildi'])
            ->assertOk()
            ->json('data');

        $this->assertNotNull($data['voided_at']);
        $this->assertSame('Yanlış tutar girildi', $data['void_reason']);

        // Kayıt DURUYOR ve hâlâ okunabilir.
        $this->assertNotNull($this->rawEntry($id));
        $this->apiAs($this->owner)->getJson(self::URI.'/'.$id)->assertOk();
    }

    public function test_an_entry_can_be_voided_without_a_reason(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $data = $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$id.'/void', [])
            ->assertOk()
            ->json('data');

        $this->assertNotNull($data['voided_at']);
        $this->assertNull($data['void_reason']);
    }

    /**
     * İptal TERMİNALDİR: ikinci kez iptal edilemez.
     *
     * Sessizce başarılı dönmek, ilk iptalin zamanını ve sebebini
     * üzerine yazma riski doğururdu.
     */
    public function test_an_already_voided_entry_cannot_be_voided_again(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->owner)->postJson(self::URI.'/'.$id.'/void', [])->assertOk();

        $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$id.'/void', [])
            ->assertStatus(422)
            ->assertJsonPath('code', 'finance_entry_already_voided');
    }

    /**
     * İptal edilmiş kayıt DEĞİŞTİRİLEMEZ.
     *
     * Değiştirilebilseydi iptal bir işaretten ibaret kalır, kaydın
     * tutarları iptalden sonra da oynatılabilirdi — yani iptalin hiçbir
     * koruyucu değeri olmazdı.
     */
    public function test_a_voided_entry_cannot_be_updated(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->owner)->postJson(self::URI.'/'.$id.'/void', [])->assertOk();

        $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload(['amount_minor' => 1]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'finance_entry_voided');

        $this->assertSame(100000, $this->rawEntry($id)->net_minor);
    }

    // =================================================================
    // AUDIT
    // =================================================================

    public function test_creating_an_entry_is_audited(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $log = $this->latestAudit(AuditAction::FinanceEntryCreated);

        $this->assertNotNull($log, 'finance_entry.created kaydı yok.');
        $this->assertSame($this->company->getKey(), (int) $log->company_id);
        $this->assertSame($id, (int) $log->auditable_id);
        $this->assertSame(100000, $log->new_values['net_minor'] ?? null);
    }

    public function test_updating_an_entry_is_audited_with_old_and_new_values(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload(['amount_minor' => 50000]))
            ->assertOk();

        $log = $this->latestAudit(AuditAction::FinanceEntryUpdated);

        $this->assertNotNull($log, 'finance_entry.updated kaydı yok.');
        $this->assertSame(100000, $log->old_values['net_minor'] ?? null);
        $this->assertSame(50000, $log->new_values['net_minor'] ?? null);
    }

    /**
     * İptal ayrı bir olaydır ve kendi izini bırakır.
     *
     * finance_entry.updated ile birleştirilemez: iptal, tutarların
     * düzeltilmesi değil kaydın mali geçerliliğinin sonlandırılmasıdır ve
     * bir incelemede tek başına aranabilir olmalıdır.
     */
    public function test_voiding_an_entry_is_audited(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$id.'/void', ['reason' => 'Mükerrer kayıt'])
            ->assertOk();

        $log = $this->latestAudit(AuditAction::FinanceEntryVoided);

        $this->assertNotNull($log, 'finance_entry.voided kaydı yok.');
        $this->assertSame($id, (int) $log->auditable_id);
        $this->assertSame('Mükerrer kayıt', $log->metadata['void_reason'] ?? null);

        // Kaydın iptal anındaki tutarları izde kalır.
        $this->assertSame(100000, $log->old_values['net_minor'] ?? null);
    }

    /**
     * REGRESYON: audit'e sır ya da düz metin kişisel veri girmez.
     *
     * Not alanı serbest metindir ve kullanıcı oraya her şeyi yazabilir;
     * ama audit'e yazılan anahtarlar AuditLogService'in filtresinden
     * geçer. Bu test, finans kaydının o filtreyi atlayan bir yol
     * açmadığını sabitler.
     */
    public function test_the_audit_entry_contains_no_secrets(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['note' => 'Ağustos kirası']))
            ->assertCreated();

        $log = $this->latestAudit(AuditAction::FinanceEntryCreated);
        $encoded = json_encode([$log->old_values, $log->new_values, $log->metadata], JSON_UNESCAPED_UNICODE);

        foreach (['password', 'token', 'secret', 'authorization'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, strtolower((string) $encoded));
        }
    }

    private function latestAudit(AuditAction $action): ?AuditLog
    {
        return AuditLog::withoutGlobalScope(CompanyScope::class)
            ->where('action', $action->value)
            ->latest('id')
            ->first();
    }

    // =================================================================
    // MEVCUT SÖZLEŞME KORUNUYOR
    // =================================================================

    /**
     * REGRESYON: finans kaydı eklemek müşteri ucunu etkilemez.
     */
    public function test_the_customer_contract_is_unchanged(): void
    {
        $payload = $this->apiAs($this->owner)
            ->getJson('/api/v1/customers/'.$this->customer->getKey())
            ->assertOk()
            ->json('data');

        $keys = array_keys($payload);
        sort($keys);

        $this->assertSame(['created_at', 'customer_no', 'id', 'name', 'phone', 'updated_at'], $keys);
    }

    // =================================================================
    // ROL YETKİSİ (P0-05) — FinanceEntry OWNER-ONLY'dir, Member her uçta 403 alır
    // =================================================================

    /**
     * 403 doğrudur, 404 değil: kayıt gerçekten var ve Member gerçekten bu
     * şirketin üyesi, eksik olan yalnızca yetki — CustomerApiTest'teki
     * P0-04 destroy testleriyle aynı gerekçe (tenant vs. authorization
     * ayrımı, FinanceEntryPolicy docblock'u).
     */
    public function test_a_member_cannot_list_finance_entries(): void
    {
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->assertCreated();

        $this->apiAs($this->member)
            ->getJson(self::URI)
            ->assertForbidden();
    }

    public function test_a_member_cannot_read_a_single_finance_entry(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->member)
            ->getJson(self::URI.'/'.$id)
            ->assertForbidden();
    }

    public function test_a_member_cannot_create_a_finance_entry(): void
    {
        $this->apiAs($this->member)
            ->postJson(self::URI, $this->payload())
            ->assertForbidden();

        $this->assertSame(0, FinanceEntry::withoutTenantScope('test doğrulaması')->count());
    }

    public function test_a_member_cannot_update_a_finance_entry(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->member)
            ->putJson(self::URI.'/'.$id, $this->payload(['amount_minor' => 1]))
            ->assertForbidden();

        $this->assertSame(100000, $this->rawEntry($id)->net_minor);
    }

    public function test_a_member_cannot_void_a_finance_entry(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->member)
            ->postJson(self::URI.'/'.$id.'/void', [])
            ->assertForbidden();

        $this->assertNull($this->rawEntry($id)->voided_at);
    }
}
