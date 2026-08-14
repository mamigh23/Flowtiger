<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Faz 8 — parola sıfırlama.
 *
 * Bu dosyanın iki ekseni var ve ikisi de aynı ölçüde kritik:
 *
 *   1. AKIŞ ÇALIŞIYOR MU — token gerçekten tek kullanımlık, süreli ve
 *      hesaba bağlı mı? Sıfırlama sonrası TÜM oturumlar kapanıyor mu?
 *
 *   2. HİÇBİR ŞEY SIZIYOR MU — kayıtlı ve kayıtsız bir adres arasındaki
 *      farkı yanıttan okumak mümkün mü? Token ya da parola audit'e,
 *      yanıta, veritabanına düz metin giriyor mu?
 *
 * Token testlerde bildirimden okunur; hiçbir assertion mesajına ya da
 * çıktıya yazılmaz (§24).
 */
class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private const FORGOT_URI = '/api/v1/auth/password/forgot';

    private const RESET_URI = '/api/v1/auth/password/reset';

    /** UserFactory tüm kullanıcılara aynı parolayı verir. */
    private const FACTORY_PASSWORD = 'password';

    private const NEW_PASSWORD = 'yepyeni-guclu-parola';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        $this->user = User::factory()->create(['email' => 'kullanici@flowtiger.test']);

        $this->clearAuditLog();
    }

    // ---------------------------------------------------------------
    // YARDIMCILAR
    // ---------------------------------------------------------------

    private function clearAuditLog(): void
    {
        DB::table('audit_logs')->delete();
    }

    /**
     * Gönderilen bildirimden sıfırlama token'ını okur.
     *
     * Token'ın var olduğu tek yer budur: veritabanında yalnızca bcrypt
     * hash'i durur.
     */
    private function capturedResetToken(User $user): string
    {
        $token = null;

        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use (&$token): bool {
            $token = $notification->token;

            return true;
        });

        $this->assertIsString($token, 'Sıfırlama bildirimi token taşımıyor.');

        return $token;
    }

    /**
     * Sıfırlama isteğini yapar ve token'ı döndürür.
     */
    private function requestResetToken(?User $user = null): string
    {
        $user ??= $this->user;

        $this->postJson(self::FORGOT_URI, ['email' => $user->email])->assertOk();

        return $this->capturedResetToken($user);
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
    // FORGOT — ENUMERATION KORUMASI
    // ===============================================================

    public function test_a_known_email_receives_a_reset_link(): void
    {
        $this->postJson(self::FORGOT_URI, ['email' => 'kullanici@flowtiger.test'])
            ->assertOk()
            ->assertJsonPath('data.code', 'password_reset_link_requested');

        Notification::assertSentTo($this->user, ResetPassword::class);
    }

    /**
     * §6'NIN KALBİ: kayıtlı ve kayıtsız adres BİRE BİR aynı yanıtı alır.
     */
    public function test_an_unknown_email_gets_a_byte_identical_response(): void
    {
        $known = $this->postJson(self::FORGOT_URI, ['email' => 'kullanici@flowtiger.test'])->assertOk();
        $unknown = $this->postJson(self::FORGOT_URI, ['email' => 'hic-yok@flowtiger.test'])->assertOk();

        $this->assertSame(
            $known->getContent(),
            $unknown->getContent(),
            'Kayıtlı ve kayıtsız adresin yanıtları ayırt edilebiliyor — hesap varlığı sızıyor.'
        );

        $this->assertSame($known->getStatusCode(), $unknown->getStatusCode());
    }

    public function test_an_unknown_email_produces_no_notification_and_no_token(): void
    {
        $this->postJson(self::FORGOT_URI, ['email' => 'hic-yok@flowtiger.test'])->assertOk();

        Notification::assertNothingSent();

        $this->assertSame(
            0,
            DB::table('password_reset_tokens')->count(),
            'Bilinmeyen adres için sıfırlama token\'ı üretilmiş.'
        );
    }

    public function test_an_unknown_email_leaves_no_audit_trail(): void
    {
        $this->postJson(self::FORGOT_URI, ['email' => 'hic-yok@flowtiger.test'])->assertOk();

        $this->assertCount(0, $this->auditRows(AuditAction::PasswordResetRequested));
    }

    public function test_the_response_does_not_echo_the_submitted_email(): void
    {
        $response = $this->postJson(self::FORGOT_URI, ['email' => 'kullanici@flowtiger.test'])->assertOk();

        $this->assertStringNotContainsString('kullanici@flowtiger.test', $response->getContent());
    }

    public function test_an_invalid_email_is_rejected(): void
    {
        $this->postJson(self::FORGOT_URI, ['email' => 'e-posta-degil'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        Notification::assertNothingSent();
    }

    public function test_the_email_is_normalised_before_lookup(): void
    {
        $this->postJson(self::FORGOT_URI, ['email' => '  Kullanici@FlowTiger.TEST  '])->assertOk();

        Notification::assertSentTo($this->user, ResetPassword::class);
    }

    public function test_the_forgot_endpoint_is_rate_limited(): void
    {
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson(self::FORGOT_URI, ['email' => 'kullanici@flowtiger.test'])->assertOk();
        }

        $this->postJson(self::FORGOT_URI, ['email' => 'kullanici@flowtiger.test'])
            ->assertStatus(429);
    }

    // ===============================================================
    // TOKEN GÜVENLİĞİ
    // ===============================================================

    /**
     * §4, §19: düz metin token veritabanına ASLA yazılmaz.
     */
    public function test_the_plaintext_token_is_never_stored(): void
    {
        $token = $this->requestResetToken();

        $row = DB::table('password_reset_tokens')
            ->where('email', 'kullanici@flowtiger.test')
            ->firstOrFail();

        $this->assertNotSame($token, $row->token);
        $this->assertTrue(
            Hash::check($token, $row->token),
            'Saklanan değer, token\'ın hash\'i olmalıydı.'
        );

        $this->assertFalse(
            DB::table('password_reset_tokens')->where('token', $token)->exists(),
            'Düz metin token veritabanında bulundu.'
        );
    }

    /**
     * Notification::fake() bildirimi RENDER ETMEZ; bağlantı üretimindeki
     * bir hata bütün testlerden sessizce geçer ve yalnızca production'da
     * ortaya çıkar. Bu test createUrlUsing kablolamasını gerçekten
     * çalıştırır.
     *
     * Laravel'in varsayılanı 'password.reset' adlı bir ROUTE arar; o route
     * bu API'de yok. Yapılandırma kaldırılırsa mail gönderimi exception
     * ile patlar — burası o regresyonun bekçisidir.
     */
    public function test_the_notification_builds_the_link_from_config(): void
    {
        $token = $this->requestResetToken();

        $mailMessage = null;

        Notification::assertSentTo($this->user, ResetPassword::class, function (ResetPassword $notification) use (&$mailMessage): bool {
            $mailMessage = $notification->toMail($this->user);

            return true;
        });

        $this->assertNotNull($mailMessage);

        $url = $mailMessage->actionUrl;

        $this->assertStringContainsString('/password/reset/', $url);
        $this->assertStringContainsString($token, $url);
        $this->assertStringContainsString(urlencode('kullanici@flowtiger.test'), $url);

        // Şablondaki yer tutucular gerçekten doldurulmuş olmalı.
        $this->assertStringNotContainsString('{token}', $url);
        $this->assertStringNotContainsString('{email}', $url);
    }

    public function test_the_token_never_reaches_the_audit_log(): void
    {
        $token = $this->requestResetToken();

        $this->assertStringNotContainsString(
            $token,
            $this->auditTableAsText(),
            'Sıfırlama token\'ı audit tablosuna yazılmış.'
        );
    }

    // ===============================================================
    // RESET — MUTLU YOL
    // ===============================================================

    public function test_a_valid_token_changes_the_password(): void
    {
        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])
            ->assertOk()
            ->assertJsonPath('data.code', 'password_reset_completed');

        $this->assertTrue(Hash::check(self::NEW_PASSWORD, $this->user->fresh()->password));
    }

    public function test_the_new_password_is_hashed(): void
    {
        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();

        $stored = $this->user->fresh()->password;

        $this->assertNotSame(self::NEW_PASSWORD, $stored);
        $this->assertStringStartsWith('$2y$', $stored);
    }

    public function test_the_old_password_stops_working_and_the_new_one_starts(): void
    {
        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();

        $this->postJson('/api/v1/auth/login', [
            'email' => 'kullanici@flowtiger.test',
            'password' => self::FACTORY_PASSWORD,
        ])->assertUnauthorized();

        $this->postJson('/api/v1/auth/login', [
            'email' => 'kullanici@flowtiger.test',
            'password' => self::NEW_PASSWORD,
        ])->assertOk();
    }

    /**
     * §12: sıfırlama, hesabın güvenliğinin YENİDEN KURULMASIDIR. Eski
     * oturumlardan biri saldırganın elinde olabilir; hiçbiri yaşamamalı.
     *
     * Bu, profil üzerinden parola değiştirmeden (mevcut oturum korunur)
     * bilinçli olarak FARKLIDIR.
     */
    public function test_every_sanctum_token_is_revoked(): void
    {
        $firstDevice = $this->user->createToken('telefon')->plainTextToken;
        $secondDevice = $this->user->createToken('masaustu')->plainTextToken;

        $this->assertSame(2, $this->user->tokens()->count());

        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();

        $this->assertSame(
            0,
            $this->user->tokens()->count(),
            'Sıfırlamadan sonra hiçbir oturum ayakta kalmamalıydı.'
        );

        foreach ([$firstDevice, $secondDevice] as $revokedToken) {
            Auth::forgetGuards();

            $this->flushHeaders()
                ->withHeader('Authorization', 'Bearer '.$revokedToken)
                ->getJson('/api/v1/me')
                ->assertUnauthorized();
        }
    }

    // ===============================================================
    // RESET — REDDEDİLEN
    // ===============================================================

    public function test_an_invalid_token_is_rejected(): void
    {
        $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => 'tamamen-uydurma-token',
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invalid_password_reset_token');

        $this->assertTrue(Hash::check(self::FACTORY_PASSWORD, $this->user->fresh()->password));
    }

    public function test_an_expired_token_is_rejected(): void
    {
        $token = $this->requestResetToken();

        // config/auth.php: passwords.users.expire = 60 (dakika)
        $this->travel(61)->minutes();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invalid_password_reset_token');

        $this->assertTrue(Hash::check(self::FACTORY_PASSWORD, $this->user->fresh()->password));
    }

    public function test_a_token_cannot_be_used_twice(): void
    {
        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => 'ikinci-deneme-parolasi',
            'password_confirmation' => 'ikinci-deneme-parolasi',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invalid_password_reset_token');

        // İlk sıfırlamanın parolası geçerli kalmalı.
        $this->assertTrue(Hash::check(self::NEW_PASSWORD, $this->user->fresh()->password));
    }

    /**
     * Token bir HESABA bağlıdır: başka birinin adresiyle kullanılamaz.
     */
    public function test_a_token_cannot_be_used_with_another_email(): void
    {
        $victim = User::factory()->create(['email' => 'kurban@flowtiger.test']);
        $passwordBefore = $victim->password;

        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kurban@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invalid_password_reset_token');

        $this->assertSame($passwordBefore, $victim->fresh()->password);
    }

    public function test_the_password_confirmation_is_required(): void
    {
        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_a_short_password_is_rejected(): void
    {
        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => 'kisa',
            'password_confirmation' => 'kisa',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_the_token_and_email_are_required(): void
    {
        $this->postJson(self::RESET_URI, [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'token', 'password']);
    }

    public function test_the_reset_endpoint_is_rate_limited(): void
    {
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson(self::RESET_URI, [
                'email' => 'kullanici@flowtiger.test',
                'token' => 'uydurma-token',
                'password' => self::NEW_PASSWORD,
                'password_confirmation' => self::NEW_PASSWORD,
            ])->assertStatus(422);
        }

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => 'uydurma-token',
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])->assertStatus(429);
    }

    // ===============================================================
    // YAN ETKİ OLMAMASI GEREKENLER
    // ===============================================================

    /**
     * §16: sıfırlama token'ını kullanabilmek, e-posta doğrulaması yerine
     * GEÇMEZ. Doğrulanmış hesap doğrulanmış kalır, doğrulanmamış da öyle.
     */
    public function test_the_email_verification_state_is_untouched(): void
    {
        $verifiedAt = $this->user->email_verified_at;
        $this->assertNotNull($verifiedAt);

        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();

        $this->assertEquals($verifiedAt, $this->user->fresh()->email_verified_at);
    }

    public function test_an_unverified_account_stays_unverified(): void
    {
        $unverified = User::factory()->unverified()->create(['email' => 'dogrulanmamis@flowtiger.test']);

        $token = $this->requestResetToken($unverified);

        $this->postJson(self::RESET_URI, [
            'email' => 'dogrulanmamis@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();

        $this->assertNull($unverified->fresh()->email_verified_at);
    }

    /**
     * §17: sıfırlama yalnızca parolaya dokunur.
     */
    public function test_the_email_address_itself_is_unchanged(): void
    {
        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();

        $this->assertSame('kullanici@flowtiger.test', $this->user->fresh()->email);
        $this->assertSame($this->user->name, $this->user->fresh()->name);
    }

    // ===============================================================
    // AUDIT
    // ===============================================================

    public function test_the_reset_request_is_audited_safely(): void
    {
        $this->requestResetToken();

        $rows = $this->auditRows(AuditAction::PasswordResetRequested);

        $this->assertCount(1, $rows);
        $this->assertSame($this->user->getKey(), (int) $rows[0]->user_id);

        // §14: kimlik olayı — hiçbir şirkete bağlanmaz.
        $this->assertNull($rows[0]->company_id);

        $metadata = (array) json_decode($rows[0]->metadata, true);

        $this->assertSame(hash('sha256', 'kullanici@flowtiger.test'), $metadata['email_hash']);
    }

    public function test_the_completed_reset_is_audited_safely(): void
    {
        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();

        $rows = $this->auditRows(AuditAction::PasswordResetCompleted);

        $this->assertCount(1, $rows);
        $this->assertSame($this->user->getKey(), (int) $rows[0]->user_id);
        $this->assertNull($rows[0]->company_id);

        // Parolaya ait hiçbir alan yok; yalnızca kaç oturumun kapatıldığı.
        $this->assertNull($rows[0]->old_values);
        $this->assertNull($rows[0]->new_values);

        // Profil üzerinden değiştirmede kaydedilen action farklıdır —
        // iki akış audit'te ayırt edilebilmeli.
        $this->assertCount(0, $this->auditRows(AuditAction::PasswordChanged));
    }

    public function test_no_audit_row_contains_a_password_or_an_email(): void
    {
        $token = $this->requestResetToken();

        $this->postJson(self::RESET_URI, [
            'email' => 'kullanici@flowtiger.test',
            'token' => $token,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ])->assertOk();

        $auditTable = $this->auditTableAsText();

        $this->assertStringNotContainsString(self::NEW_PASSWORD, $auditTable);
        $this->assertStringNotContainsString($token, $auditTable);
        $this->assertStringNotContainsString('kullanici@flowtiger.test', $auditTable);
        $this->assertStringNotContainsString($this->user->fresh()->password, $auditTable);
    }
}
