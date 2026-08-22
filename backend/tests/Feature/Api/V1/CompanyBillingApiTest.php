<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Scopes\CompanyScope;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * AŞAMA 7 / Adım 2 — şirketin mali kimliği.
 *
 *   PATCH /api/v1/companies/{company}/billing
 *
 * NEDEN AYRI BİR UÇ, NEDEN PUT /companies/{company} DEĞİL:
 * Depoda bu sorunun cevabı zaten verilmiş — rol değişimi
 * PUT /members/{user}'dan ayrılıp PATCH /members/{user}/role yapılmıştı;
 * gerekçesi "rol kaydın en tehlikeli özniteliği ve kazara başka bir
 * güncellemenin içine karışmamalı" idi. Mali kimlik için aynı gerekçe
 * geçerlidir: vergi numarası fatura kesiminde yasal olarak bağlayıcıdır
 * ve bir ad düzenlemesinin yan etkisi olarak değişmemelidir.
 *
 * PATCH'TİR, PUT DEĞİL: gövde kaydın tamamını değil, DEĞİŞTİRİLECEK
 * ALANLARI tanımlar. Gönderilmeyen alan olduğu gibi kalır. PUT olsaydı,
 * yalnızca vergi dairesini düzeltmek isteyen bir istek, göndermediği
 * vergi numarasını silerdi.
 *
 * YETKİ: OWNER-ONLY. Şirketin mali kimliği şirket yapılandırmasıdır;
 * members/invitations/audit ile aynı sınıfa girer.
 *
 * company.context YOK: companies uçları bilinçli olarak context'in
 * dışındadır (CompanyController docblock'u). Yetki, route'tan çözülen
 * ŞİRKETTEKİ role bakılarak verilir — aktif şirkete değil.
 *
 * ÜYE OLMAYAN KULLANICI 403 ALIR, 404 DEĞİL. Bu, select ucundaki kararla
 * aynıdır: 404 dönmek "böyle bir şirket var mı?" sorusunu yanıtlardı.
 */
class CompanyBillingApiTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Company $company;

    /** @var array<int, string> user id → plaintext token */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->company = Company::factory()->withOwner($this->owner)->create(['name' => 'Kaplan Yazılım']);
    }

    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    private function uri(?Company $company = null): string
    {
        return '/api/v1/companies/'.($company ?? $this->company)->getKey().'/billing';
    }

    /**
     * @return array<string, mixed>
     */
    private function fullPayload(): array
    {
        return [
            'legal_name' => 'Kaplan Yazılım Anonim Şirketi',
            'tax_number' => '1234567890',
            'tax_office' => 'Kadıköy',
            'billing_address' => 'Caferağa Mah. No:1 Kadıköy/İstanbul',
            'country' => 'TR',
            'timezone' => 'Europe/Istanbul',
            'default_currency' => 'TRY',
        ];
    }

    // =================================================================
    // GÜNCELLEME
    // =================================================================

    public function test_an_owner_can_set_the_fiscal_identity(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->uri(), $this->fullPayload())
            ->assertOk();

        $company = $this->company->fresh();

        $this->assertSame('Kaplan Yazılım Anonim Şirketi', $company->legal_name);
        $this->assertSame('1234567890', $company->tax_number);
        $this->assertSame('Kadıköy', $company->tax_office);
        $this->assertSame('TR', $company->country);
    }

    public function test_the_response_returns_the_updated_fiscal_identity(): void
    {
        $payload = $this->apiAs($this->owner)
            ->patchJson($this->uri(), $this->fullPayload())
            ->assertOk()
            ->json('data');

        $this->assertSame('Kaplan Yazılım Anonim Şirketi', $payload['legal_name']);
        $this->assertSame('1234567890', $payload['tax_number']);
        $this->assertSame('Europe/Istanbul', $payload['timezone']);
        $this->assertSame('TRY', $payload['default_currency']);
    }

    /**
     * Yanıt bir WHITELIST'tir.
     *
     * Şirket modeline yarın eklenecek bir sütun (ör. bir sağlayıcı API
     * anahtarı) kendiliğinden dışarı sızmamalı.
     */
    public function test_the_response_exposes_only_whitelisted_fields(): void
    {
        $payload = $this->apiAs($this->owner)
            ->patchJson($this->uri(), $this->fullPayload())
            ->assertOk()
            ->json('data');

        $keys = array_keys($payload);
        sort($keys);

        $this->assertSame(
            [
                'billing_address',
                'country',
                'default_currency',
                'id',
                'legal_name',
                'name',
                'tax_number',
                'tax_office',
                'timezone',
            ],
            $keys,
            'CompanyBillingResource beklenmeyen bir alan döndürüyor.'
        );
    }

    /**
     * PATCH SEMANTİĞİ: gönderilmeyen alana DOKUNULMAZ.
     *
     * Bu ucun PUT olmamasının tek sebebi budur. Yalnızca vergi dairesini
     * düzeltmek isteyen bir istek, göndermediği vergi numarasını
     * silmemelidir.
     */
    public function test_an_omitted_field_is_left_untouched(): void
    {
        $this->apiAs($this->owner)->patchJson($this->uri(), $this->fullPayload())->assertOk();

        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['tax_office' => 'Beşiktaş'])
            ->assertOk();

        $company = $this->company->fresh();

        $this->assertSame('Beşiktaş', $company->tax_office);
        $this->assertSame('1234567890', $company->tax_number, 'Gönderilmeyen alan silindi.');
        $this->assertSame('Kaplan Yazılım Anonim Şirketi', $company->legal_name);
    }

    /**
     * AÇIKÇA null gönderilen alan TEMİZLENİR.
     *
     * "Alana dokunma" ile "alanı boşalt" arasındaki fark, PATCH'te
     * alanın gövdede bulunup bulunmamasıyla anlatılır.
     */
    public function test_an_explicit_null_clears_the_field(): void
    {
        $this->apiAs($this->owner)->patchJson($this->uri(), $this->fullPayload())->assertOk();

        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['tax_office' => null])
            ->assertOk();

        $this->assertNull($this->company->fresh()->tax_office);
    }

    /**
     * Boş dize null'a normalize edilir.
     *
     * "" ve null ikisi de "değer yok" demektir; ikisini de saklamak,
     * yokluğun iki farklı temsilini yaratır ve her sorgu ikisini birden
     * kontrol etmek zorunda kalır. Normalizasyon deseni depoda zaten var
     * (ProfileUpdateRequest e-postayı doğrulamadan önce normalize eder).
     */
    public function test_an_empty_string_is_normalised_to_null(): void
    {
        $this->apiAs($this->owner)->patchJson($this->uri(), $this->fullPayload())->assertOk();

        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['tax_number' => '  '])
            ->assertOk();

        $this->assertNull($this->company->fresh()->tax_number);
    }

    // =================================================================
    // DOĞRULAMA
    // =================================================================

    public function test_an_invalid_timezone_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['timezone' => 'Mars/Olympus'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('timezone');
    }

    public function test_a_valid_alternative_timezone_is_accepted(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['timezone' => 'UTC'])
            ->assertOk();

        $this->assertSame('UTC', $this->company->fresh()->timezone);
    }

    /**
     * MVP YALNIZCA TRY. Currency enum'ı ikinci bir üye taşısa bile
     * kalıcı katmanda tek para birimi vardır (§A2).
     */
    public function test_a_non_turkish_lira_currency_is_rejected_in_the_mvp(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['default_currency' => 'EUR'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('default_currency');
    }

    public function test_an_unknown_currency_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['default_currency' => 'XXX'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('default_currency');
    }

    /**
     * REGRESYON: şirket ADI bu uçtan değiştirilemez.
     *
     * Ad mali kimlik değildir ve bu ucun gövdesinde tanınmaz. Tanınsaydı,
     * "yalnızca mali kimlik" sözü ilk günden bozulurdu.
     */
    public function test_the_company_name_cannot_be_changed_through_this_endpoint(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['name' => 'Başka Bir Ad'])
            ->assertOk();

        $this->assertSame('Kaplan Yazılım', $this->company->fresh()->name);
    }

    // =================================================================
    // YETKİ
    // =================================================================

    public function test_a_member_cannot_change_the_fiscal_identity(): void
    {
        $member = User::factory()->create();
        $this->company->users()->attach($member, ['role' => 'member']);

        $this->apiAs($member)
            ->patchJson($this->uri(), ['tax_number' => '9999999999'])
            ->assertForbidden();

        $this->assertNull($this->company->fresh()->tax_number);
    }

    /**
     * Üye olmayan kullanıcı 403 alır, 404 DEĞİL.
     *
     * 404 dönmek "böyle bir şirket var mı?" sorusunu yanıtlardı ve id
     * taramasıyla sistemdeki şirketler sayılabilirdi. select ucundaki
     * kararla aynı.
     */
    public function test_a_stranger_gets_forbidden_not_found(): void
    {
        $stranger = User::factory()->create();

        $this->apiAs($stranger)
            ->patchJson($this->uri(), ['tax_number' => '9999999999'])
            ->assertForbidden();
    }

    public function test_another_companys_fiscal_identity_cannot_be_changed(): void
    {
        $otherOwner = User::factory()->create();
        $otherCompany = Company::factory()->withOwner($otherOwner)->create();

        $this->apiAs($this->owner)
            ->patchJson($this->uri($otherCompany), ['tax_number' => '9999999999'])
            ->assertForbidden();

        $this->assertNull($otherCompany->fresh()->tax_number);
    }

    public function test_it_requires_authentication(): void
    {
        $this->patchJson($this->uri(), ['tax_number' => '1234567890'])
            ->assertUnauthorized();
    }

    // =================================================================
    // AUDIT
    // =================================================================

    /**
     * Mali kimlik değişikliği iz bırakır.
     *
     * "Bu şirketin vergi numarasını kim, ne zaman değiştirdi" sorusu
     * fatura kesildikten sonra sorulacak bir sorudur ve cevapsız
     * kalmamalıdır.
     */
    public function test_a_fiscal_identity_change_is_audited(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['tax_number' => '1234567890'])
            ->assertOk();

        $log = AuditLog::withoutGlobalScope(CompanyScope::class)
            ->where('action', AuditAction::CompanyBillingUpdated->value)
            ->latest('id')
            ->first();

        $this->assertNotNull($log, 'company.billing_updated kaydı bulunamadı.');
        $this->assertSame($this->company->getKey(), (int) $log->company_id);
        $this->assertSame($this->owner->getKey(), (int) $log->user_id);
    }

    public function test_the_audit_entry_carries_the_old_and_new_values(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['tax_number' => '1111111111'])
            ->assertOk();

        $this->apiAs($this->owner)
            ->patchJson($this->uri(), ['tax_number' => '2222222222'])
            ->assertOk();

        $log = AuditLog::withoutGlobalScope(CompanyScope::class)
            ->where('action', AuditAction::CompanyBillingUpdated->value)
            ->latest('id')
            ->first();

        $this->assertSame('1111111111', $log->old_values['tax_number'] ?? null);
        $this->assertSame('2222222222', $log->new_values['tax_number'] ?? null);
    }

    /**
     * Başarısız bir istek iz BIRAKMAZ.
     *
     * Reddedilen bir değişiklik olmamış bir olaydır; audit'e yazmak
     * "değişti" izlenimi verirdi.
     */
    public function test_a_rejected_change_leaves_no_audit_entry(): void
    {
        $member = User::factory()->create();
        $this->company->users()->attach($member, ['role' => 'member']);

        $this->apiAs($member)
            ->patchJson($this->uri(), ['tax_number' => '9999999999'])
            ->assertForbidden();

        $this->assertSame(
            0,
            AuditLog::withoutGlobalScope(CompanyScope::class)
                ->where('action', AuditAction::CompanyBillingUpdated->value)
                ->count()
        );
    }

    // =================================================================
    // MEVCUT SÖZLEŞME KORUNUYOR
    // =================================================================

    /**
     * REGRESYON: companies listesi değişmedi.
     *
     * Mali kimlik alanları CompanyResource'a EKLENMEDİ — ayrı bir uç ve
     * ayrı bir resource var. Liste ucunun şekli bozulursa web ve Flutter
     * istemcileri etkilenirdi.
     */
    public function test_the_company_list_contract_is_unchanged(): void
    {
        $payload = $this->apiAs($this->owner)
            ->getJson('/api/v1/companies')
            ->assertOk()
            ->json('data.0');

        $keys = array_keys($payload);
        sort($keys);

        $this->assertSame(['created_at', 'id', 'name', 'role'], $keys);
    }
}
