<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Customer;
use App\Models\FinanceEntry;
use App\Models\Payment;
use App\Models\Scopes\CompanyScope;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * AŞAMA 7 / Adım 4 — ödeme ve tahsilat dağıtımı.
 *
 * PAYMENT HEDEFİNE DOĞRUDAN BAĞLANMAZ. Doğrudan bir FK olsaydı üç şey
 * imkânsızlaşırdı:
 *   - hedefsiz (avans) tahsilat
 *   - bir ödemenin iki hedefe bölünmesi
 *   - bir hedefin iki ödemeyle kapatılması
 * Bağlantı `payment_allocations` ara tablosunda kurulur.
 *
 * DAĞITIMLAR ÖDEMEYLE BİRLİKTE YAZILIR. Ayrı bir uç olsaydı
 * "toplam dağıtım ödemeyi aşamaz" kuralı iki isteğe yayılır ve arada
 * geçersiz bir ara durum oluşurdu. Gövde ödemenin TAM hâlini taşır
 * (PUT), dağıtımlar da o hâlin parçasıdır — FinanceEntry'deki parasal
 * üçlü kararıyla aynı gerekçe: birbirine bağlı alanlar birlikte yazılır.
 *
 * TÜRETİLEN ALANLAR SAKLANMAZ (§A5): `allocated_minor` ve
 * `remaining_minor` her okumada dağıtımlardan hesaplanır. Saklanan bir
 * "kalan" sütunu bir gün kaynağıyla çelişirdi.
 *
 * INVOICE HENÜZ YOK. Dağıtım hedefi bugün yalnızca FinanceEntry'dir;
 * Invoice geldiğinde ikinci bir nullable FK eklenecek. Bu testler o
 * genişlemeye hazır yazıldı — hedef alanı `finance_entry_id` olarak
 * ADLANDIRILMIŞTIR, `target_id` değil.
 */
class PaymentApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/payments';

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

    private FinanceEntry $entry;

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

        // 1.200,00 TL brüt gelir kaydı — tahsilat hedefi.
        $this->entry = FinanceEntry::factory()->forCompany($this->company)->create(['direction' => 'in']);

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
            'financial_date' => '2026-08-22',
            'amount_minor' => 120000,
            'currency' => 'TRY',
            'method' => 'bank',
            'note' => null,
        ], $overrides);
    }

    private function rawPayment(int $id): ?Payment
    {
        return Payment::withoutTenantScope('test doğrulaması')->find($id);
    }

    // =================================================================
    // FATURASIZ / HEDEFSİZ ÖDEME
    // =================================================================

    /**
     * DAĞITIMSIZ ÖDEME GEÇERLİDİR.
     *
     * Bankaya para geldi ama neye ait olduğu henüz belli değil — bu
     * gerçek bir durumdur ve kaydedilebilmelidir. Ödemeyi bir hedefe
     * bağlanmaya zorlamak, kullanıcıyı uydurma bir hedef seçmeye iterdi.
     */
    public function test_a_payment_can_be_created_without_any_allocation(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload())
            ->assertCreated()
            ->json('data');

        $this->assertSame(120000, $data['amount_minor']);
        $this->assertSame(0, $data['allocated_minor']);
        $this->assertSame(120000, $data['remaining_minor']);
        $this->assertSame([], $data['allocations']);
    }

    public function test_a_payment_can_be_created_without_a_customer(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload())
            ->assertCreated()
            ->json('data');

        $this->assertNull($data['customer']);
    }

    public function test_a_payment_can_reference_a_customer(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['customer_id' => $this->customer->getKey()]))
            ->assertCreated()
            ->json('data');

        $this->assertSame($this->customer->getKey(), $data['customer']['id']);
        $this->assertSame('Zeynep Kaya', $data['customer']['name']);
    }

    public function test_a_customer_from_another_tenant_is_rejected(): void
    {
        $otherCustomer = Customer::factory()->forCompany(Company::factory()->create())->create();

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['customer_id' => $otherCustomer->getKey()]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_id');
    }

    // =================================================================
    // DAĞITIM
    // =================================================================

    public function test_a_payment_can_be_allocated_to_a_finance_entry(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 50000],
                ],
            ]))
            ->assertCreated()
            ->json('data');

        $this->assertCount(1, $data['allocations']);
        $this->assertSame(50000, $data['allocations'][0]['amount_minor']);
        $this->assertSame($this->entry->getKey(), $data['allocations'][0]['finance_entry']['id']);
    }

    /**
     * BİR ÖDEME BİRDEN FAZLA HEDEFE BÖLÜNEBİLİR.
     *
     * Müşteri tek havaleyle iki farklı kaydı kapatabilir; ara tablonun
     * var oluş sebeplerinden biri budur.
     */
    public function test_a_payment_can_be_split_across_two_targets(): void
    {
        $second = FinanceEntry::factory()->forCompany($this->company)->create(['direction' => 'in']);

        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 70000],
                    ['finance_entry_id' => $second->getKey(), 'amount_minor' => 50000],
                ],
            ]))
            ->assertCreated()
            ->json('data');

        $this->assertCount(2, $data['allocations']);
        $this->assertSame(120000, $data['allocated_minor']);
        $this->assertSame(0, $data['remaining_minor']);
    }

    /**
     * DEĞİŞMEZ KURAL: dağıtım toplamı ödeme tutarını AŞAMAZ.
     *
     * Aşabilseydi, olmayan para dağıtılmış olurdu ve "ne kadarı tahsil
     * edildi" hesabı gerçeğin üstünde bir sonuç verirdi.
     */
    public function test_allocations_cannot_exceed_the_payment_amount(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'amount_minor' => 100000,
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 100001],
                ],
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('allocations');
    }

    public function test_the_sum_of_allocations_cannot_exceed_the_payment_amount(): void
    {
        $second = FinanceEntry::factory()->forCompany($this->company)->create(['direction' => 'in']);

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'amount_minor' => 100000,
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 60000],
                    ['finance_entry_id' => $second->getKey(), 'amount_minor' => 60000],
                ],
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('allocations');
    }

    /**
     * Dağıtım toplamı ödemeye EŞİT olabilir — sınır dahildir.
     */
    public function test_allocations_may_equal_the_payment_amount(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 120000],
                ],
            ]))
            ->assertCreated()
            ->assertJsonPath('data.remaining_minor', 0);
    }

    public function test_an_allocation_amount_must_be_positive(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 0],
                ],
            ]))
            ->assertStatus(422);
    }

    /**
     * DAĞITIM HEDEFİ TENANT SINIRINI AŞAMAZ.
     *
     * Aşabilseydi, A şirketi B'nin kayıt id'lerini deneyerek hangilerinin
     * var olduğunu öğrenebilirdi — üstelik kendi ödemesi üzerinden.
     */
    public function test_an_allocation_cannot_target_another_tenants_entry(): void
    {
        $foreign = FinanceEntry::factory()->forCompany(Company::factory()->create())->create();

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $foreign->getKey(), 'amount_minor' => 1000],
                ],
            ]))
            ->assertStatus(422);
    }

    // =================================================================
    // TÜRETİLEN ALANLAR — HESAPLANIR, SAKLANMAZ
    // =================================================================

    /**
     * `allocated_minor` ve `remaining_minor` SAKLANMAZ (§A5).
     *
     * Saklanan bir "kalan" sütunu, dağıtım değiştiğinde güncellenmeyi
     * unutulan ilk şey olurdu ve kaynağıyla çelişirdi.
     */
    public function test_the_derived_totals_are_not_stored_as_columns(): void
    {
        $this->assertFalse(\Illuminate\Support\Facades\Schema::hasColumn('payments', 'allocated_minor'));
        $this->assertFalse(\Illuminate\Support\Facades\Schema::hasColumn('payments', 'remaining_minor'));
    }

    public function test_the_remaining_amount_is_the_payment_minus_allocations(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'amount_minor' => 120000,
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 45000],
                ],
            ]))
            ->assertCreated()
            ->json('data');

        $this->assertSame(45000, $data['allocated_minor']);
        $this->assertSame(75000, $data['remaining_minor']);
        $this->assertSame(
            $data['amount_minor'],
            $data['allocated_minor'] + $data['remaining_minor'],
        );
    }

    /**
     * Türetilen tutarlar TAM SAYIDIR — hiçbir hesap float'a düşmez.
     */
    public function test_the_derived_totals_are_integers(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 33333],
                ],
            ]))
            ->assertCreated()
            ->json('data');

        $this->assertIsInt($data['allocated_minor']);
        $this->assertIsInt($data['remaining_minor']);
    }

    // =================================================================
    // DOĞRULAMA
    // =================================================================

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

    public function test_a_fractional_amount_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['amount_minor' => 100.5]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount_minor');
    }

    public function test_the_financial_date_is_required(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['financial_date' => null]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('financial_date');
    }

    public function test_a_non_turkish_lira_currency_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['currency' => 'EUR']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('currency');
    }

    /**
     * Türetilen alanlar dayatılamaz — FinanceEntry'deki kararla aynı.
     */
    public function test_client_supplied_derived_totals_are_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['allocated_minor' => 999]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('allocated_minor');

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['company_id' => 999]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('company_id');
    }

    // =================================================================
    // YANIT ŞEKLİ
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
            'allocated_minor',
            'allocations',
            'amount_minor',
            'created_at',
            'currency',
            'customer',
            'financial_date',
            'id',
            'method',
            'note',
            'remaining_minor',
            'updated_at',
            'void_reason',
            'voided_at',
        ], $keys, 'PaymentResource beklenmeyen bir alan döndürüyor.');
    }

    // =================================================================
    // LİSTELEME / OKUMA / GÜNCELLEME
    // =================================================================

    public function test_it_lists_payments_with_pagination_meta(): void
    {
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->assertCreated();
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->assertCreated();

        $response = $this->apiAs($this->owner)->getJson(self::URI)->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertSame(2, $response->json('meta.total'));
    }

    public function test_payments_are_ordered_by_financial_date_then_id_descending(): void
    {
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload(['financial_date' => '2026-08-01']));
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload(['financial_date' => '2026-08-20']));
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload(['financial_date' => '2026-08-20']));

        $dates = $this->apiAs($this->owner)->getJson(self::URI)->assertOk()->json('data.*.financial_date');

        $this->assertSame(['2026-08-20', '2026-08-20', '2026-08-01'], $dates);
    }

    public function test_the_page_size_cannot_exceed_one_hundred(): void
    {
        $this->apiAs($this->owner)
            ->getJson(self::URI.'?per_page=101')
            ->assertStatus(422)
            ->assertJsonValidationErrors('per_page');
    }

    public function test_a_single_payment_can_be_read(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->owner)
            ->getJson(self::URI.'/'.$id)
            ->assertOk()
            ->assertJsonPath('data.id', $id);
    }

    /**
     * PUT TAM DEĞİŞTİRMEDİR: dağıtımlar da gövdenin parçasıdır ve
     * gönderilen liste eskisinin YERİNE geçer.
     *
     * Kısmi olsaydı "dağıtımı sil" ile "dağıtıma dokunma" ayrımı
     * anlatılamazdı.
     */
    public function test_an_update_replaces_the_allocations(): void
    {
        $id = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 50000],
                ],
            ]))
            ->json('data.id');

        $data = $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 90000],
                ],
            ]))
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $data['allocations']);
        $this->assertSame(90000, $data['allocated_minor']);
        $this->assertSame(30000, $data['remaining_minor']);
    }

    public function test_an_update_can_remove_all_allocations(): void
    {
        $id = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 50000],
                ],
            ]))
            ->json('data.id');

        $data = $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload(['allocations' => []]))
            ->assertOk()
            ->json('data');

        $this->assertSame([], $data['allocations']);
        $this->assertSame(0, $data['allocated_minor']);
    }

    /**
     * Tutar düşürülürken mevcut dağıtımlar geçersiz kalıyorsa reddedilir.
     *
     * Bu, değişmezliğin en kolay atlanacağı yer: yalnızca yaratmada
     * kontrol eden bir sistem, güncellemeyle bozulabilirdi.
     */
    public function test_lowering_the_amount_below_the_allocated_total_is_rejected(): void
    {
        $id = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 100000],
                ],
            ]))
            ->json('data.id');

        $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload([
                'amount_minor' => 50000,
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 100000],
                ],
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('allocations');
    }

    // =================================================================
    // İPTAL
    // =================================================================

    /**
     * ÖDEME SİLİNMEZ, İPTAL EDİLİR — FinanceEntry ile aynı karar.
     */
    public function test_a_payment_can_be_voided(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $data = $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$id.'/void', ['reason' => 'Mükerrer kayıt'])
            ->assertOk()
            ->json('data');

        $this->assertNotNull($data['voided_at']);
        $this->assertSame('Mükerrer kayıt', $data['void_reason']);
        $this->assertNotNull($this->rawPayment($id));
    }

    public function test_an_already_voided_payment_cannot_be_voided_again(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->owner)->postJson(self::URI.'/'.$id.'/void', [])->assertOk();

        $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$id.'/void', [])
            ->assertStatus(422)
            ->assertJsonPath('code', 'payment_already_voided');
    }

    public function test_a_voided_payment_cannot_be_updated(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->owner)->postJson(self::URI.'/'.$id.'/void', [])->assertOk();

        $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload(['amount_minor' => 1]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'payment_voided');
    }

    /**
     * İPTAL DAĞITIMLARI SİLMEZ — ödeme bütünlüğü korunur.
     *
     * Dağıtımlar iptal edilmiş ödemenin altında durmaya devam eder;
     * "bu para neye sayılmıştı" sorusu iptalden sonra da cevaplanabilir.
     * Raporlarda sayılmaması iptal işaretinden gelir, kaydın yok
     * olmasından değil.
     */
    public function test_voiding_a_payment_keeps_its_allocations(): void
    {
        $id = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 50000],
                ],
            ]))
            ->json('data.id');

        $data = $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$id.'/void', [])
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $data['allocations']);
        $this->assertSame(50000, $data['allocated_minor']);
    }

    // =================================================================
    // AUDIT
    // =================================================================

    public function test_creating_a_payment_is_audited(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $log = $this->latestAudit(AuditAction::PaymentCreated);

        $this->assertNotNull($log, 'payment.created kaydı yok.');
        $this->assertSame($id, (int) $log->auditable_id);
        $this->assertSame(120000, $log->new_values['amount_minor'] ?? null);
    }

    public function test_updating_a_payment_is_audited_with_old_and_new_values(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload(['amount_minor' => 90000]))
            ->assertOk();

        $log = $this->latestAudit(AuditAction::PaymentUpdated);

        $this->assertSame(120000, $log->old_values['amount_minor'] ?? null);
        $this->assertSame(90000, $log->new_values['amount_minor'] ?? null);
    }

    public function test_voiding_a_payment_is_audited(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->owner)->postJson(self::URI.'/'.$id.'/void', ['reason' => 'Hatalı'])->assertOk();

        $log = $this->latestAudit(AuditAction::PaymentVoided);

        $this->assertNotNull($log, 'payment.voided kaydı yok.');
        $this->assertSame('Hatalı', $log->metadata['void_reason'] ?? null);
    }

    /**
     * Dağıtım değişikliği ödemenin izinde görünür.
     *
     * Ayrı bir `payment_allocation.*` olayı YOK: dağıtım kendi başına bir
     * varlık değil, ödemenin bir özelliğidir ve yalnızca ödemeyle
     * birlikte değişir. Ayrı olay üretmek, tek bir kullanıcı eylemini
     * izde iki satıra bölerdi.
     */
    public function test_allocation_changes_appear_in_the_payment_audit(): void
    {
        $id = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload([
                'allocations' => [
                    ['finance_entry_id' => $this->entry->getKey(), 'amount_minor' => 50000],
                ],
            ]))
            ->json('data.id');

        $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$id, $this->payload(['allocations' => []]))
            ->assertOk();

        $log = $this->latestAudit(AuditAction::PaymentUpdated);

        $this->assertSame(50000, $log->old_values['allocated_minor'] ?? null);
        $this->assertSame(0, $log->new_values['allocated_minor'] ?? null);
    }

    /**
     * REGRESYON: `note` audit'e DÜZ METİN GİRMEZ.
     *
     * Serbest metindir ve kullanıcı oraya kişisel veri yazabilir; audit
     * tablosu tasarım gereği kalıcıdır ve oraya yazılan bir not asla
     * silinemez. FinanceEntry'deki kararla aynı.
     */
    public function test_the_note_does_not_reach_the_audit_log(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['note' => 'Ahmet Yilmaz 5551234567']))
            ->assertCreated();

        $log = $this->latestAudit(AuditAction::PaymentCreated);
        $encoded = json_encode([$log->old_values, $log->new_values, $log->metadata], JSON_UNESCAPED_UNICODE);

        $this->assertStringNotContainsString('5551234567', (string) $encoded);
    }

    private function latestAudit(AuditAction $action): ?AuditLog
    {
        return AuditLog::withoutGlobalScope(CompanyScope::class)
            ->where('action', $action->value)
            ->latest('id')
            ->first();
    }

    // =================================================================
    // ROL YETKİSİ (P0-05) — Payment OWNER-ONLY'dir, Member her uçta 403 alır
    // =================================================================

    /**
     * 403 doğrudur, 404 değil: kayıt gerçekten var ve Member gerçekten bu
     * şirketin üyesi, eksik olan yalnızca yetki — CustomerApiTest'teki
     * P0-04 destroy testleriyle aynı gerekçe (tenant vs. authorization
     * ayrımı, PaymentPolicy docblock'u).
     */
    public function test_a_member_cannot_list_payments(): void
    {
        $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->assertCreated();

        $this->apiAs($this->member)
            ->getJson(self::URI)
            ->assertForbidden();
    }

    public function test_a_member_cannot_read_a_single_payment(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->member)
            ->getJson(self::URI.'/'.$id)
            ->assertForbidden();
    }

    public function test_a_member_cannot_create_a_payment(): void
    {
        $this->apiAs($this->member)
            ->postJson(self::URI, $this->payload())
            ->assertForbidden();

        $this->assertSame(0, Payment::withoutTenantScope('test doğrulaması')->count());
    }

    public function test_a_member_cannot_update_a_payment(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->member)
            ->putJson(self::URI.'/'.$id, $this->payload(['amount_minor' => 1]))
            ->assertForbidden();

        $this->assertSame(120000, $this->rawPayment($id)->amount_minor);
    }

    public function test_a_member_cannot_void_a_payment(): void
    {
        $id = $this->apiAs($this->owner)->postJson(self::URI, $this->payload())->json('data.id');

        $this->apiAs($this->member)
            ->postJson(self::URI.'/'.$id.'/void', [])
            ->assertForbidden();

        $this->assertNull($this->rawPayment($id)->voided_at);
    }
}
