<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Enums\Role;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GELEN DAVETLER — kullanıcının KENDİSİNE gönderilenler (uygulama içi).
 *
 * Bu iki uç, davet sisteminin İKİNCİ kapısıdır ve mevcut kapıdan
 * (POST /invitations/accept, e-posta bağlantısı + token) şu noktalarda
 * AYRILIR:
 *
 *   anahtar        token DEĞİL, oturumdaki kullanıcının e-postası
 *   aktif şirket   GEREKMEZ (davet ekranı zaten şirketsiz kullanıcı için)
 *   doğrulama      e-postası doğrulanmamış kullanıcı GİREMEZ (403)
 *
 * Bu yüzden burada kanıtlanması gerekenler, token testlerinden farklıdır:
 *   - e-posta sahipliği gerçekten sorgu düzeyinde mi sınırlı?
 *   - başkasının daveti ile olmayan davet AYNI yanıtı mı veriyor?
 *   - doğrulanmamış kullanıcıya HİÇBİR davet/şirket bilgisi sızıyor mu?
 *   - yanıt gerçekten bir whitelist mi (token/e-posta sızmıyor mu)?
 *   - kabul, aktif şirketi sessizce değiştiriyor mu?
 *
 * LİSTE İLE KABUL AYNI FİLTREYİ KULLANMAZ — bu ayrım testlerin merkezinde:
 *
 *   liste   yalnızca BEKLEYEN ve süresi dolmamış davetleri döndürür
 *   kabul   daveti durum filtresi OLMADAN bulur, sonra durumu bildirir
 *
 * Yani kullanıcının KENDİ süresi dolmuş/iptal edilmiş/kabul edilmiş
 * daveti listede YOKTUR ama kabulde 404 değil, mevcut domain davranışı
 * olan 410 + durumu söyleyen kodu verir. Başkasının daveti ise — hangi
 * durumda olursa olsun — 404'tür: orada durumu açıklamak, "bu id'de bir
 * davet var" bilgisini sızdıran bir yan kanal olurdu.
 *
 * DİKKAT — ŞİRKET BAŞINA TEK BEKLEYEN DAVET: `invitations` tablosunda
 * (company_id, email) üzerinde, yalnızca bekleyen satırları kapsayan bir
 * partial unique index vardır. Aynı adrese birden çok bekleyen davet
 * kurulacaksa bunlar FARKLI şirketlere ait olmalıdır; aksi hâlde testin
 * kendisi kısıtı ihlal eder.
 */
class IncomingInvitationApiTest extends TestCase
{
    use RefreshDatabase;

    private const LIST_URI = '/api/v1/invitations/incoming';

    private User $owner;

    private Company $company;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->company = Company::factory()->withOwner($this->owner)->create(['name' => 'Sirket A']);

