<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Enums\Role;
use App\Models\Company;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Faz 7 — kullanıcının kendi hesabı.
 *
 * Bu dosyanın merkezindeki soru tek: "kullanıcı KENDİ hesabını yönetirken,
 * başka hiçbir şeye dokunabiliyor mu?"
 *
 * İki yön birden kanıtlanmalı:
 *   - kendi adını, e-postasını, parolasını değiştirebiliyor
 *   - başkasının hesabına, kendi rolüne ve tenant bilgisine dokunamıyor
 */
class ProfileApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/profile';

    private const PASSWORD_URI = '/api/v1/profile/password';

    /** UserFactory tüm kullanıcılara aynı parolayı verir. */
    private const FACTORY_PASSWORD = 'password';

    private User $user;

    private User $otherUser;

    private Company $company;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        $this->user = User::factory()->create([
            'name' => 'Ilk Ad',
            'email' => 'kullanici@flowtiger.test',
        ]);

        $this->otherUser = User::factory()->create([
            'name' => 'Baska Kullanici',
            'email' => 'baskasi@flowtiger.test',
        ]);

        $this->company = Company::factory()->withOwner($this->user)->create();
        $this->company->users()->syncWithoutDetaching([
            $this->otherUser->getKey() => ['role' => Role::Member->value],
        ]);

        app(CompanySelectionService::class)->select($this->user, $this->company);
        app(CompanyContext::class)->clear();

        $this->clearAuditLog();
    }

    // ---------------------------------------------------------------
    // YARDIMCILAR
    // ---------------------------------------------------------------

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

    private function asGuest(): self
    {
        Auth::forgetGuards();

        return $this->flushHeaders();
    }

    private function roleInDatabase(User $user): ?string
    {
        return DB::table('company_users')
            ->where('company_id', $this->company->getKey())
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

    private function auditTableAsText(): string
    {
        return DB::table('audit_logs')->get()->toJson();
    }

    // ===============================================================
    // OKUMA
    // ===============================================================

    public function test_an_authenticated_user_can_read_their_profile(): void
    {
        $this->apiAs($this->user)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonPath('data.id', $this->user->getKey())
            ->assertJsonPath('data.name', 'Ilk Ad')
            ->assertJsonPath('data.email', 'kullanici@flowtiger.test')
            ->assertJsonStructure(['data' => ['id', 'name', 'email', 'email_verified_at']]);
    }

    public function test_reading_the_profile_requires_authentication(): void
    {
        $this->getJson(self::URI)->assertUnauthorized();
    }

    public function test_the_profile_never_exposes_credentials(): void
    {
        $response = $this->apiAs($this->user)->getJson(self::URI)->assertOk();

        $body = $response->getContent();

        $this->assertStringNotContainsString('password', $body);
        $this->assertStringNotContainsString('remember_token', $body);
        $this->assertStringNotContainsString($this->user->getAuthPassword(), $body);
    }

    // ===============================================================
    // PROFİL GÜNCELLEME
    // ===============================================================

    public function test_a_user_can_change_their_name(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::URI, ['name' => 'Yeni Ad', 'email' => $this->user->email])
            ->assertOk()
            ->assertJsonPath('data.name', 'Yeni Ad');

        $this->assertSame('Yeni Ad', $this->user->fresh()->name);
    }

    public function test_a_user_can_change_their_email(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::URI, ['name' => 'Ilk Ad', 'email' => 'yeni@flowtiger.test'])
            ->assertOk()
            ->assertJsonPath('data.email', 'yeni@flowtiger.test');

        $this->assertSame('yeni@flowtiger.test', $this->user->fresh()->email);
    }

    /**
     * §8: doğrulanmış olmak ESKİ adres hakkındaydı; yeni adres hakkında
     * hiçbir şey söylemez.
     */
    public function test_changing_the_email_resets_verification(): void
    {
        $this->assertNotNull($this->user->email_verified_at);

        $this->apiAs($this->user)
            ->putJson(self::URI, ['name' => 'Ilk Ad', 'email' => 'yeni@flowtiger.test'])
            ->assertOk()
            ->assertJsonPath('data.email_verified_at', null);

        $this->assertNull($this->user->fresh()->email_verified_at);
    }

    /**
     * Sadece adını değiştiren kullanıcı doğrulanmış durumunu kaybetmemeli.
     */
    public function test_keeping_the_same_email_preserves_verification(): void
    {
        $verifiedAt = $this->user->email_verified_at;

        $this->apiAs($this->user)
            ->putJson(self::URI, ['name' => 'Sadece Ad', 'email' => 'kullanici@flowtiger.test'])
            ->assertOk();

        $this->assertNotNull($this->user->fresh()->email_verified_at);
        $this->assertEquals($verifiedAt, $this->user->fresh()->email_verified_at);
    }

    public function test_the_email_is_normalised(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::URI, ['name' => 'Ilk Ad', 'email' => '  Yeni@FlowTiger.TEST  '])
            ->assertOk()
            ->assertJsonPath('data.email', 'yeni@flowtiger.test');

        $this->assertSame('yeni@flowtiger.test', $this->user->fresh()->email);
    }

    /**
     * Normalizasyon doğrulamadan ÖNCE yapılmalı; aksi halde büyük harfli
     * bir adres unique kontrolünü geçip veritabanı kısıtına çarpardı.
     */
    public function test_an_email_taken_by_another_user_is_rejected_case_insensitively(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::URI, ['name' => 'Ilk Ad', 'email' => 'BASKASI@FlowTiger.test'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->assertSame('kullanici@flowtiger.test', $this->user->fresh()->email);
    }

    public function test_the_name_and_email_are_required(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::URI, [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'email']);
    }

    public function test_an_invalid_email_is_rejected(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::URI, ['name' => 'Ilk Ad', 'email' => 'e-posta-degil'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_updating_the_profile_requires_authentication(): void
    {
        $this->putJson(self::URI, ['name' => 'Kimliksiz', 'email' => 'kimliksiz@flowtiger.test'])
            ->assertUnauthorized();

        $this->assertSame('Ilk Ad', $this->user->fresh()->name);
    }

    /**
     * §12: kimlik gövdeden DEĞİL oturumdan gelir.
     */
    public function test_a_user_id_in_the_payload_cannot_target_another_account(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::URI, [
                'user_id' => $this->otherUser->getKey(),
                'id' => $this->otherUser->getKey(),
                'name' => 'Ele Gecirildi',
                'email' => 'kullanici@flowtiger.test',
            ])
            ->assertOk();

        // Değişen yalnızca isteği yapan kullanıcı olmalı.
        $this->assertSame('Ele Gecirildi', $this->user->fresh()->name);
        $this->assertSame('Baska Kullanici', $this->otherUser->fresh()->name);
        $this->assertSame('baskasi@flowtiger.test', $this->otherUser->fresh()->email);
    }

    /**
     * §7, §24: rol profil ucundan değiştirilemez — Faz 4'ün rol değiştirme
     * yetkisi bu yoldan atlatılamaz.
     */
    public function test_the_role_cannot_be_changed_through_the_profile(): void
    {
        $this->assertSame('owner', $this->roleInDatabase($this->user));

        $this->apiAs($this->otherUser)
            ->putJson(self::URI, [
                'name' => 'Baska Kullanici',
                'email' => 'baskasi@flowtiger.test',
                'role' => 'owner',
            ])
            ->assertOk();

        $this->assertSame(
            'member',
            $this->roleInDatabase($this->otherUser),
            'Rol profil ucundan yükseltilebilmiş — yetki sistemi kırılmış.'
        );
    }

    public function test_the_active_company_cannot_be_changed_through_the_profile(): void
    {
        $foreignCompany = Company::factory()->withOwner(User::factory()->create())->create();

        $this->apiAs($this->user)
            ->putJson(self::URI, [
                'name' => 'Ilk Ad',
                'email' => 'kullanici@flowtiger.test',
                'active_company_id' => $foreignCompany->getKey(),
                'company_id' => $foreignCompany->getKey(),
            ])
            ->assertOk();

        $this->assertSame(
            $this->company->getKey(),
            $this->user->fresh()->active_company_id,
            'active_company_id profil gövdesinden değiştirilebilmiş.'
        );
    }

    public function test_the_password_cannot_be_changed_through_the_profile_update(): void
    {
        $passwordBefore = $this->user->password;

        $this->apiAs($this->user)
            ->putJson(self::URI, [
                'name' => 'Ilk Ad',
                'email' => 'kullanici@flowtiger.test',
                'password' => 'kestirmeden-parola',
            ])
            ->assertOk();

        $this->assertSame($passwordBefore, $this->user->fresh()->password);
        $this->assertFalse(Hash::check('kestirmeden-parola', $this->user->fresh()->password));
    }

    // ===============================================================
    // PAROLA DEĞİŞTİRME
    // ===============================================================

    public function test_a_user_can_change_their_password(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => self::FACTORY_PASSWORD,
                'new_password' => 'yeni-guclu-parola',
                'new_password_confirmation' => 'yeni-guclu-parola',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('yeni-guclu-parola', $this->user->fresh()->password));
    }

    public function test_the_new_password_is_hashed(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => self::FACTORY_PASSWORD,
                'new_password' => 'yeni-guclu-parola',
                'new_password_confirmation' => 'yeni-guclu-parola',
            ])
            ->assertOk();

        $stored = $this->user->fresh()->password;

        $this->assertNotSame('yeni-guclu-parola', $stored);
        $this->assertStringStartsWith('$2y$', $stored);
    }

    public function test_the_response_never_contains_the_new_password(): void
    {
        $response = $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => self::FACTORY_PASSWORD,
                'new_password' => 'yeni-guclu-parola',
                'new_password_confirmation' => 'yeni-guclu-parola',
            ])
            ->assertOk();

        $this->assertStringNotContainsString('yeni-guclu-parola', $response->getContent());
        $this->assertStringNotContainsString($this->user->fresh()->password, $response->getContent());
    }

    public function test_a_wrong_current_password_is_rejected(): void
    {
        $passwordBefore = $this->user->password;

        $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => 'yanlis-parola',
                'new_password' => 'yeni-guclu-parola',
                'new_password_confirmation' => 'yeni-guclu-parola',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['current_password']);

        $this->assertSame($passwordBefore, $this->user->fresh()->password);
    }

    public function test_the_confirmation_must_match(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => self::FACTORY_PASSWORD,
                'new_password' => 'yeni-guclu-parola',
                'new_password_confirmation' => 'baska-bir-parola',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['new_password']);
    }

    public function test_the_new_password_must_differ_from_the_current_one(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => self::FACTORY_PASSWORD,
                'new_password' => self::FACTORY_PASSWORD,
                'new_password_confirmation' => self::FACTORY_PASSWORD,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['new_password']);
    }

    public function test_a_short_new_password_is_rejected(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => self::FACTORY_PASSWORD,
                'new_password' => 'kisa',
                'new_password_confirmation' => 'kisa',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['new_password']);
    }

    public function test_changing_the_password_requires_authentication(): void
    {
        $this->putJson(self::PASSWORD_URI, [
            'current_password' => self::FACTORY_PASSWORD,
            'new_password' => 'yeni-guclu-parola',
            'new_password_confirmation' => 'yeni-guclu-parola',
        ])->assertUnauthorized();
    }

    public function test_the_old_password_no_longer_works_and_the_new_one_does(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => self::FACTORY_PASSWORD,
                'new_password' => 'yeni-guclu-parola',
                'new_password_confirmation' => 'yeni-guclu-parola',
            ])
            ->assertOk();

        $this->asGuest()
            ->postJson('/api/v1/auth/login', [
                'email' => 'kullanici@flowtiger.test',
                'password' => self::FACTORY_PASSWORD,
            ])
            ->assertUnauthorized();

        $this->asGuest()
            ->postJson('/api/v1/auth/login', [
                'email' => 'kullanici@flowtiger.test',
                'password' => 'yeni-guclu-parola',
            ])
            ->assertOk();
    }

    /**
     * §14: çalınmış bir token parola değişiminden sonra ölmeli; parolayı
     * değiştiren kullanıcı ise sistemden atılmamalı.
     */
    public function test_other_tokens_are_revoked_but_the_current_one_survives(): void
    {
        $otherDeviceToken = $this->user->createToken('diger-cihaz')->plainTextToken;

        $this->assertSame(1, $this->user->tokens()->count());

        // apiAs mevcut oturumun token'ını üretir (toplam 2 olur).
        $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => self::FACTORY_PASSWORD,
                'new_password' => 'yeni-guclu-parola',
                'new_password_confirmation' => 'yeni-guclu-parola',
            ])
            ->assertOk()
            ->assertJsonPath('data.other_logins_revoked', 1);

        $this->assertSame(1, $this->user->tokens()->count());

        // Diğer cihaz düştü.
        Auth::forgetGuards();
        $this->flushHeaders()
            ->withHeader('Authorization', 'Bearer '.$otherDeviceToken)
            ->getJson('/api/v1/me')
            ->assertUnauthorized();

        // Parolayı değiştiren oturum yaşamaya devam ediyor.
        $this->apiAs($this->user)->getJson('/api/v1/me')->assertOk();
    }

    /**
     * §11: bir owner, üyesinin parolasına ERİŞEMEZ.
     * Üye güncelleme ucu parolayı hiç tanımaz.
     */
    public function test_an_owner_cannot_change_another_users_password(): void
    {
        $passwordBefore = $this->otherUser->password;

        $this->apiAs($this->user)
            ->putJson('/api/v1/members/'.$this->otherUser->getKey(), [
                'name' => 'Baska Kullanici',
                'email' => 'baskasi@flowtiger.test',
                'password' => 'owner-belirledi',
            ])
            ->assertOk();

        $this->assertSame(
            $passwordBefore,
            $this->otherUser->fresh()->password,
            'Owner, üyenin parolasını değiştirebilmiş.'
        );
        $this->assertFalse(Hash::check('owner-belirledi', $this->otherUser->fresh()->password));
    }

    // ===============================================================
    // AUDIT
    // ===============================================================

    public function test_profile_and_email_changes_are_audited_without_plaintext_email(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::URI, ['name' => 'Yeni Ad', 'email' => 'yeni@flowtiger.test'])
            ->assertOk();

        $profileRows = $this->auditRows(AuditAction::ProfileUpdated);
        $emailRows = $this->auditRows(AuditAction::EmailChanged);

        $this->assertCount(1, $profileRows);
        $this->assertCount(1, $emailRows);

        $old = (array) json_decode($profileRows[0]->old_values, true);
        $new = (array) json_decode($profileRows[0]->new_values, true);

        $this->assertSame('Ilk Ad', $old['name']);
        $this->assertSame('Yeni Ad', $new['name']);

        // Faz 6.1'de kurulan PII kuralı: e-posta özetlenerek saklanır.
        $this->assertSame(hash('sha256', 'kullanici@flowtiger.test'), $old['email_hash']);
        $this->assertSame(hash('sha256', 'yeni@flowtiger.test'), $new['email_hash']);
        $this->assertArrayNotHasKey('email', $old);
        $this->assertArrayNotHasKey('email', $new);

        // Kimlik olayları hiçbir şirkete bağlanmaz.
        $this->assertNull($profileRows[0]->company_id);
        $this->assertNull($emailRows[0]->company_id);

        $auditTable = $this->auditTableAsText();

        $this->assertStringNotContainsString('kullanici@flowtiger.test', $auditTable);
        $this->assertStringNotContainsString('yeni@flowtiger.test', $auditTable);
    }

    public function test_password_changes_are_audited_without_the_password(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => self::FACTORY_PASSWORD,
                'new_password' => 'cok-gizli-yeni-parola',
                'new_password_confirmation' => 'cok-gizli-yeni-parola',
            ])
            ->assertOk();

        $rows = $this->auditRows(AuditAction::PasswordChanged);

        $this->assertCount(1, $rows);
        $this->assertSame($this->user->getKey(), (int) $rows[0]->user_id);
        $this->assertNull($rows[0]->company_id);

        // Kayıtta parolaya ait HİÇBİR alan yok — ne eski, ne yeni, ne hash.
        // Tutulan tek şey olayın kendisi ve kaç oturumun kapatıldığı.
        $this->assertNull($rows[0]->old_values);
        $this->assertNull($rows[0]->new_values);

        // Sayı GERÇEKTEN kaydedilmiş olmalı. Bu assertion aynı zamanda bir
        // regresyon bekçisidir: metadata anahtarı 'token' ya da 'session'
        // içerecek şekilde yeniden adlandırılırsa, sır filtresi onu
        // sessizce düşürür ve burası null görüp patlar.
        $this->assertSame(
            ['other_logins_revoked' => 0],
            (array) json_decode($rows[0]->metadata, true),
        );

        $auditTable = $this->auditTableAsText();

        // NOT: burada eski parolayı ('password') alt dize olarak aramak
        // ANLAMSIZ olurdu — action değerinin kendisi 'password.changed'
        // olduğu için her zaman eşleşirdi. Anlamlı olan, benzersiz
        // parolanın ve hash'in bulunmamasıdır.
        $this->assertStringNotContainsString('cok-gizli-yeni-parola', $auditTable);
        $this->assertStringNotContainsString($this->user->fresh()->password, $auditTable);
    }

    public function test_a_failed_password_change_leaves_no_audit(): void
    {
        $this->apiAs($this->user)
            ->putJson(self::PASSWORD_URI, [
                'current_password' => 'yanlis-parola',
                'new_password' => 'yeni-guclu-parola',
                'new_password_confirmation' => 'yeni-guclu-parola',
            ])
            ->assertStatus(422);

        $this->assertCount(0, $this->auditRows(AuditAction::PasswordChanged));
    }
}
