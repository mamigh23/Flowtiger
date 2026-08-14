<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * Faz 9 — kullanıcının kendi oturumları.
 *
 * İki eksende kanıt aranır:
 *
 *   1. KULLANIŞLILIK — kullanıcı oturumlarını görebiliyor, hangisinde
 *      olduğunu anlayabiliyor, tek tek ya da toplu kapatabiliyor mu?
 *
 *   2. SINIR — başka birinin oturumunu görmek ya da kapatmak
 *      mümkün mü? Token hash'i yanıta sızıyor mu?
 *
 * §22 uyarısı: her istekten önce Auth::forgetGuards() çağrılır. Bir
 * isteğin çözdüğü kullanıcı diğerine taşınırsa, iptal edilmiş bir
 * token'ın hâlâ çalıştığını sanan sahte-yeşil testler doğar.
 */
class SessionApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/profile/sessions';

    private User $user;

    private User $otherUser;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create(['email' => 'kullanici@flowtiger.test']);
        $this->otherUser = User::factory()->create(['email' => 'baskasi@flowtiger.test']);

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

        $this->tokens[$user->getKey()] ??= $user->createToken('mevcut-cihaz')->plainTextToken;

        return $this->flushHeaders()
            ->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    private function withRawToken(string $plainTextToken): self
    {
        Auth::forgetGuards();

        return $this->flushHeaders()
            ->withHeader('Authorization', 'Bearer '.$plainTextToken);
    }

    /**
     * @return list<object>
     */
    private function auditRows(AuditAction $action): array
    {
        return DB::table('audit_logs')->where('action', $action->value)->orderBy('id')->get()->all();
    }

    // ===============================================================
    // LİSTELEME
    // ===============================================================

    public function test_a_user_sees_their_own_sessions(): void
    {
        $this->user->createToken('telefon');
        $this->user->createToken('masaustu');

        // apiAs üçüncü bir token üretir (mevcut oturum).
        $this->apiAs($this->user)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonStructure([
                'data' => [['id', 'name', 'current', 'abilities', 'last_used_at', 'expires_at', 'created_at']],
            ]);
    }

    public function test_another_users_sessions_are_never_listed(): void
    {
        $foreign = $this->otherUser->createToken('yabanci-cihaz')->accessToken;

        $response = $this->apiAs($this->user)->getJson(self::URI)->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertNotContains($foreign->getKey(), $ids);
        $this->assertStringNotContainsString('yabanci-cihaz', $response->getContent());
    }

    public function test_listing_requires_authentication(): void
    {
        $this->getJson(self::URI)->assertUnauthorized();
    }

    public function test_the_current_session_is_flagged(): void
    {
        $other = $this->user->createToken('diger-cihaz')->accessToken;

        $response = $this->apiAs($this->user)->getJson(self::URI)->assertOk();

        $sessions = collect($response->json('data'))->keyBy('id');

        $currentId = $this->user->tokens()->where('name', 'mevcut-cihaz')->firstOrFail()->getKey();

        $this->assertTrue($sessions[$currentId]['current'], 'İstek yapan oturum current olarak işaretlenmeliydi.');
        $this->assertFalse($sessions[$other->getKey()]['current']);

        // Tam olarak BİR oturum current olabilir.
        $this->assertCount(1, collect($response->json('data'))->where('current', true));
    }

    /**
     * §5, §24: token hash'i doğrulamada kullanılan değerin kendisidir;
     * göstermek onu vermek demektir.
     */
    public function test_the_response_never_exposes_the_token_hash(): void
    {
        $token = $this->user->createToken('telefon');
        $hash = PersonalAccessToken::query()->whereKey($token->accessToken->getKey())->firstOrFail()->token;

        $response = $this->apiAs($this->user)->getJson(self::URI)->assertOk();

        $body = $response->getContent();

        $this->assertStringNotContainsString($hash, $body);
        $this->assertStringNotContainsString($token->plainTextToken, $body);
        $this->assertStringNotContainsString('tokenable', $body);
    }

    public function test_the_resource_exposes_only_whitelisted_fields(): void
    {
        $this->apiAs($this->user);

        $payload = $this->getJson(self::URI)->assertOk()->json('data.0');

        $keys = array_keys($payload);
        sort($keys);

        $this->assertSame(
            ['abilities', 'created_at', 'current', 'expires_at', 'id', 'last_used_at', 'name'],
            $keys,
            'SessionResource beklenmeyen bir alan döndürüyor.'
        );
    }

    public function test_the_abilities_are_reported(): void
    {
        $this->user->createToken('sinirli-cihaz', ['customers:read']);

        $response = $this->apiAs($this->user)->getJson(self::URI)->assertOk();

        $limited = collect($response->json('data'))->firstWhere('name', 'sinirli-cihaz');

        $this->assertSame(['customers:read'], $limited['abilities']);
    }

    public function test_sessions_are_ordered_newest_first(): void
    {
        $oldest = $this->user->createToken('eski')->accessToken;
        $oldest->forceFill(['created_at' => now()->subDays(3)])->save();

        $middle = $this->user->createToken('orta')->accessToken;
        $middle->forceFill(['created_at' => now()->subDays(2)])->save();

        $this->apiAs($this->user);

        $names = collect($this->getJson(self::URI)->assertOk()->json('data'))->pluck('name')->all();

        // 'mevcut-cihaz' az önce üretildi, dolayısıyla en yenisi.
        $this->assertSame(['mevcut-cihaz', 'orta', 'eski'], $names);
    }

    // ===============================================================
    // TEK OTURUM KAPATMA
    // ===============================================================

    public function test_a_user_can_revoke_their_own_session(): void
    {
        $target = $this->user->createToken('telefon');

        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/'.$target->accessToken->getKey())
            ->assertNoContent();

        $this->assertNull(PersonalAccessToken::query()->find($target->accessToken->getKey()));
    }

    public function test_a_revoked_session_can_no_longer_authenticate(): void
    {
        $target = $this->user->createToken('telefon');

        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/'.$target->accessToken->getKey())
            ->assertNoContent();

        $this->withRawToken($target->plainTextToken)
            ->getJson('/api/v1/me')
            ->assertUnauthorized();
    }

    /**
     * §16: başkasının token id'si "yetkin yok" değil "yok" almalı;
     * aksi halde id taramasıyla sistemdeki oturumlar sayılabilirdi.
     */
    public function test_another_users_session_cannot_be_revoked(): void
    {
        $foreign = $this->otherUser->createToken('yabanci-cihaz');

        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/'.$foreign->accessToken->getKey())
            ->assertNotFound();

        $this->assertNotNull(
            PersonalAccessToken::query()->find($foreign->accessToken->getKey()),
            'Başka kullanıcının oturumu silinmiş.'
        );
    }

    public function test_another_users_session_still_works_after_a_failed_revoke(): void
    {
        $foreign = $this->otherUser->createToken('yabanci-cihaz');

        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/'.$foreign->accessToken->getKey())
            ->assertNotFound();

        $this->withRawToken($foreign->plainTextToken)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.id', $this->otherUser->getKey());
    }

    public function test_revoking_an_unknown_session_returns_404(): void
    {
        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/999999')
            ->assertNotFound();
    }

    public function test_revoking_requires_authentication(): void
    {
        $target = $this->user->createToken('telefon');

        $this->deleteJson(self::URI.'/'.$target->accessToken->getKey())
            ->assertUnauthorized();

        $this->assertNotNull(PersonalAccessToken::query()->find($target->accessToken->getKey()));
    }

    /**
     * §8: kullanıcı kendi mevcut oturumunu da kapatabilir — logout zaten
     * aynı işi yapıyor, yasaklamak tutarsız olurdu.
     */
    public function test_a_user_can_revoke_their_current_session(): void
    {
        $this->apiAs($this->user);

        $currentId = $this->user->tokens()->where('name', 'mevcut-cihaz')->firstOrFail()->getKey();

        $this->deleteJson(self::URI.'/'.$currentId)->assertNoContent();

        $this->assertNull(PersonalAccessToken::query()->find($currentId));

        // Aynı token artık çalışmamalı.
        $this->withRawToken($this->tokens[$this->user->getKey()])
            ->getJson('/api/v1/me')
            ->assertUnauthorized();
    }

    // ===============================================================
    // DİĞER OTURUMLARI KAPATMA
    // ===============================================================

    public function test_revoking_others_keeps_the_current_session_alive(): void
    {
        $this->user->createToken('telefon');
        $this->user->createToken('tablet');

        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/others')
            ->assertNoContent();

        $this->assertSame(1, $this->user->tokens()->count());
        $this->assertSame(
            'mevcut-cihaz',
            $this->user->tokens()->firstOrFail()->name,
            'Ayakta kalan oturum, isteği yapan oturum olmalıydı.'
        );

        // Mevcut oturum çalışmaya devam ediyor.
        $this->apiAs($this->user)->getJson('/api/v1/me')->assertOk();
    }

    public function test_revoking_others_kills_the_other_sessions(): void
    {
        $phone = $this->user->createToken('telefon');

        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/others')
            ->assertNoContent();

        $this->withRawToken($phone->plainTextToken)
            ->getJson('/api/v1/me')
            ->assertUnauthorized();
    }

    public function test_revoking_others_never_touches_another_user(): void
    {
        $foreign = $this->otherUser->createToken('yabanci-cihaz');

        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/others')
            ->assertNoContent();

        $this->assertSame(1, $this->otherUser->tokens()->count());

        $this->withRawToken($foreign->plainTextToken)
            ->getJson('/api/v1/me')
            ->assertOk();
    }

    public function test_revoking_others_requires_authentication(): void
    {
        $this->user->createToken('telefon');

        $this->deleteJson(self::URI.'/others')->assertUnauthorized();

        $this->assertSame(1, $this->user->tokens()->count());
    }

    /**
     * 'others' bir token id'si olarak yorumlanmamalı. Route sırası
     * bozulursa bu test kırılır.
     */
    public function test_the_others_route_is_not_matched_as_a_session_id(): void
    {
        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/others')
            ->assertNoContent();

        // Sayısal olmayan bir id, {session} rotasıyla eşleşmemeli.
        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/abc')
            ->assertNotFound();
    }

    // ===============================================================
    // AUDIT
    // ===============================================================

    public function test_revoking_a_session_is_audited_without_secrets(): void
    {
        $target = $this->user->createToken('telefon');
        $hash = PersonalAccessToken::query()->whereKey($target->accessToken->getKey())->firstOrFail()->token;

        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/'.$target->accessToken->getKey())
            ->assertNoContent();

        $rows = $this->auditRows(AuditAction::SessionRevoked);

        $this->assertCount(1, $rows);
        $this->assertSame($this->user->getKey(), (int) $rows[0]->user_id);

        // Kimlik olayı — hiçbir şirkete bağlanmaz.
        $this->assertNull($rows[0]->company_id);

        $metadata = (array) json_decode($rows[0]->metadata, true);

        $this->assertSame('telefon', $metadata['device_name']);
        $this->assertFalse($metadata['was_current_device']);

        $auditTable = DB::table('audit_logs')->get()->toJson();

        $this->assertStringNotContainsString($hash, $auditTable);
        $this->assertStringNotContainsString($target->plainTextToken, $auditTable);
    }

    public function test_revoking_the_current_session_is_audited_as_such(): void
    {
        $this->apiAs($this->user);

        $currentId = $this->user->tokens()->where('name', 'mevcut-cihaz')->firstOrFail()->getKey();

        $this->deleteJson(self::URI.'/'.$currentId)->assertNoContent();

        $metadata = (array) json_decode($this->auditRows(AuditAction::SessionRevoked)[0]->metadata, true);

        $this->assertTrue($metadata['was_current_device']);
    }

    public function test_revoking_others_is_audited_with_the_count(): void
    {
        $this->user->createToken('telefon');
        $this->user->createToken('tablet');

        $this->apiAs($this->user)
            ->deleteJson(self::URI.'/others')
            ->assertNoContent();

        $rows = $this->auditRows(AuditAction::SessionsRevokedOthers);

        $this->assertCount(1, $rows);
        $this->assertSame($this->user->getKey(), (int) $rows[0]->user_id);
        $this->assertNull($rows[0]->company_id);

        $this->assertSame(
            ['other_logins_revoked' => 2],
            (array) json_decode($rows[0]->metadata, true),
        );
    }
}