        $this->giveActiveCompany($this->owner);
        $this->clearAuditLog();
    }

    // ---------------------------------------------------------------
    // YARDIMCILAR
    // ---------------------------------------------------------------

    private function acceptUri(Invitation $invitation): string
    {
        return '/api/v1/invitations/'.$invitation->getKey().'/accept';
    }

    private function giveActiveCompany(User $user, ?Company $company = null): void
    {
        app(CompanySelectionService::class)->select($user, $company ?? $this->company);
        app(CompanyContext::class)->clear();
    }

    private function clearAuditLog(): void
    {
        DB::table('audit_logs')->delete();
    }

    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    /**
     * Kimliksiz istek.
     *
     * apiAs() Authorization başlığını $this üzerinde KALICI olarak
     * bırakır; yalnızca Auth::forgetGuards() çağırmak yetmez, başlık hâlâ
     * gönderilir ve istek sessizce kimlikli çalışır. Bu, testi fark
     * edilmeden anlamsızlaştırırdı (bkz. InvitationAcceptTest).
     */
    private function asGuest(): self
    {
        Auth::forgetGuards();

        return $this->flushHeaders();
    }

    /** Her çağrıda AYRI bir şirket — partial unique index'e takılmamak için. */
    private function otherCompany(string $name): Company
    {
        return Company::factory()->withOwner($this->owner)->create(['name' => $name]);
    }

    private function invitationFor(string $email, ?Company $company = null, Role $role = Role::Member): Invitation
    {
        return Invitation::factory()
            ->forCompany($company ?? $this->company)
            ->invitedBy($this->owner)
            ->forEmail($email)
            ->asRole($role)
            ->create();
    }

    private function roleInDatabase(User $user, ?Company $company = null): ?string
    {
        return DB::table('company_users')
            ->where('company_id', ($company ?? $this->company)->getKey())
            ->where('user_id', $user->getKey())
            ->first()?->role;
    }

    /**
     * @return list<object>
     */
    private function auditRows(AuditAction $action): array
    {
        return DB::table('audit_logs')->where('action', $action->value)->orderBy('id')->get()->all();
    }

    // ===============================================================
    // LİSTE — ERİŞİM
    // ===============================================================

    public function test_an_unauthenticated_request_is_rejected(): void
    {
        $this->asGuest()
            ->getJson(self::LIST_URI)
            ->assertUnauthorized();
    }

    public function test_an_unverified_user_gets_a_forbidden_response(): void
    {
        $user = User::factory()->unverified()->create(['email' => 'dogrulanmamis@flowtiger.test']);

        $this->invitationFor('dogrulanmamis@flowtiger.test');

        $this->apiAs($user)
            ->getJson(self::LIST_URI)
            ->assertStatus(403)
            ->assertJsonPath('code', 'email_verification_required');
    }

    /**
     * DOĞRULANMAMIŞ KULLANICIYA HİÇBİR DAVET/ŞİRKET BİLGİSİ SIZMAZ.
     *
     * 403 dönmek tek başına yetmez; GÖVDENİN de boş olması gerekir.
     * Doğrulama kontrolü davet sorgusundan ÖNCE yapıldığı için veri hiç
     * okunmaz.
     */
    public function test_an_unverified_response_leaks_no_invitation_or_company_data(): void
    {
        $user = User::factory()->unverified()->create(['email' => 'sizinti@flowtiger.test']);

        $secret = $this->otherCompany('Gizli Sirket');
        $this->invitationFor('sizinti@flowtiger.test', $secret);

        $response = $this->apiAs($user)->getJson(self::LIST_URI)->assertStatus(403);

        $body = $response->getContent();

        $this->assertStringNotContainsString('Gizli Sirket', $body);
        $this->assertStringNotContainsString('sizinti@flowtiger.test', $body);

        // Listelenmiş bir kaynak da yok.
        $this->assertArrayNotHasKey('data', $response->json());
    }

    /**
     * AKTİF ŞİRKETİ OLMAYAN DOĞRULANMIŞ KULLANICI — bu ekranın asıl hedefi.
     *
     * company.context bu uçlarda YOKTUR; davetli henüz hiçbir şirkete üye
     * olmadığı için aktif şirket seçemez — seçemeyeceği için de daveti
     * göremezse ekran hiç çalışmazdı.
     */
    public function test_a_verified_user_without_an_active_company_can_list_invitations(): void
    {
        $user = User::factory()->create(['email' => 'yeni@flowtiger.test']);

        $this->assertNull($user->active_company_id);

        $this->invitationFor('yeni@flowtiger.test');

        $this->apiAs($user)
            ->getJson(self::LIST_URI)
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    // ===============================================================
    // LİSTE — İÇERİK
    // ===============================================================

    public function test_only_own_pending_and_unexpired_invitations_are_listed(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        // Bekleyen — görünmeli.
        $mine = $this->invitationFor('ben@flowtiger.test');

        // Başka adrese gelen davet — GÖRÜNMEMELİ.
        $this->invitationFor('baskasi@flowtiger.test', $this->otherCompany('Sirket B'));

        // Kendi ama artık kullanılamaz durumdaki davetler — GÖRÜNMEMELİ.
        // (Her biri AYRI şirkette: company başına tek bekleyen davet kuralı.)
        $this->invitationFor('ben@flowtiger.test', $this->otherCompany('Sirket C'))
            ->update(['expires_at' => now()->subDay()]);

        $this->invitationFor('ben@flowtiger.test', $this->otherCompany('Sirket D'))
            ->update(['revoked_at' => now()->subHour()]);

        $this->invitationFor('ben@flowtiger.test', $this->otherCompany('Sirket E'))
            ->update(['accepted_at' => now()->subHour()]);

        $response = $this->apiAs($user)->getJson(self::LIST_URI)->assertOk();

        $response->assertJsonCount(1, 'data');
        $this->assertSame($mine->getKey(), $response->json('data.0.id'));
    }

    /**
     * ADRES KARŞILAŞTIRMASI NORMALİZE EDİLİR (§26).
     *
     * "Ben@Flowtiger.test" ile kaydedilmiş adres aynı kişidir; büyük/küçük
     * harf farkı yüzünden davetin sahibine görünmemesi bir hata olurdu.
     */
    public function test_email_matching_is_case_insensitive(): void
    {
        $user = User::factory()->create(['email' => 'Ben@Flowtiger.test']);

        $this->invitationFor('ben@flowtiger.test');

        $this->apiAs($user)
            ->getJson(self::LIST_URI)
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_the_list_response_is_a_whitelist(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        $this->invitationFor('ben@flowtiger.test');

        $response = $this->apiAs($user)->getJson(self::LIST_URI)->assertOk();

        $response->assertJsonStructure([
            'data' => [
                ['id', 'company' => ['id', 'name'], 'role', 'status', 'expires_at', 'created_at'],
            ],
        ]);

        // Sızabilecek alanlar AÇIKÇA yoklanır (§4, §8).
        foreach (['token', 'token_hash', 'email', 'invited_by'] as $forbidden) {
            $response->assertJsonMissingPath('data.0.'.$forbidden);
        }

        // Gövdenin TAMAMINDA da hiçbir sır geçmemeli.
        $body = $response->getContent();
        $this->assertStringNotContainsString('token', $body);
        $this->assertStringNotContainsString('ben@flowtiger.test', $body);
    }

    public function test_the_list_is_paginated(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        foreach (range(1, 5) as $n) {
            $this->invitationFor('ben@flowtiger.test', $this->otherCompany('Sirket '.$n));
        }

        $this->apiAs($user)
            ->getJson(self::LIST_URI.'?per_page=2')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.per_page', 2)
            ->assertJsonPath('meta.total', 5);
    }

    // ===============================================================
    // KABUL — YETKİ VE GİZLİLİK
    // ===============================================================

    public function test_an_unauthenticated_request_cannot_accept(): void
    {
        $invitation = $this->invitationFor('ben@flowtiger.test');

        $this->asGuest()
            ->postJson($this->acceptUri($invitation))
            ->assertUnauthorized();
    }

    public function test_an_unverified_user_cannot_accept(): void
    {
        $user = User::factory()->unverified()->create(['email' => 'ben@flowtiger.test']);

        $invitation = $this->invitationFor('ben@flowtiger.test');

        $this->apiAs($user)
            ->postJson($this->acceptUri($invitation))
            ->assertStatus(403)
            ->assertJsonPath('code', 'email_verification_required');

        // Kabul EDİLMEDİ.
        $this->assertNull($invitation->fresh()->accepted_at);
    }

    /**
     * BAŞKASININ DAVETİ = OLMAYAN DAVET (aynı 404, birebir aynı gövde).
     *
     * 403 dönmek, o id'de bir davetin VAR OLDUĞUNU doğrulardı. Yanıt
     * davetin durumunu ya da şirketini de açıklamamalı.
     */
    public function test_someone_elses_invitation_and_a_missing_one_are_indistinguishable(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        $foreign = $this->invitationFor('baskasi@flowtiger.test', $this->otherCompany('Baska Sirket'));

        $foreignResponse = $this->apiAs($user)->postJson($this->acceptUri($foreign));

        $foreignResponse->assertNotFound()->assertJsonPath('code', 'invitation_not_found');

        $missingResponse = $this->apiAs($user)->postJson('/api/v1/invitations/999999/accept');

        $missingResponse->assertNotFound()->assertJsonPath('code', 'invitation_not_found');

        // Gövdeler BİREBİR aynı.
        $this->assertSame($foreignResponse->getContent(), $missingResponse->getContent());

        // Ve davet tüketilmedi.
        $this->assertNull($foreign->fresh()->accepted_at);
    }

    /**
     * KENDİ ama KULLANILAMAZ davet → 404 DEĞİL, 410 + DURUMU SÖYLEYEN KOD.
     *
     * KABUL İLE LİSTE AYNI SORUYU SORMAZ. Listede bu davetler yoktur
     * (kullanıcıya "kabul edilebilir davetlerim" gösterilir); kabulde ise
     * davet KULLANICININDIR ve neden kabul edilemediği söylenmelidir.
     * 404 dönmek "böyle bir davetin yok" demek olurdu — oysa vardır.
     *
     * 410 Gone tam olarak doğru durumdur: "bu kaynak VARDI, kalıcı olarak
     * geçti". Kod, durumu makine-okunur biçimde taşır
     * (`invitation_` + InvitationStatus değeri) — mevcut token akışıyla
     * AYNI davranış, AYNI kodlar.
     *
     * SIZINTI YOK: bu yanıt yalnızca KENDİ daveti için döner (bkz.
     * bir sonraki test) — kullanıcıya zaten kendi bilgisi hatırlatılır.
     */
    public function test_own_unusable_invitations_return_gone_with_the_matching_status_code(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        $expired = $this->invitationFor('ben@flowtiger.test', $this->otherCompany('Sirket X'));
        $expired->update(['expires_at' => now()->subDay()]);

        $revoked = $this->invitationFor('ben@flowtiger.test', $this->otherCompany('Sirket Y'));
        $revoked->update(['revoked_at' => now()->subHour()]);

        $accepted = $this->invitationFor('ben@flowtiger.test', $this->otherCompany('Sirket Z'));
        $accepted->update(['accepted_at' => now()->subHour()]);

        $cases = [
            [$expired, 'invitation_expired'],
            [$revoked, 'invitation_revoked'],
            [$accepted, 'invitation_accepted'],
        ];

        foreach ($cases as [$invitation, $expectedCode]) {
            $this->apiAs($user)
                ->postJson($this->acceptUri($invitation))
                ->assertStatus(410)
                ->assertJsonPath('code', $expectedCode);
        }
    }

    /**
     * BAŞKASININ KULLANILAMAZ DAVETİ 410 DEĞİL, 404'TÜR.
     *
     * Yukarıdaki 410 yalnızca SAHİPLİK doğrulandıktan sonra döner.
     * Sahiplik geçmiyorsa davetin durumu HİÇ AÇIKLANMAZ: aksi hâlde
     * 410/404 ayrımı, "bu id'de bir davet var" bilgisini sızdıran bir
     * yan kanal olurdu.
     */
    public function test_someone_elses_unusable_invitation_is_still_not_found(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        $foreign = $this->invitationFor('baskasi@flowtiger.test', $this->otherCompany('Baska Sirket'));
        $foreign->update(['revoked_at' => now()->subHour()]);

        $this->apiAs($user)
            ->postJson($this->acceptUri($foreign))
            ->assertNotFound()
            ->assertJsonPath('code', 'invitation_not_found');
    }

    /**
     * SAHİPLİK OTURUMDAN OKUNUR, GÖVDEDEN DEĞİL.
     *
     * Gövdede e-posta gönderilse bile yetki kararını değiştirmez.
     */
    public function test_ownership_is_checked_against_the_session_email_not_the_request_body(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        $invitation = $this->invitationFor('baskasi@flowtiger.test', $this->otherCompany('Baska Sirket'));

        $this->apiAs($user)
            ->postJson($this->acceptUri($invitation), ['email' => 'baskasi@flowtiger.test'])
            ->assertNotFound();

        $this->assertNull($invitation->fresh()->accepted_at);
    }

    // ===============================================================
    // KABUL — BAŞARI
    // ===============================================================

    public function test_a_verified_user_can_accept_their_own_invitation(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        // Kabul ÖNCESİ üye değil.
        $this->assertNull($this->roleInDatabase($user));

        $invitation = $this->invitationFor('ben@flowtiger.test');

        $this->apiAs($user)
            ->postJson($this->acceptUri($invitation))
            ->assertOk()
            ->assertJsonPath('data.company.id', $this->company->getKey())
            ->assertJsonPath('data.status', 'accepted');

        // ÜYELİK + accepted_at.
        $this->assertSame('member', $this->roleInDatabase($user));
        $this->assertNotNull($invitation->fresh()->accepted_at);

        // AUDIT — kabul ile AYNI transaction'da.
        $this->assertCount(1, $this->auditRows(AuditAction::InvitationAccepted));
    }

    public function test_the_successful_response_contains_no_token_or_email(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        $invitation = $this->invitationFor('ben@flowtiger.test');

        $response = $this->apiAs($user)->postJson($this->acceptUri($invitation))->assertOk();

        foreach (['token', 'token_hash', 'email'] as $forbidden) {
            $response->assertJsonMissingPath('data.'.$forbidden);
        }

        $body = $response->getContent();
        $this->assertStringNotContainsString('token', $body);
        $this->assertStringNotContainsString('ben@flowtiger.test', $body);
    }

    /**
     * KABUL, AKTİF ŞİRKETİ SESSİZCE DEĞİŞTİRMEZ.
     *
     * Üyeliğin eklenmesi ile "hangi şirkette çalışıyorum" sorusu AYRI
     * kararlardır; ikincisi kullanıcıya aittir ve mevcut
     * POST /companies/{id}/select akışıyla verilir.
     */
    public function test_accepting_does_not_change_the_active_company(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        // Kullanıcı ŞU AN "Sirket A"nın üyesi ve orada çalışıyor.
        $this->company->users()->syncWithoutDetaching([
            $user->getKey() => ['role' => Role::Member->value],
        ]);
        $this->giveActiveCompany($user, $this->company);

        $this->assertSame($this->company->getKey(), $user->fresh()->active_company_id);

        // Başka bir şirketten davet gelir ve kabul edilir.
        $target = $this->otherCompany('Hedef Sirket');
        $invitation = $this->invitationFor('ben@flowtiger.test', $target);

        $this->apiAs($user)->postJson($this->acceptUri($invitation))->assertOk();

        // Hedef şirkete ÜYE oldu...
        $this->assertSame('member', $this->roleInDatabase($user, $target));

        // ...ama AKTİF ŞİRKETİ DEĞİŞMEDİ.
        $this->assertSame($this->company->getKey(), $user->fresh()->active_company_id);
    }

    /**
     * ZATEN ÜYE — mevcut domain davranışı korunur (422, davet tüketilmez).
     *
     * Kabul edip rolü güncellemek, rol değiştirme yetkisini davet
     * üzerinden atlatmanın yolu olurdu.
     */
    public function test_an_existing_member_cannot_use_an_invitation_to_change_their_role(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        $this->company->users()->syncWithoutDetaching([
            $user->getKey() => ['role' => Role::Member->value],
        ]);

        // OWNER'lık daveti gönderilse bile kabul edilemez.
        $invitation = $this->invitationFor('ben@flowtiger.test', $this->company, Role::Owner);

        $this->apiAs($user)
            ->postJson($this->acceptUri($invitation))
            ->assertStatus(422)
            ->assertJsonPath('code', 'invitation_already_member');

        // ROL YÜKSELMEDİ ve davet TÜKETİLMEDİ.
        $this->assertSame('member', $this->roleInDatabase($user));
        $this->assertNull($invitation->fresh()->accepted_at);
    }

    /**
     * TEKRAR KABUL — ikinci istek 410 `invitation_accepted`, İKİNCİ
     * üyelik oluşmaz.
     *
     * İlk kabul daveti `accepted_at` ile terminAL yapar. İkinci çağrıda
     * davet KULLANICININ kendi davetidir ve hâlâ bulunur; bu yüzden 404
     * değil, durumu söyleyen 410 döner (mevcut token akışıyla aynı
     * davranış) — "davetin yok" demek yanlış olurdu.
     */
    public function test_accepting_twice_is_rejected_and_creates_no_second_membership(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        $invitation = $this->invitationFor('ben@flowtiger.test');

        $this->apiAs($user)->postJson($this->acceptUri($invitation))->assertOk();

        $this->apiAs($user)
            ->postJson($this->acceptUri($invitation))
            ->assertStatus(410)
            ->assertJsonPath('code', 'invitation_accepted');

        $memberships = DB::table('company_users')
            ->where('company_id', $this->company->getKey())
            ->where('user_id', $user->getKey())
            ->count();

        $this->assertSame(1, $memberships);
    }

    /**
     * EŞZAMANLI KABUL KORUMASI BU YOLDA DA GEÇERLİ.
     *
     * Uygulama içi kabul de AYNI çekirdeği (`finaliseAccept`) ve aynı
     * UniqueConstraintViolationException çevirisini kullanır. Bu yüzden
     * yarış, mevcut accept() testindeki TEKNİKLE kurulur
     * (bkz. InvitationAcceptTest::test_a_concurrent_membership_commit_…):
     * ön kontrol geçtikten SONRA, GERÇEK company_users INSERT'i
     * çalışmak üzereyken DB::beforeExecuting() ile "başka bir eşzamanlı
     * istek bizden hemen önce aynı satırı yazdı" anı taklit edilir.
     *
     * Sonuç, sıralı senaryoyla BİREBİR aynı olmalı: 422
     * invitation_already_member ve davet TÜKETİLMEMİŞ.
     *
     * (Test sınırı: RefreshDatabase tek transaction kullanır, bu yüzden
     * enjekte edilen satır kaybedenin rollback'iyle geri alınır — mevcut
     * testte de aynı sınırlama belgelenmiştir. Kanıtlanan şey gerçek bir
     * Postgres ihlalinin doğru domain hatasına çevrildiğidir.)
     */
    public function test_a_concurrent_membership_commit_is_translated_to_the_existing_domain_error(): void
    {
        $user = User::factory()->create(['email' => 'ben@flowtiger.test']);

        $invitation = $this->invitationFor('ben@flowtiger.test');

        $injected = false;

        DB::connection()->beforeExecuting(function (string $query) use (&$injected, $user): void {
            if ($injected || ! str_contains($query, 'insert into "company_users"')) {
                return;
            }

            $injected = true;

            // "Diğer" eşzamanlı kabulün GERÇEK satırı — bir sonraki adımda
            // yazılacak satırla birebir aynı.
            DB::table('company_users')->insert([
                'company_id' => $this->company->getKey(),
                'user_id' => $user->getKey(),
                'role' => Role::Member->value,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        $this->apiAs($user)
            ->postJson($this->acceptUri($invitation))
            ->assertStatus(422)
            ->assertJsonPath('code', 'invitation_already_member');

        // Kaybeden isteğin transaction'ı GERÇEKTEN geri alındı: davet
        // TÜKETİLMEDİ.
        $this->assertNull(
            $invitation->fresh()->accepted_at,
            'Kaybeden isteğin transaction\'ı geri alınmamış: accepted_at yazılmış.'
        );
    }
}
