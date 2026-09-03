<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Enums\Role;
use App\Mail\InvitationMail;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Faz 6 — davetin kabulü.
 *
 * Bu uç, FlowTiger'ın tenant duvarındaki TEK kapıdır: kimlik doğrulaması
 * zorunlu değildir, aktif şirket yoktur, çağıran çoğu zaman hiçbir
 * şirketin üyesi değildir. Anahtarı token'dır.
 *
 * Bu yüzden burada kanıtlanması gerekenler, diğer uçlardan farklıdır:
 *   - token tek kullanımlık mı?
 *   - süresi dolmuş / iptal edilmiş token gerçekten ölü mü?
 *   - MEVCUT bir hesabın parolası ve oturumları korunuyor mu?
 *   - davet, rol yükseltmenin arka kapısı olabiliyor mu?
 */
class InvitationAcceptTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/invitations/accept';

    private const TOKEN = 'test-plaintext-invitation-token-0123456789abcdef';

    private User $owner;

    private Company $company;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();

        $this->owner = User::factory()->create();
        $this->company = Company::factory()->withOwner($this->owner)->create(['name' => 'Sirket A']);

        $this->giveActiveCompany($this->owner);
        $this->clearAuditLog();
    }

    // ---------------------------------------------------------------
    // YARDIMCILAR
    // ---------------------------------------------------------------

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
     * bırakır; yalnızca Auth::forgetGuards() çağırmak yetmez, başlık
     * hâlâ gönderilir ve istek sessizce kimlikli çalışır. Davet kabulü
     * kimliğe göre TAMAMEN farklı davrandığı için bu, testi fark
     * edilmeden anlamsızlaştırırdı.
     */
    private function asGuest(): self
    {
        Auth::forgetGuards();

        return $this->flushHeaders();
    }

    /**
     * Testin token'ını bildiği bir davet kurar.
     */
    private function pendingInvitation(string $email, Role $role = Role::Member, string $token = self::TOKEN): Invitation
    {
        return Invitation::factory()
            ->forCompany($this->company)
            ->invitedBy($this->owner)
            ->forEmail($email)
            ->asRole($role)
            ->withToken($token)
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
    // YENİ KULLANICI
    // ===============================================================

    public function test_a_new_user_can_accept_and_gets_an_account(): void
    {
        $this->pendingInvitation('yeni@flowtiger.test');

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'guclu-parola-123',
        ])->assertCreated()->assertJsonPath('data.status', 'accepted');

        $this->assertDatabaseHas('users', [
            'email' => 'yeni@flowtiger.test',
            'name' => 'Yeni Kullanici',
        ]);
    }

    /**
     * §16: parola hash'lenerek saklanır.
     */
    public function test_the_new_users_password_is_hashed(): void
    {
        $this->pendingInvitation('yeni@flowtiger.test');

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'guclu-parola-123',
        ])->assertCreated();

        $user = User::query()->where('email', 'yeni@flowtiger.test')->firstOrFail();

        $this->assertNotSame('guclu-parola-123', $user->password);
        $this->assertTrue(Hash::check('guclu-parola-123', $user->password));
    }

    public function test_the_membership_is_created_with_the_invited_role(): void
    {
        $this->pendingInvitation('yeni@flowtiger.test', Role::Owner);

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Owner',
            'password' => 'guclu-parola-123',
        ])->assertCreated();

        $user = User::query()->where('email', 'yeni@flowtiger.test')->firstOrFail();

        $this->assertSame('owner', $this->roleInDatabase($user));
        $this->assertTrue($user->isMemberOf($this->company));
        $this->assertSame(1, $user->companies()->count());
    }

    public function test_the_invitation_is_marked_accepted(): void
    {
        $invitation = $this->pendingInvitation('yeni@flowtiger.test');

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'guclu-parola-123',
        ])->assertCreated();

        $this->assertNotNull($invitation->fresh()->accepted_at);
        $this->assertSame('accepted', $invitation->fresh()->status()->value);
    }

    public function test_accepting_is_audited(): void
    {
        $this->pendingInvitation('yeni@flowtiger.test');

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'guclu-parola-123',
        ])->assertCreated();

        $user = User::query()->where('email', 'yeni@flowtiger.test')->firstOrFail();

        $accepted = $this->auditRows(AuditAction::InvitationAccepted);

        $this->assertCount(1, $accepted);
        $this->assertSame($this->company->getKey(), (int) $accepted[0]->company_id);
        $this->assertSame($user->getKey(), (int) $accepted[0]->user_id);

        $metadata = (array) json_decode($accepted[0]->metadata, true);

        $this->assertSame(hash('sha256', 'yeni@flowtiger.test'), $metadata['email_hash']);
        $this->assertTrue($metadata['created_new_account']);

        // Üyelik oluşumu da ayrıca izlenir: "bu şirkete kim, ne zaman
        // katıldı" sorusu davet akışından bağımsız yanıtlanabilmeli.
        $this->assertCount(1, $this->auditRows(AuditAction::MemberCreated));
    }

    /**
     * §23, §31: ne parola ne token audit'e girer.
     */
    public function test_neither_the_password_nor_the_token_reaches_the_audit_log(): void
    {
        $this->pendingInvitation('yeni@flowtiger.test');

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'cok-gizli-parola-999',
        ])->assertCreated();

        $auditTable = DB::table('audit_logs')->get()->toJson();

        $this->assertStringNotContainsString('cok-gizli-parola-999', $auditTable);
        $this->assertStringNotContainsString(self::TOKEN, $auditTable);
        $this->assertStringNotContainsString('yeni@flowtiger.test', $auditTable);
    }

    public function test_a_new_user_must_supply_a_name_and_password(): void
    {
        $this->pendingInvitation('yeni@flowtiger.test');

        $this->postJson(self::URI, ['token' => self::TOKEN])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'password']);

        $this->assertDatabaseMissing('users', ['email' => 'yeni@flowtiger.test']);
    }

    public function test_a_short_password_is_rejected(): void
    {
        $this->pendingInvitation('yeni@flowtiger.test');

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'kisa',
        ])->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    /**
     * Oluşan hesap gerçekten çalışmalı — davet, kullanılamaz bir hesap
     * bırakmamalı.
     */
    public function test_the_new_account_can_log_in(): void
    {
        $this->pendingInvitation('yeni@flowtiger.test');

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'guclu-parola-123',
        ])->assertCreated();

        $this->postJson('/api/v1/auth/login', [
            'email' => 'yeni@flowtiger.test',
            'password' => 'guclu-parola-123',
        ])->assertOk()->assertJsonStructure(['data' => ['token', 'user']]);
    }

    // ===============================================================
    // MEVCUT KULLANICI
    // ===============================================================

    public function test_an_authenticated_existing_user_can_accept(): void
    {
        $existing = User::factory()->create(['email' => 'mevcut@flowtiger.test']);
        $this->pendingInvitation('mevcut@flowtiger.test');

        $this->apiAs($existing)
            ->postJson(self::URI, ['token' => self::TOKEN])
            ->assertOk()
            ->assertJsonPath('data.status', 'accepted');

        $this->assertSame('member', $this->roleInDatabase($existing));
        $this->assertSame(1, User::query()->where('email', 'mevcut@flowtiger.test')->count());
    }

    /**
     * §17: mevcut parola DEĞİŞTİRİLEMEZ.
     */
    public function test_accepting_never_changes_an_existing_password(): void
    {
        $existing = User::factory()->create(['email' => 'mevcut@flowtiger.test']);
        $passwordBefore = $existing->password;

        $this->pendingInvitation('mevcut@flowtiger.test');

        $this->apiAs($existing)
            ->postJson(self::URI, ['token' => self::TOKEN])
            ->assertOk();

        $this->assertSame(
            $passwordBefore,
            $existing->fresh()->password,
            'Davet kabulü mevcut kullanıcının parolasını değiştirmiş.'
        );
    }

    /**
     * §17: mevcut authentication bozulmamalı.
     */
    public function test_accepting_does_not_break_existing_authentication(): void
    {
        $existing = User::factory()->create(['email' => 'mevcut@flowtiger.test']);
        $this->pendingInvitation('mevcut@flowtiger.test');

        $this->apiAs($existing)
            ->postJson(self::URI, ['token' => self::TOKEN])
            ->assertOk();

        // Kabulden ÖNCE üretilmiş token hâlâ çalışmalı.
        $this->apiAs($existing)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.id', $existing->getKey());
    }

    /**
     * Sızan bir davet linki, hesabın sahibinden habersiz o hesabı bir
     * şirkete bağlayamamalı.
     */
    public function test_an_existing_account_cannot_be_joined_without_signing_in(): void
    {
        $existing = User::factory()->create(['email' => 'mevcut@flowtiger.test']);
        $this->pendingInvitation('mevcut@flowtiger.test');

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Sahte Isim',
            'password' => 'sahte-parola-123',
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'invitation_requires_authentication');

        $this->assertNull($this->roleInDatabase($existing));
        $this->assertSame(1, User::query()->where('email', 'mevcut@flowtiger.test')->count());
    }

    public function test_a_different_authenticated_user_cannot_consume_the_invitation(): void
    {
        $intruder = User::factory()->create(['email' => 'baskasi@flowtiger.test']);
        $this->pendingInvitation('davetli@flowtiger.test');

        $this->apiAs($intruder)
            ->postJson(self::URI, ['token' => self::TOKEN])
            ->assertForbidden()
            ->assertJsonPath('code', 'invitation_email_mismatch');

        $this->assertNull($this->roleInDatabase($intruder));
    }

    /**
     * Giriş yapmış kullanıcı için name/password kabul EDİLMEZ: bu uç bir
     * parola değiştirme yolu değildir.
     */
    public function test_an_authenticated_user_cannot_send_a_name_or_password(): void
    {
        $existing = User::factory()->create(['email' => 'mevcut@flowtiger.test']);
        $this->pendingInvitation('mevcut@flowtiger.test');

        $this->apiAs($existing)
            ->postJson(self::URI, [
                'token' => self::TOKEN,
                'name' => 'Yeni Isim',
                'password' => 'yeni-parola-123',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'password']);
    }

    // ===============================================================
    // DURUM MAKİNESİ
    // ===============================================================

    public function test_a_token_cannot_be_used_twice(): void
    {
        $this->pendingInvitation('yeni@flowtiger.test');

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'guclu-parola-123',
        ])->assertCreated();

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Ikinci Deneme',
            'password' => 'guclu-parola-123',
        ])
            ->assertStatus(410)
            ->assertJsonPath('code', 'invitation_accepted');

        $this->assertSame(1, User::query()->where('email', 'yeni@flowtiger.test')->count());
    }

    public function test_an_expired_invitation_cannot_be_accepted(): void
    {
        Invitation::factory()
            ->forCompany($this->company)
            ->forEmail('yeni@flowtiger.test')
            ->withToken(self::TOKEN)
            ->expired()
            ->create();

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'guclu-parola-123',
        ])
            ->assertStatus(410)
            ->assertJsonPath('code', 'invitation_expired');

        $this->assertDatabaseMissing('users', ['email' => 'yeni@flowtiger.test']);
    }

    public function test_a_revoked_invitation_cannot_be_accepted(): void
    {
        Invitation::factory()
            ->forCompany($this->company)
            ->forEmail('yeni@flowtiger.test')
            ->withToken(self::TOKEN)
            ->revoked()
            ->create();

        $this->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'guclu-parola-123',
        ])
            ->assertStatus(410)
            ->assertJsonPath('code', 'invitation_revoked');

        $this->assertDatabaseMissing('users', ['email' => 'yeni@flowtiger.test']);
    }

    public function test_an_unknown_token_returns_404(): void
    {
        $this->postJson(self::URI, [
            'token' => 'tamamen-uydurma-token',
            'name' => 'Yeni Kullanici',
            'password' => 'guclu-parola-123',
        ])
            ->assertNotFound()
            ->assertJsonPath('code', 'invitation_not_found');
    }

    public function test_a_missing_token_is_rejected(): void
    {
        $this->postJson(self::URI, ['name' => 'X', 'password' => 'guclu-parola-123'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['token']);
    }

    /**
     * Zaten üye olan biri için davet TÜKETİLMEZ.
     */
    public function test_an_existing_member_cannot_accept(): void
    {
        $member = User::factory()->create(['email' => 'uye@flowtiger.test']);
        $this->company->users()->syncWithoutDetaching([
            $member->getKey() => ['role' => Role::Member->value],
        ]);

        $invitation = $this->pendingInvitation('uye@flowtiger.test');

        $this->apiAs($member)
            ->postJson(self::URI, ['token' => self::TOKEN])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invitation_already_member');

        $this->assertNull(
            $invitation->fresh()->accepted_at,
            'Reddedilen kabul daveti yine de tüketmiş.'
        );
    }

    /**
     * EN KRİTİK GÜVENLİK TESTİ.
     *
     * Bir üyeye "owner" daveti gönderip kabul ettirmek, Faz 4'teki rol
     * değiştirme yetkisini davet üzerinden atlatmanın yolu olurdu.
     * Davet, yetki yükseltmenin arka kapısı OLAMAZ.
     */
    public function test_an_invitation_cannot_escalate_an_existing_members_role(): void
    {
        $member = User::factory()->create(['email' => 'uye@flowtiger.test']);
        $this->company->users()->syncWithoutDetaching([
            $member->getKey() => ['role' => Role::Member->value],
        ]);

        $this->pendingInvitation('uye@flowtiger.test', Role::Owner);

        $this->apiAs($member)
            ->postJson(self::URI, ['token' => self::TOKEN])
            ->assertStatus(422);

        $this->assertSame(
            'member',
            $this->roleInDatabase($member),
            'Davet kabulü mevcut üyenin rolünü yükseltmiş — yetki sistemi kırılmış.'
        );
    }

    public function test_a_superseded_token_no_longer_works(): void
    {
        $old = $this->pendingInvitation('davetli@flowtiger.test');

        // Aynı adrese yeniden davet: eskisi iptal edilir.
        $this->apiAs($this->owner)
            ->postJson('/api/v1/invitations', ['email' => 'davetli@flowtiger.test', 'role' => 'member'])
            ->assertCreated();

        $this->assertNotNull($old->fresh()->revoked_at);

        $this->asGuest()->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Yeni Kullanici',
            'password' => 'guclu-parola-123',
        ])
            ->assertStatus(410)
            ->assertJsonPath('code', 'invitation_revoked');
    }

    // ===============================================================
    // EŞZAMANLILIK (P0-02)
    //
    // PHPUnit gerçek paralel thread üretemez. Aşağıdaki testler gerçek
    // eşzamanlılığı, "başka bir eşzamanlı istek bizden HEMEN ÖNCE aynı
    // satırı GERÇEKTEN commit etti" durumunu simüle ederek doğrular:
    // enjekte edilen satır her zaman GERÇEK bir DB INSERT'idir ve
    // accept()'in kendi yazması bu satırla GERÇEK bir Postgres UNIQUE
    // ihlaline çarpar (`company_users(company_id,user_id)` ya da
    // `users.email`) — hiçbir yerde exception taklit edilmez, yalnızca
    // ZAMANLAMA taklit edilir. Amaç: InvitationService::accept()'in bu
    // GERÇEK ihlali yakalayıp MEVCUT domain hatalarından birine
    // çevirdiğini (ham 500 DEĞİL) kanıtlamak.
    // ===============================================================

    /**
     * (1) Aynı (kimliği doğrulanmış) kullanıcının aynı daveti TEKRAR
     * kabul etmeye çalışması — retry senaryosu. İlk çağrı başarılı olduktan
     * sonra ikinci çağrı, davet artık "accepted" durumda olduğu için
     * mevcut durum makinesi kontrolüne (§15 adım 2) takılır ve MEVCUT
     * 410/invitation_accepted davranışını değişmeden korur. Bu, guest yol
     * için zaten var olan test_a_token_cannot_be_used_twice'ın
     * authenticated karşılığıdır.
     */
    public function test_an_authenticated_users_repeated_accept_still_returns_the_existing_domain_error(): void
    {
        $existing = User::factory()->create(['email' => 'mevcut@flowtiger.test']);
        $this->pendingInvitation('mevcut@flowtiger.test');

        $this->apiAs($existing)
            ->postJson(self::URI, ['token' => self::TOKEN])
            ->assertOk();

        $this->apiAs($existing)
            ->postJson(self::URI, ['token' => self::TOKEN])
            ->assertStatus(410)
            ->assertJsonPath('code', 'invitation_accepted');

        $this->assertSame(1, DB::table('company_users')
            ->where('company_id', $this->company->getKey())
            ->where('user_id', $existing->getKey())
            ->count());
    }

    /**
     * (2) MEMBERSHIP UNIQUE KISITI YARIŞI.
     *
     * $existing zaten hesabı olan (ama henüz üye olmayan) bir davetlidir.
     * accept()'in ÖN KONTROLÜ ($user->isMemberOf($company)) bu anda henüz
     * geçmiştir (davetli henüz üye değil); enjeksiyon ancak GERÇEK
     * company_users INSERT'i çalışmak ÜZEREYKEN, DB::beforeExecuting() ile
     * devreye girer — "başka bir eşzamanlı accept() isteğinin bizden HEMEN
     * ÖNCE aynı satırı yazdığı" anı taklit eder. accept()'in KENDİ INSERT'i
     * artık company_users(company_id,user_id) UNIQUE kısıtına GERÇEKTEN
     * çarpar; bu, düzeltmeden ÖNCE yakalanmamış bir
     * UniqueConstraintViolationException'dı (→ ham 500). Şimdi MEVCUT
     * invitation_already_member (422) domain hatasına çevrilmeli.
     *
     * NOT (test sınırlaması): RefreshDatabase testi tek bir transaction
     * içinde çalıştırır; accept()'in kendi DB::transaction()'ı bu transaction
     * içinde bir SAVEPOINT'tir. Enjekte edilen satır da AYNI savepoint
     * içinde yazıldığından, kaybeden isteğin rollback'i onu da geri alır —
     * gerçek bir yarışta kazananın satırı KALICI olurdu. Bu, testin
     * kanıtladığı asıl şeyi (GERÇEK bir Postgres ihlalinin doğru domain
     * hatasına çevrildiğini) değiştirmez; yalnızca "kazananın satırı
     * kalıcı mı" sorusu bu test tekniğiyle ayrıca doğrulanamaz.
     */
    public function test_a_concurrent_membership_commit_is_translated_to_the_existing_already_member_error(): void
    {
        $existing = User::factory()->create(['email' => 'mevcut@flowtiger.test']);
        $invitation = $this->pendingInvitation('mevcut@flowtiger.test');

        $injected = false;

        DB::connection()->beforeExecuting(function (string $query) use (&$injected, $existing): void {
            if ($injected || ! str_contains($query, 'insert into "company_users"')) {
                return;
            }

            $injected = true;

            // "Diğer" eşzamanlı accept() isteğinin GERÇEK satırı —
            // MembershipService::attach()'in bir sonraki adımda yazacağı
            // satırla birebir aynı.
            DB::table('company_users')->insert([
                'company_id' => $this->company->getKey(),
                'user_id' => $existing->getKey(),
                'role' => Role::Member->value,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        $this->apiAs($existing)
            ->postJson(self::URI, ['token' => self::TOKEN])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invitation_already_member');

        // Kaybeden isteğin transaction'ı GERÇEKTEN geri alındı: davet
        // TÜKETİLMEDİ (accepted_at hâlâ null).
        $this->assertNull(
            $invitation->fresh()->accepted_at,
            'Kaybeden isteğin transaction\'ı geri alınmamış: accepted_at yazılmış.'
        );
    }

    /**
     * (3a) GUEST-PATH E-POSTA YARIŞI — kazanan AYNI daveti kabul eden
     * başka bir eşzamanlı istek.
     *
     * NEDEN BU TEST HTTP SEVİYESİNDE DEĞİL, DOĞRUDAN translateAcceptRaceException()
     * ÜZERİNDE (reflection ile):
     *
     * Bu dalı HTTP üzerinden tetiklemek için "kazananın" satırının,
     * kaybedenin transaction'ı geri alındıktan SONRA da sorgulanabilir
     * kalması gerekir. Tek bağlantılı bir testte (yukarıdaki (2) ve (3b)
     * testlerinin kullandığı teknik) bu mümkün değildir: kazananın satırı
     * accept()'in KENDİ DB::transaction()'ının AYNI SAVEPOINT'i içinde
     * yazılır ve kaybedenin ROLLBACK TO SAVEPOINT'i onu da geri alır — bu
     * yüzden translateAcceptRaceException()'ın kendi User::where()
     * sorgusu winner'ı asla BULAMAZ (denendi, doğrulandı). Gerçek bir
     * bağımsız commit'i simüle etmek, RefreshDatabase'in testi saran
     * TEK, commit edilmemiş dış transaction'ı yüzünden ayrı bir
     * bağlantıdan erişilemeyen (company, invitation gibi) verilere bağlı
     * kalır — bu da foreign key ihlaline yol açar (denendi, doğrulandı).
     *
     * Bu yüzden bu dalın KARAR MANTIĞI, GERÇEK bir Company + GERÇEK bir
     * (üye yapılmış) User ile — ama exception'ı bir HTTP yarışıyla değil,
     * doğrudan çağırarak — doğrulanır. (2) ve (3b) testleri zaten GERÇEK
     * bir UniqueConstraintViolationException'ın accept() tarafından
     * yakalandığını kanıtlıyor; bu test yalnızca ay(ı)rt etme mantığının
     * ("kazanan üye mi?") doğru dalı seçtiğini, sahte hiçbir exception
     * kullanmadan kanıtlar.
     */
    public function test_translate_accept_race_exception_treats_a_member_winner_as_already_member(): void
    {
        $invitation = $this->pendingInvitation('yarisan@flowtiger.test');

        // GERÇEK bir kazanan: gerçekten var olan bir hesap, gerçekten bu
        // şirketin üyesi (normal MembershipService/factory yoluyla).
        $winner = User::factory()->create(['email' => 'yarisan@flowtiger.test']);
        $this->company->users()->syncWithoutDetaching([
            $winner->getKey() => ['role' => Role::Member->value],
        ]);

        $service = app(\App\Services\InvitationService::class);
        $method = new \ReflectionMethod($service, 'translateAcceptRaceException');
        $method->setAccessible(true);

        $result = $method->invoke($service, $invitation, $this->company, null);

        $this->assertInstanceOf(\App\Exceptions\InvitationException::class, $result);
        $this->assertSame('invitation_already_member', $result->errorCode);
        $this->assertSame(422, $result->status);
    }

    /**
     * (3b) GUEST-PATH E-POSTA YARIŞI — kazanan TAMAMEN BAĞIMSIZ bir hesap
     * (ör. eşzamanlı bir self-servis kayıt/RegistrationService). Kazanan bu
     * şirketin üyesi DEĞİLDİR; bu, resolveAcceptingUser()'ın "hesabı zaten
     * var" dalıyla (test_an_existing_account_cannot_be_joined_without_signing_in)
     * AYNI durumdur — davetli artık kazanan hesapla giriş yapmalıdır.
     */
    public function test_a_guest_path_email_race_won_by_an_unrelated_account_requires_authentication(): void
    {
        $this->pendingInvitation('yarisan2@flowtiger.test');

        $injected = false;

        DB::connection()->beforeExecuting(function (string $query) use (&$injected): void {
            if ($injected || ! str_contains($query, 'insert into "users"')) {
                return;
            }

            $injected = true;

            // Şirkete HİÇ bağlanmayan, tamamen ilgisiz bir hesap — ör.
            // eşzamanlı bir /auth/register isteğinin kazandığı yarış.
            DB::table('users')->insert([
                'name' => 'Ilgisiz Kayit',
                'email' => 'yarisan2@flowtiger.test',
                'password' => bcrypt('baska-parola-999'),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        $this->asGuest()->postJson(self::URI, [
            'token' => self::TOKEN,
            'name' => 'Kaybeden Istek',
            'password' => 'guclu-parola-123',
        ])
            ->assertStatus(403)
            ->assertJsonPath('code', 'invitation_requires_authentication');
    }

    // ===============================================================
    // UÇTAN UCA
    // ===============================================================

    /**
     * Gerçek akış: owner davet eder → token yalnızca mail'e düşer →
     * davetli o token ile hesap açar ve şirkete katılır.
     */
    public function test_the_full_flow_from_invitation_mail_to_membership(): void
    {
        $this->apiAs($this->owner)
            ->postJson('/api/v1/invitations', [
                'email' => 'gercek@flowtiger.test',
                'role' => 'member',
            ])
            ->assertCreated();

        $plainToken = null;

        Mail::assertSent(InvitationMail::class, function (InvitationMail $mail) use (&$plainToken): bool {
            $plainToken = $mail->plainToken;

            return $mail->hasTo('gercek@flowtiger.test');
        });

        $this->assertIsString($plainToken);

        $this->asGuest()->postJson(self::URI, [
            'token' => $plainToken,
            'name' => 'Gercek Kullanici',
            'password' => 'guclu-parola-123',
        ])->assertCreated();

        $user = User::query()->where('email', 'gercek@flowtiger.test')->firstOrFail();

        $this->assertSame('member', $this->roleInDatabase($user));
        $this->assertNotNull(
            Invitation::query()->where('email', 'gercek@flowtiger.test')->firstOrFail()->accepted_at
        );
    }
}
