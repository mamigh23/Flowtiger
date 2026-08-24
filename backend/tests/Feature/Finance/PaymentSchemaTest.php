<?php

namespace Tests\Feature\Finance;

use App\Models\Company;
use App\Models\FinanceEntry;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * AŞAMA 7 / Adım 4 — ödeme ve tahsilat dağıtımının ŞEMA sözleşmesi.
 *
 * PAYMENT, HEDEFİNE DOĞRUDAN BAĞLANMAZ.
 * Doğrudan bir `invoice_id`/`finance_entry_id` sütunu olsaydı üç şey
 * imkânsızlaşırdı: hedefsiz (avans) tahsilat, bir ödemenin iki hedefe
 * bölünmesi, bir hedefin iki ödemeyle kapatılması. Bağlantı ara tabloda
 * kurulur.
 *
 * HEDEF POLİMORFİK DEĞİL, ADLANDIRILMIŞ NULLABLE FK'LARLA TAŞINIR.
 *
 * AuditLog'da morph kullanılıyor ama orası APPEND-ONLY bir izdir ve
 * silinmiş kayıtlara bilerek atıfta bulunur — dangling referans orada bir
 * özelliktir. Tahsilat dağıtımı ise CANLI mali veridir: hedefi silinmiş
 * bir dağıtım, "ne kadarı tahsil edildi" hesabını sessizce bozardı ve
 * veritabanı bunu engelleyemezdi (morph sütunlarına FK konamaz).
 *
 * Bu yüzden her hedef türü kendi nullable FK'sını alır ve bir CHECK
 * kısıtı TAM OLARAK BİRİNİN dolu olmasını zorlar. Hedef kümesi sınırsız
 * değil, bilinen ve küçük: bugün FinanceEntry, yarın Invoice.
 *
 * INVOICE HENÜZ YOK. `invoice_id` sütunu BU MIGRATION'DA AÇILMAZ — olmayan
 * bir tabloya FK verilemez. Invoice geldiğinde sütun eklenir ve CHECK
 * kısıtı güncellenir; mevcut satırların anlamı değişmez çünkü hepsi
 * zaten `finance_entry_id` ile etiketlidir.
 */
class PaymentSchemaTest extends TestCase
{
    use RefreshDatabase;

    private const PAYMENTS = 'payments';

    private const ALLOCATIONS = 'payment_allocations';

    // =================================================================
    // PAYMENT TABLOSU
    // =================================================================

    public function test_the_payments_table_has_all_required_columns(): void
    {
        foreach ([
            'id', 'company_id', 'customer_id', 'financial_date',
            'amount_minor', 'currency', 'method', 'note',
            'voided_at', 'void_reason', 'created_at', 'updated_at',
        ] as $column) {
            $this->assertTrue(
                Schema::hasColumn(self::PAYMENTS, $column),
                'payments tablosunda \''.$column.'\' sütunu yok.'
            );
        }
    }

    public function test_the_payment_amount_is_an_integer_not_a_decimal(): void
    {
        $this->assertIntegerColumn(self::PAYMENTS, 'amount_minor');
    }

    public function test_the_payment_financial_date_is_a_calendar_date(): void
    {
        $this->assertSame('date', Schema::getColumnType(self::PAYMENTS, 'financial_date'));
    }

    public function test_a_payment_requires_a_company(): void
    {
        $this->expectException(QueryException::class);

        DB::table(self::PAYMENTS)->insert($this->rawPayment(null));
    }

