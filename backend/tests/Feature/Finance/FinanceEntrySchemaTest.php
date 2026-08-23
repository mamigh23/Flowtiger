<?php

namespace Tests\Feature\Finance;

use App\Models\Company;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Customer;
use App\Models\FinanceEntry;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * AŞAMA 7 / Adım 3 — finans kaydının ŞEMA sözleşmesi.
 *
 * Bu dosya API'ye bakmaz; veritabanının kendisine bakar. Burada kanıtlanan
 * kurallar uygulama katmanı yanlış yazılsa bile geçerli kalmalıdır — bir
 * güvenlik/bütünlük kuralının tek savunması uygulama kodu olmamalı
 * (company_users'daki rol CHECK kısıtıyla aynı yaklaşım).
 *
 * PARA TEMSİLİ (Finance Foundation §A1): tüm parasal alanlar `bigint`
 * MINOR UNIT'tir ve adları `*_minor` ile biter. Ondalık ya da kayan nokta
 * sütun YOKTUR.
 *
 * HER PARASAL KAYIT PARA BİRİMİ TAŞIR (§A2): `currency` NOT NULL'dur ve
 * MVP'de CHECK ile 'TRY'ye kısıtlanır. Kolonun bugünden var olması,
 * çoklu para birimine geçişte geçmiş satırların anlamının belirsiz
 * kalmamasını sağlar.
 *
 * KDV ORANI NULLABLE'dır ve bu bilinçlidir (§A4):
 *   null → kayıt KDV bilgisi TAŞIMIYOR (uygulanmıyor/bilinmiyor)
 *   0    → KDV var, oranı sıfır
 * İkisini tek değere indirmek "KDV'siz mi, girilmemiş mi" sorusunu
 * cevapsız bırakırdı.
 */
class FinanceEntrySchemaTest extends TestCase
{
    use RefreshDatabase;

    private const MONEY_COLUMNS = ['net_minor', 'vat_minor', 'gross_minor'];

    private const TABLE = 'finance_entries';

    // =================================================================
    // SÜTUNLARIN VARLIĞI VE TİPLERİ
    // =================================================================

    public function test_the_table_has_all_required_columns(): void
    {
        foreach ([
            'id',
            'company_id',
            'customer_id',
            'direction',
            'financial_date',
            'category',
            'note',
            'net_minor',
            'vat_rate_bp',
            'vat_minor',
            'gross_minor',
            'currency',
            'voided_at',
            'void_reason',
            'created_at',
            'updated_at',
        ] as $column) {
            $this->assertTrue(
                Schema::hasColumn(self::TABLE, $column),
                self::TABLE." tablosunda '$column' sütunu yok."
            );
        }
    }

    /**
     * PARASAL SÜTUNLAR TAM SAYIDIR.
     *
     * `numeric`/`decimal` bir sütun buraya girerse, PHP tarafında string
     * olarak okunur ve üzerindeki her aritmetik sessizce float'a düşer —
     * Money değer nesnesinin var oluş sebebi tam olarak budur. Tip
     * iddiası bunu şemada yakalar.
     */
    public function test_monetary_columns_are_integers_not_decimals(): void
    {
        foreach (self::MONEY_COLUMNS as $column) {
            $this->assertIntegerColumn($column);
        }
    }

    public function test_the_vat_rate_is_stored_as_an_integer_basis_point(): void
    {
        $this->assertIntegerColumn('vat_rate_bp');
    }

    /**
     * Sütun TAM SAYI mı?
     *
     * PostgreSQL sürücüsü tip adlarını kendi yerel biçiminde döndürür:
     * bigint → int8, integer → int4, smallint → int2. İkisi de kabul
     * edilir çünkü ikisi de AYNI ŞEYİ söyler.
     *
     * BEYAZ LİSTE, kara liste değil. "numeric olmasın" diye yazsaydık,
     * yarın eklenen `money` ya da `float8` gibi bir tip sessizce geçerdi.
     * Beyaz liste yalnızca kanıtlanmış tam sayı tiplerini kabul eder;
     * tanımadığı her tip testi düşürür — ki asıl korunmak istenen budur
     * (§A1: ondalık ya da kayan nokta sütun YOKTUR).
     */
    private function assertIntegerColumn(string $column): void
    {
        $type = Schema::getColumnType(self::TABLE, $column);

        $this->assertContains(
            $type,
            ['bigint', 'int8', 'integer', 'int4', 'smallint', 'int2'],
            "$column sütunu tam sayı olmalı, '$type' bulundu."
        );
    }

    /**
     * Muhasebe tarihi bir TAKVİM GÜNÜDÜR, bir an değil (§A8).
     *
     * Saat taşısaydı, dönem sınırındaki her kayıt "hangi güne ait?"
     * tartışması doğururdu. `created_at` zaten olayın anını taşıyor.
     */
    public function test_the_financial_date_is_a_calendar_date_not_a_timestamp(): void
    {
        $this->assertSame('date', Schema::getColumnType(self::TABLE, 'financial_date'));
    }

    // =================================================================
    // NULL EDİLEBİLİRLİK
    // =================================================================

    public function test_a_customer_is_optional(): void
    {
        $company = Company::factory()->create();

        $id = DB::table(self::TABLE)->insertGetId($this->rawRow($company));

        $this->assertNull(DB::table(self::TABLE)->where('id', $id)->value('customer_id'));
    }

    /**
     * KDV oranı null OLABİLİR: kayıt KDV bilgisi taşımıyor demektir.
     *
     * VE BU HÂLİN KENDİ BÜTÜNLÜK KURALI VARDIR:
     *   vat_rate_bp IS NULL  →  vat_minor = 0  VE  gross_minor = net_minor
     *
     * Yalnızca "net + KDV = brüt" yazsaydık, oranı olmayan ama KDV tutarı
     * taşıyan bir satır (rate=null, vat=500, gross=net+500) geçerli
     * sayılırdı — yani "KDV uygulanmıyor" diyen bir kaydın içinde KDV
     * bulunurdu. İkinci iddia bu deliği kapatıyor.
     */
    public function test_the_vat_rate_is_nullable(): void
    {
        $company = Company::factory()->create();

        $id = DB::table(self::TABLE)->insertGetId(
            $this->rawRow($company, [
                'vat_rate_bp' => null,
                'vat_minor' => 0,
                'gross_minor' => 100000,
            ])
        );

        $this->assertNull(DB::table(self::TABLE)->where('id', $id)->value('vat_rate_bp'));

        // Oranı olmayan bir kayıt KDV tutarı taşıyamaz.
        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow($company, [
            'vat_rate_bp' => null,
            'vat_minor' => 500,
            'gross_minor' => 100500,
        ]));
    }

    /**
     * FİNANS KAYDI FİZİKSEL OLARAK SİLİNMEZ; İPTAL EDİLİR.
     *
     * `voided_at` boşken kayıt aktiftir. İptal, satırı yok etmez —
     * yalnızca işaretler. Silinmiş bir gelir kaydı geçmiş bir dönemin
     * toplamını sessizce değiştirirdi; iptal edilmiş bir kayıt ise
     * görünür kalır ve neden iptal edildiği okunabilir.
     *
     * Durum SAKLANMAZ, zaman damgasından OKUNUR — InvitationStatus'taki
     * kararla aynı: "iki kaynaktan türeyen bir gerçek, er ya da geç
     * ikiye ayrılır".
     */
    public function test_the_void_columns_are_nullable(): void
    {
        $company = Company::factory()->create();

        $id = DB::table(self::TABLE)->insertGetId($this->rawRow($company));
        $row = DB::table(self::TABLE)->where('id', $id)->first();

        $this->assertNull($row->voided_at);
        $this->assertNull($row->void_reason);
    }

    public function test_the_company_is_required(): void
    {
        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow(null));
    }

    public function test_the_currency_is_required(): void
    {
        $company = Company::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow($company, ['currency' => null]));
    }

    // =================================================================
    // VERİTABANI KISITLARI
    // =================================================================

    /**
     * `direction` yalnızca in/out olabilir — CHECK kısıtıyla.
     *
     * company_users.role için verilen kararla aynı: geçerli değerler
     * kümesi uygulama katmanının insafına bırakılmaz. Uygulama bir gün
     * yanlış yazsa bile veritabanı bozuk satırı kabul etmemeli.
     */
    public function test_an_unknown_direction_is_rejected_by_the_database(): void
    {
        $company = Company::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow($company, ['direction' => 'sideways']));
    }

    public function test_both_valid_directions_are_accepted(): void
    {
        $company = Company::factory()->create();

        foreach (['in', 'out'] as $direction) {
            $id = DB::table(self::TABLE)->insertGetId($this->rawRow($company, ['direction' => $direction]));

            $this->assertSame($direction, DB::table(self::TABLE)->where('id', $id)->value('direction'));
        }
    }

    /**
     * MVP YALNIZCA TRY (§A2).
     *
     * Kısıt veritabanında durur; çoklu para birimine geçiş, kısıtı
     * kaldırmak ve dönüşüm alanları eklemekten ibaret olur — geçmiş
     * satırların anlamı zaten etiketlidir.
     */
    public function test_a_non_turkish_lira_currency_is_rejected_by_the_database(): void
    {
        $company = Company::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow($company, ['currency' => 'EUR']));
    }

    /**
     * NET TUTAR EKSİ OLAMAZ.
     *
     * Money değer nesnesi negatifi TİP olarak kabul eder (kalan bakiye
     * eksiye düşebilir) ama bu ALAN kabul etmez — §A1'deki ayrımın
     * uygulaması: "negatifliği yasaklamak tipin değil alanın işidir".
     *
     * Sebep: yön zaten `direction` ile taşınıyor. Eksi tutarlı bir 'out'
     * kaydı ile artı tutarlı bir 'in' kaydı aynı şeyi iki farklı biçimde
     * anlatırdı ve her rapor ikisini birden düşünmek zorunda kalırdı.
     */
    public function test_a_negative_net_amount_is_rejected_by_the_database(): void
    {
        $company = Company::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow($company, ['net_minor' => -1]));
    }

    public function test_a_negative_vat_rate_is_rejected_by_the_database(): void
    {
        $company = Company::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow($company, ['vat_rate_bp' => -1]));
    }

    // =================================================================
    // İLİŞKİLER
    // =================================================================

    public function test_deleting_a_company_removes_its_entries(): void
    {
        $company = Company::factory()->create();

        DB::table(self::TABLE)->insert($this->rawRow($company));

        $company->delete();

        $this->assertSame(0, DB::table(self::TABLE)->count());
    }

    /**
     * Müşteri silinince kayıt SİLİNMEZ, bağlantı kopar.
     *
     * Gelir kaydı, müşterisi sistemden silinse bile geçerli bir mali
     * kayıttır ve dönem toplamından düşmemelidir. Cascade delete, geçmiş
     * bir dönemin toplamını geriye dönük değiştirirdi.
     */
    public function test_deleting_a_customer_detaches_the_entry_but_keeps_it(): void
    {
        $company = Company::factory()->create();
        $customer = Customer::factory()->forCompany($company)->create();

        DB::table(self::TABLE)->insert($this->rawRow($company, ['customer_id' => $customer->getKey()]));

        $customer->delete();

        $this->assertSame(1, DB::table(self::TABLE)->count());
        $this->assertNull(DB::table(self::TABLE)->value('customer_id'));
    }

    // =================================================================
    // MODEL SÖZLEŞMESİ
    // =================================================================

    /**
     * Hesaplanan alanlar TOPLU ATANAMAZ.
     *
     * vat_minor ve gross_minor sunucuda VatCalculator ile üretilir;
     * istemciden gelen bir değer onların yerine geçemez. Fillable
     * olsalardı, gövdesine `gross_minor` koyan bir istek belgenin
     * toplamını uydurabilirdi.
     *
     * company_id de aynı sebeple dışarıdadır (Anayasa §9).
     */
    public function test_computed_and_ownership_columns_are_not_mass_assignable(): void
    {
        $fillable = (new FinanceEntry)->getFillable();

        foreach (['company_id', 'vat_minor', 'gross_minor'] as $column) {
            $this->assertNotContains(
                $column,
                $fillable,
                "FinanceEntry::\$fillable '$column' alanını içermemeli."
            );
        }
    }

    public function test_the_model_uses_the_company_tenant_scope(): void
    {
        $this->assertContains(
            BelongsToCompany::class,
            class_uses_recursive(FinanceEntry::class),
            'FinanceEntry tenant scope trait\'ini kullanmıyor.'
        );
    }

    /**
     * Parasal alanlar model üzerinde de TAM SAYI olarak okunur.
     *
     * Postgres `bigint`i PDO string olarak döndürebilir; cast yoksa
     * `$entry->net_minor` bir string olur ve ilk aritmetikte sessizce
     * float'a döner.
     */
    public function test_monetary_attributes_are_cast_to_integers(): void
    {
        $company = Company::factory()->create();
        DB::table(self::TABLE)->insert($this->rawRow($company));

        $entry = FinanceEntry::withoutTenantScope('şema testi: tenant context kurulmadı')->first();

        foreach (self::MONEY_COLUMNS as $column) {
            $this->assertIsInt($entry->{$column}, "$column tam sayıya cast edilmemiş.");
        }
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function rawRow(?Company $company, array $overrides = []): array
    {
        return array_merge([
            'company_id' => $company?->getKey(),
            'customer_id' => null,
            'direction' => 'out',
            'financial_date' => '2026-08-22',
            'category' => 'Kira',
            'note' => null,
            'amount_basis' => 'net',
            'net_minor' => 100000,
            'vat_rate_bp' => 2000,
            'vat_minor' => 20000,
            'gross_minor' => 120000,
            'currency' => 'TRY',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides);
    }
}
