<?php

namespace Tests\Feature\Finance;

use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * AŞAMA 7 / Adım 2 — mali kimlik şemasının kanıtı.
 *
 * Bu dosya API'ye bakmaz; SÖZLEŞMENİN ALTINDAKİ ZEMİNE bakar: sütunlar
 * var mı, boş bırakılabiliyor mu, varsayılanlar doğru mu.
 *
 * MEVCUT KAYITLARI GEÇERSİZ KILMAMA KURALI (Finance Foundation §F1):
 * Mali kimlik alanları NULLABLE'dır. Fatura kesiminde hangi alanların
 * zorunlu olduğu bir İŞ KURALIDIR ve kesim anında doğrulanır — kayıt
 * anında değil. Aksi halde bugün var olan her şirket ve her müşteri, bu
 * migration çalıştığı anda geçersiz hâle gelirdi.
 *
 * İKİ İSTİSNA: timezone ve default_currency NOT NULL'dur ve varsayılan
 * taşır. Sebebi §A8 ve §A2: dönem sınırı ve para birimi "bilinmiyor"
 * olamaz — bilinmediğinde her hesap tartışmalı olur. Varsayılanı olan
 * bir alan, boş bırakılabilen bir alandan güvenlidir.
 */
class FiscalIdentitySchemaTest extends TestCase
{
    use RefreshDatabase;

    private const COMPANY_FISCAL_COLUMNS = [
        'legal_name',
        'tax_number',
        'tax_office',
        'billing_address',
        'country',
        'timezone',
        'default_currency',
    ];

    private const CUSTOMER_FISCAL_COLUMNS = [
        'billing_email',
        'tax_number',
        'tax_office',
        'billing_address',
        'country',
    ];

    // =================================================================
    // SÜTUNLARIN VARLIĞI
    // =================================================================

    public function test_companies_table_has_the_fiscal_identity_columns(): void
    {
        foreach (self::COMPANY_FISCAL_COLUMNS as $column) {
            $this->assertTrue(
                Schema::hasColumn('companies', $column),
                "companies tablosunda '$column' sütunu yok."
            );
        }
    }

    public function test_customers_table_has_the_billing_identity_columns(): void
    {
        foreach (self::CUSTOMER_FISCAL_COLUMNS as $column) {
            $this->assertTrue(
                Schema::hasColumn('customers', $column),
                "customers tablosunda '$column' sütunu yok."
            );
        }
    }

    // =================================================================
    // MEVCUT KAYITLAR GEÇERLİ KALIR
    // =================================================================

    /**
     * Bu testin asıl konusu factory değil, GEÇMİŞ VERİDİR.
     *
     * Factory mali kimlik alanlarını hiç bilmiyor — tıpkı bu migration'dan
     * önce oluşturulmuş gerçek kayıtlar gibi. Çalışmaya devam ediyorsa,
     * migration mevcut veriyi geçersiz kılmıyor demektir.
     */
    public function test_a_company_can_still_be_created_without_any_fiscal_identity(): void
    {
        $company = Company::factory()->create(['name' => 'Kaplan Yazılım']);

        $this->assertSame('Kaplan Yazılım', $company->fresh()->name);
        $this->assertNull($company->fresh()->legal_name);
        $this->assertNull($company->fresh()->tax_number);
        $this->assertNull($company->fresh()->tax_office);
        $this->assertNull($company->fresh()->billing_address);
        $this->assertNull($company->fresh()->country);
    }

    public function test_a_customer_can_still_be_created_without_any_billing_identity(): void
    {
        $company = Company::factory()->create();
        $customer = Customer::factory()->forCompany($company)->create(['name' => 'Zeynep Kaya']);

        $fresh = $customer->fresh();

        $this->assertSame('Zeynep Kaya', $fresh->name);
        $this->assertNull($fresh->billing_email);
        $this->assertNull($fresh->tax_number);
        $this->assertNull($fresh->tax_office);
        $this->assertNull($fresh->billing_address);
        $this->assertNull($fresh->country);
    }

    // =================================================================
    // VARSAYILANLAR
    // =================================================================

    /**
     * Saat dilimi BİLİNMİYOR olamaz.
     *
     * Dönem sınırı (§A8) şirket saat diliminde hesaplanır: 31 Aralık
     * 23:30'da girilen kayıt, sunucu UTC'de 1 Ocak olsa bile Aralık
     * dönemine aittir. Saat dilimi null olsaydı bu hesap her kayıt için
     * tartışmalı hâle gelirdi.
     */
    public function test_the_default_timezone_is_europe_istanbul(): void
    {
        $company = Company::factory()->create();

        $this->assertSame('Europe/Istanbul', $company->fresh()->timezone);
    }