    public function test_a_payment_requires_a_currency(): void
    {
        $company = Company::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::PAYMENTS)->insert($this->rawPayment($company, ['currency' => null]));
    }

    /**
     * MVP yalnızca TRY (§A2).
     */
    public function test_a_payment_rejects_a_non_turkish_lira_currency(): void
    {
        $company = Company::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::PAYMENTS)->insert($this->rawPayment($company, ['currency' => 'EUR']));
    }

    /**
     * Tutar EKSİ OLAMAZ.
     *
     * FinanceEntry'deki kararla aynı: Money negatifi tip olarak kabul
     * eder, alan etmez (§A1). Eksi bir tahsilat aslında bir iade'dir ve
     * kendi kaydını hak eder — aynı tabloda iki farklı anlam taşımaz.
     */
    public function test_a_payment_rejects_a_negative_amount(): void
    {
        $company = Company::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::PAYMENTS)->insert($this->rawPayment($company, ['amount_minor' => -1]));
    }

    /**
     * Müşteri OPSİYONELDİR: kaynağı henüz belirlenmemiş bir banka girişi
     * de kaydedilebilmeli.
     */
    public function test_a_payment_customer_is_optional(): void
    {
        $company = Company::factory()->create();

        $id = DB::table(self::PAYMENTS)->insertGetId($this->rawPayment($company));

        $this->assertNull(DB::table(self::PAYMENTS)->where('id', $id)->value('customer_id'));
    }

    /**
     * Ödeme de SİLİNMEZ, iptal edilir — FinanceEntry ile aynı karar.
     */
    public function test_the_payment_void_columns_are_nullable(): void
    {
        $company = Company::factory()->create();

        $id = DB::table(self::PAYMENTS)->insertGetId($this->rawPayment($company));
        $row = DB::table(self::PAYMENTS)->where('id', $id)->first();

        $this->assertNull($row->voided_at);
        $this->assertNull($row->void_reason);
    }

    // =================================================================
    // PAYMENT ALLOCATION TABLOSU
    // =================================================================

    public function test_the_allocations_table_has_all_required_columns(): void
    {
        foreach ([
            'id', 'company_id', 'payment_id', 'finance_entry_id',
            'amount_minor', 'created_at', 'updated_at',
        ] as $column) {
            $this->assertTrue(
                Schema::hasColumn(self::ALLOCATIONS, $column),
                'payment_allocations tablosunda \''.$column.'\' sütunu yok.'
            );
        }
    }

    /**
     * REGRESYON: polimorfik hedef sütunları KULLANILMIYOR.
     *
     * `target_type`/`target_id` bir morph çiftidir ve üzerine FK
     * konamaz — hedefi silinmiş bir dağıtım veritabanı tarafından
     * engellenemezdi. Bu test, o yaklaşımın sessizce geri gelmesini
     * önler.
     */
    public function test_the_allocation_target_is_not_polymorphic(): void
    {
        $this->assertFalse(Schema::hasColumn(self::ALLOCATIONS, 'target_type'));
        $this->assertFalse(Schema::hasColumn(self::ALLOCATIONS, 'target_id'));
    }

    public function test_the_allocation_amount_is_an_integer_not_a_decimal(): void
    {
        $this->assertIntegerColumn(self::ALLOCATIONS, 'amount_minor');
    }

    /**
     * Sıfır ya da eksi tutarlı dağıtım anlamsızdır.
     */
    public function test_an_allocation_rejects_a_non_positive_amount(): void
    {
        [$company, $payment, $entry] = $this->paymentWithTarget();

        $this->expectException(QueryException::class);

        DB::table(self::ALLOCATIONS)->insert(
            $this->rawAllocation($company, $payment, $entry, ['amount_minor' => 0])
        );
    }

    /**
     * TENANT ANAHTARI DAĞITIMDA DA TAŞINIR.
     *
     * company_id, payment üzerinden çıkarılabilir olmasına rağmen ayrıca
     * saklanır: CompanyScope her tabloya kendi sütunundan bakar ve
     * dağıtım listesi bir join'e bağımlı kalmamalıdır. Aynı sebeple
     * customers ve finance_entries de kendi company_id'lerini taşıyor.
     */
    public function test_an_allocation_carries_its_own_tenant_key(): void
    {
        [$company, $payment, $entry] = $this->paymentWithTarget();

        $id = DB::table(self::ALLOCATIONS)->insertGetId(
            $this->rawAllocation($company, $payment, $entry)
        );

        $this->assertSame(
            $company->getKey(),
            (int) DB::table(self::ALLOCATIONS)->where('id', $id)->value('company_id')
        );
    }

    /**
     * Ödeme silinirse dağıtımları da gider.
     *
     * Ödeme normal akışta silinmez (iptal edilir), ama şirket silindiğinde
     * cascade zinciri buraya kadar ulaşmalı — yetim dağıtım kalmamalı.
     */
    public function test_deleting_a_payment_removes_its_allocations(): void
    {
        [, $payment] = $this->paymentWithTarget(withAllocation: true);

        DB::table(self::PAYMENTS)->where('id', $payment)->delete();

        $this->assertSame(0, DB::table(self::ALLOCATIONS)->count());
    }

    /**
     * HEDEF SİLİNEMEZ: dağıtımı olan bir finans kaydı silinmeye
     * çalışılırsa veritabanı engeller.
     *
     * nullOnDelete DEĞİL restrict: hedefi boşalmış bir dağıtım, "bu para
     * neye sayıldı?" sorusunu cevapsız bırakırdı. Zaten finans kaydı da
     * silinmiyor, iptal ediliyor.
     */
    public function test_a_finance_entry_with_allocations_cannot_be_deleted(): void
    {
        [, , $entry] = $this->paymentWithTarget(withAllocation: true);

        $this->expectException(QueryException::class);

        DB::table('finance_entries')->where('id', $entry)->delete();
    }

    private function assertIntegerColumn(string $table, string $column): void
    {
        $type = Schema::getColumnType($table, $column);

        // PostgreSQL yerel adları: bigint→int8, integer→int4.
        // Beyaz liste — "numeric olmasın" demek yarınki `money` tipini
        // kaçırırdı (§A1).
        $this->assertContains(
            $type,
            ['bigint', 'int8', 'integer', 'int4', 'smallint', 'int2'],
            "$table.$column tam sayı olmalı, '$type' bulundu."
        );
    }

    /**
     * @return array{0: Company, 1: int, 2: int}
     */
    private function paymentWithTarget(bool $withAllocation = false): array
    {
        $company = Company::factory()->create();
        $entry = FinanceEntry::factory()->forCompany($company)->create();

        $paymentId = DB::table(self::PAYMENTS)->insertGetId($this->rawPayment($company));

        if ($withAllocation) {
            DB::table(self::ALLOCATIONS)->insert(
                $this->rawAllocation($company, $paymentId, $entry->getKey())
            );
        }

        return [$company, $paymentId, $entry->getKey()];
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function rawPayment(?Company $company, array $overrides = []): array
    {
        return array_merge([
            'company_id' => $company?->getKey(),
            'customer_id' => null,
            'financial_date' => '2026-08-22',
            'amount_minor' => 120000,
            'currency' => 'TRY',
            'method' => 'bank',
            'note' => null,
            'voided_at' => null,
            'void_reason' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function rawAllocation(Company $company, int $paymentId, int $entryId, array $overrides = []): array
    {
        return array_merge([
            'company_id' => $company->getKey(),
            'payment_id' => $paymentId,
            'finance_entry_id' => $entryId,
            'amount_minor' => 50000,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides);
    }

    /**
     * Model sözleşmesi: hesaplanan ve sahiplik alanları toplu atanamaz.
     */
    public function test_ownership_columns_are_not_mass_assignable(): void
    {
        $this->assertNotContains('company_id', (new Payment)->getFillable());
        $this->assertNotContains('voided_at', (new Payment)->getFillable());
        $this->assertNotContains('company_id', (new PaymentAllocation)->getFillable());
    }

    public function test_both_models_use_the_company_tenant_scope(): void
    {
        foreach ([Payment::class, PaymentAllocation::class] as $model) {
            $this->assertContains(
                \App\Models\Concerns\BelongsToCompany::class,
                class_uses_recursive($model),
                $model.' tenant scope trait\'ini kullanmıyor.'
            );
        }
    }
}
