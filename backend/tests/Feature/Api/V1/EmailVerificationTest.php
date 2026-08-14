<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

/**
 * Faz 7 — e-posta doğrulama.
 *
 * Doğrulama için veritabanında SAKLANAN BİR TOKEN YOKTUR; bağlantının
 * geçerliliği tamamen kriptografik imzadan doğar. Bu yüzden burada
 * kanıtlanması gerekenler alışılmış "token" testlerinden farklıdır:
 *
 *   - imza gerçekten zorunlu mu (kurcalanmış bağlantı ölüyor mu)?
 *   - süre gerçekten işliyor mu?
 *   - hash, kullanıcının GÜNCEL adresine bağlı mı (e-posta değişince
 *     eski bağlantılar ölüyor mu)?
 */
class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    private const SEND_URI = '/api/v1/auth/email/verification-notification';

    private User $user;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        // Faktori varsayılanı doğrulanmış üretir; bu dosyanın konusu
        // doğrulanmamış hesaplar.
        $this->user = User::factory()->unverified()->create(['email' => 'kullanici@flowtiger.test']);

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

    /**
     * Gönderilen bildirimden doğrulama bağlantısını okur.
     */
    private function capturedVerificationUrl(User $user): string
    {
        $url = null;

        Notification::assertSentTo($user, VerifyEmail::class, function (VerifyEmail $notification) use ($user, &$url): bool {
            $url = $notification->toMail($user)->actionUrl;

            return true;
        });

        $this->assertIsString($url, 'Doğrulama bildirimi bağlantı taşımıyor.');

        return $url;
    }

    /**
     * Geçerli imzalı ama içeriği testin belirlediği bir bağlantı üretir.
     */
    private function signedUrlFor(string $id, string $hash, int $validForMinutes = 60): string
    {
        return URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes($validForMinutes),
            ['id' => $id, 'hash' => $hash],
        );
    }

    /**
     * @return list<object>
     */
    private function auditRows(AuditAction $action): array
    {
        return DB::table('audit_logs')->where('action', $action->value)->orderBy('id')->get()->all();
    }

    // ===============================================================
    // BAĞLANTI İSTEME
    // ===============================================================

    public function test_an_authenticated_user_can_request_a_verification_link(): void
    {
        $this->apiAs($this->user)
            ->postJson(self::SEND_URI)
            ->assertOk()
            ->assertJsonPath('data.code', 'verification_link_sent');

        Notification::assertSentTo($this->user, VerifyEmail::class);
    }

    public function test_the_verification_link_is_signed_and_temporary(): void
    {
        $this->apiAs($this->user)->postJson(self::SEND_URI)->assertOk();

        $url = $this->capturedVerificationUrl($this->user);

        $this->assertStringContainsString('signature=', $url);
        $this->assertStringContainsString('expires=', $url);
        $this->assertStringContainsString('/api/v1/auth/email/verify/'.$this->user->getKey().'/', $url);
    }

    /**
     * Zaten doğrulanmış hesaba gereksiz mail gönderilmez — ama istek de
     * hata değildir: istenen sonuç zaten sağlanmış durumda.
     */
    public function test_requesting_a_link_when_already_verified_sends_nothing(): void
    {
        $verified = User::factory()->create();

        $this->apiAs($verified)
            ->postJson(self::SEND_URI)
            ->assertOk()
            ->assertJsonPath('data.code', 'already_verified');

        Notification::assertNothingSentTo($verified);
    }

    public function test_requesting_a_link_requires_authentication(): void
    {
        $this->postJson(self::SEND_URI)->assertUnauthorized();

        Notification::assertNothingSent();
    }

    /**
     * §4, §24: bildirimde parola ya da oturum sırrı bulunmamalı.
     */
    public function test_the_notification_carries_no_secrets(): void
    {
        $this->apiAs($this->user)->postJson(self::SEND_URI)->assertOk();

        $mail = null;

        Notification::assertSentTo($this->user, VerifyEmail::class, function (VerifyEmail $notification) use (&$mail): bool {
            $mail = $notification->toMail($this->user);

            return true;
        });

        $rendered = json_encode($mail->toArray());

        $this->assertStringNotContainsString($this->user->getAuthPassword(), $rendered);
        $this->assertStringNotContainsString('password', $rendered);
        $this->assertStringNotContainsString($this->tokens[$this->user->getKey()], $rendered);
    }

    // ===============================================================
    // DOĞRULAMA
    // ===============================================================

    public function test_following_the_link_verifies_the_email(): void
    {
        $this->apiAs($this->user)->postJson(self::SEND_URI)->assertOk();

        $url = $this->capturedVerificationUrl($this->user);

        $this->assertNull($this->user->fresh()->email_verified_at);

        $this->asGuest()
            ->getJson($url)
            ->assertOk()
            ->assertJsonPath('data.code', 'email_verified');

        $this->assertNotNull($this->user->fresh()->email_verified_at);
        $this->assertTrue($this->user->fresh()->hasVerifiedEmail());
    }

    /**
     * Aynı bağlantıya iki kez tıklamak bir olay değildir: ikinci çağrı
     * güvenli davranmalı ve ikinci bir audit kaydı bırakmamalı.
     */
    public function test_following_the_link_twice_is_safe(): void
    {
        $this->apiAs($this->user)->postJson(self::SEND_URI)->assertOk();
        $url = $this->capturedVerificationUrl($this->user);

        $this->asGuest()->getJson($url)->assertOk()->assertJsonPath('data.code', 'email_verified');

        $verifiedAt = $this->user->fresh()->email_verified_at;

        $this->asGuest()
            ->getJson($url)
            ->assertOk()
            ->assertJsonPath('data.code', 'already_verified');

        $this->assertEquals($verifiedAt, $this->user->fresh()->email_verified_at);
        $this->assertCount(1, $this->auditRows(AuditAction::EmailVerified));
    }

    public function test_an_expired_link_is_rejected(): void
    {
        $url = $this->signedUrlFor(
            (string) $this->user->getKey(),
            sha1($this->user->email),
            validForMinutes: 60,
        );

        $this->travel(61)->minutes();

        $this->asGuest()->getJson($url)->assertForbidden();

        $this->assertNull($this->user->fresh()->email_verified_at);
    }

    public function test_a_link_with_the_wrong_hash_is_rejected(): void
    {
        // İmza geçerli, hash başka bir adrese ait.
        $url = $this->signedUrlFor(
            (string) $this->user->getKey(),
            sha1('baska@flowtiger.test'),
        );

        $this->asGuest()
            ->getJson($url)
            ->assertForbidden()
            ->assertJsonPath('code', 'invalid_verification_link');

        $this->assertNull($this->user->fresh()->email_verified_at);
    }

    public function test_a_link_for_an_unknown_user_is_rejected(): void
    {
        $url = $this->signedUrlFor('999999', sha1('kimse@flowtiger.test'));

        $this->asGuest()
            ->getJson($url)
            ->assertNotFound()
            ->assertJsonPath('code', 'invalid_verification_link');
    }

    /**
     * İmza kurcalanırsa bağlantı controller'a HİÇ ulaşmamalı.
     */
    public function test_a_tampered_link_is_rejected(): void
    {
        $other = User::factory()->unverified()->create();

        $this->apiAs($this->user)->postJson(self::SEND_URI)->assertOk();
        $url = $this->capturedVerificationUrl($this->user);

        // Kullanıcı kimliğini değiştir; imza artık uymaz.
        $tampered = str_replace(
            '/verify/'.$this->user->getKey().'/',
            '/verify/'.$other->getKey().'/',
            $url,
        );

        $this->asGuest()->getJson($tampered)->assertForbidden();

        $this->assertNull($other->fresh()->email_verified_at);
    }

    /**
     * EN KRİTİK TEST.
     *
     * Hash kullanıcının GÜNCEL adresinden türetilir. Adres değiştiğinde
     * eski adrese gitmiş bağlantılar ölmelidir; aksi halde artık
     * kullanılmayan (belki başkasının eline geçmiş) bir posta kutusundaki
     * eski bir mail, YENİ adresi doğrulayabilirdi.
     */
    public function test_changing_the_email_kills_previously_sent_links(): void
    {
        $this->apiAs($this->user)->postJson(self::SEND_URI)->assertOk();
        $oldUrl = $this->capturedVerificationUrl($this->user);

        $this->apiAs($this->user)
            ->putJson('/api/v1/profile', [
                'name' => $this->user->name,
                'email' => 'yeni-adres@flowtiger.test',
            ])
            ->assertOk();

        $this->asGuest()
            ->getJson($oldUrl)
            ->assertForbidden()
            ->assertJsonPath('code', 'invalid_verification_link');

        $this->assertNull($this->user->fresh()->email_verified_at);
    }

    // ===============================================================
    // AUDIT
    // ===============================================================

    public function test_the_verification_flow_is_audited_without_leaking(): void
    {
        $this->apiAs($this->user)->postJson(self::SEND_URI)->assertOk();
        $url = $this->capturedVerificationUrl($this->user);

        $this->asGuest()->getJson($url)->assertOk();

        $requested = $this->auditRows(AuditAction::EmailVerificationRequested);
        $verified = $this->auditRows(AuditAction::EmailVerified);

        $this->assertCount(1, $requested);
        $this->assertCount(1, $verified);

        $this->assertSame($this->user->getKey(), (int) $requested[0]->user_id);
        $this->assertSame($this->user->getKey(), (int) $verified[0]->user_id);

        // Kimlik olayları hiçbir şirkete bağlanmaz (§16).
        $this->assertNull($requested[0]->company_id);
        $this->assertNull($verified[0]->company_id);

        $auditTable = DB::table('audit_logs')->get()->toJson();

        $this->assertStringNotContainsString('kullanici@flowtiger.test', $auditTable);
        $this->assertStringNotContainsString('signature', $auditTable);
        $this->assertStringNotContainsString($this->user->getAuthPassword(), $auditTable);
    }
}