    public function test_the_default_currency_is_turkish_lira(): void
    {
        $company = Company::factory()->create();

        $this->assertSame('TRY', $company->fresh()->default_currency);
    }

    /**
     * Varsayılanlar VERİTABANI seviyesindedir, model seviyesinde değil.
     *
     * Model varsayılanı, veritabanına doğrudan yazan bir seeder ya da
     * migration'ı kapsamaz. Sütunun kendisi NOT NULL DEFAULT taşımalı ki
     * kaydın nereden geldiğinden bağımsız olarak dolu olsun.
     */
    public function test_the_defaults_are_applied_by_the_database_not_the_model(): void
    {
        $id = \Illuminate\Support\Facades\DB::table('companies')->insertGetId([
            'name' => 'Ham Insert',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $row = \Illuminate\Support\Facades\DB::table('companies')->where('id', $id)->first();

        $this->assertSame('Europe/Istanbul', $row->timezone);
        $this->assertSame('TRY', $row->default_currency);
    }

    /**
     * Para birimi CANONICAL ISO KODU olarak saklanır: 'TRY'.
     *
     * Veritabanında enum değil düz string durur (§A2). Enum sınırlarda
     * kullanılır — validation, servis mantığı — modelin içinde değil.
     * Bu, Role enum'ının pivot'ta ham string kalma kararıyla aynı ilkedir.
     */
    public function test_the_currency_is_stored_as_a_canonical_iso_code(): void
    {
        $company = Company::factory()->create();

        $stored = \Illuminate\Support\Facades\DB::table('companies')
            ->where('id', $company->getKey())
            ->value('default_currency');

        $this->assertIsString($stored);
        $this->assertSame('TRY', $stored);
        $this->assertSame(3, strlen($stored));
    }

    // =================================================================
    // MASS ASSIGNMENT KORUMASI
    // =================================================================

    /**
     * Mali kimlik alanları TOPLU ATANAMAZ.
     *
     * company_id ve customer_no için verilen kararla aynı gerekçe (§9):
     * bu alanlar bir formun gövdesinden değil, kendi ucundan ve kendi
     * doğrulamasından geçerek yazılır. Fillable olsalardı, gövdesine
     * fazladan alan koyan herhangi bir istek onları sessizce
     * değiştirebilirdi.
     */
    public function test_company_fiscal_columns_are_not_mass_assignable(): void
    {
        $fillable = (new Company)->getFillable();

        foreach (self::COMPANY_FISCAL_COLUMNS as $column) {
            $this->assertNotContains(
                $column,
                $fillable,
                "Company::\$fillable '$column' alanını içermemeli."
            );
        }
    }

    public function test_customer_fiscal_columns_are_not_mass_assignable(): void
    {
        $fillable = (new Customer)->getFillable();

        foreach (self::CUSTOMER_FISCAL_COLUMNS as $column) {
            $this->assertNotContains(
                $column,
                $fillable,
                "Customer::\$fillable '$column' alanını içermemeli."
            );
        }
    }

    // =================================================================
    // TENANT İZOLASYONU DEĞİŞMEDİ
    // =================================================================

    /**
     * REGRESYON: mali kimlik eklemek tenant scope'unu etkilemez.
     *
     * Müşteri hâlâ aktif şirkete göre filtrelenir; yeni sütunlar bu
     * mekanizmanın dışındadır.
     */
    public function test_customer_tenant_scope_is_unaffected_by_the_new_columns(): void
    {
        $userA = User::factory()->create();
        $companyA = Company::factory()->withOwner($userA)->create();
        $companyB = Company::factory()->create();

        Customer::factory()->forCompany($companyA)->create(['name' => 'A Müşterisi']);
        Customer::factory()->forCompany($companyB)->create(['name' => 'B Müşterisi']);

        app(\App\Services\CompanySelectionService::class)->select($userA, $companyA);

        // setForUser(User, Company): context'in TEK giriş noktasıdır ve
        // şirketi de ister — üyeliği kendisi doğrular, doğrulayamazsa
        // atama yapmaz (CompanyContext §5, §21). Aktif şirketi kullanıcıdan
        // türetmez; hangi şirkete girildiği açıkça söylenir.
        app(\App\Services\CompanyContext::class)->setForUser($userA, $companyA);

        $names = Customer::query()->pluck('name')->all();

        $this->assertSame(['A Müşterisi'], $names);
    }
}
