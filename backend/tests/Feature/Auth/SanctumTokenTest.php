<?php

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;
use Illuminate\Auth\RequestGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Laravel\Sanctum\HasApiTokens;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Faz 2.1 — Sanctum kurulumunun gerçekten çalıştığının kanıtı.
 *
 * Kapsam bilinçli olarak dar: token üretimi, saklanması ve guard entegrasyonu.
 * Login/logout uçları, company selection ve middleware Faz 2.2/2.3'e aittir.
 */
class SanctumTokenTest extends TestCase
{
    use RefreshDatabase;

    // ---------------------------------------------------------------
    // KURULUM
    // ---------------------------------------------------------------

    public function test_user_model_is_sanctum_compatible(): void
    {
        $this->assertContains(
            HasApiTokens::class,
            class_uses_recursive(User::class),
            'User modeli HasApiTokens trait\'ini kullanmıyor.'
        );

        $this->assertTrue(method_exists(User::class, 'createToken'));
        $this->assertTrue(method_exists(User::class, 'tokens'));
    }

    public function test_sanctum_guard_is_registered(): void
    {
        $this->assertSame('sanctum', config('auth.guards.sanctum.driver'));
        $this->assertInstanceOf(RequestGuard::class, Auth::guard('sanctum'));
    }

    /**
     * "Sanctum doğru User modeliyle kimlik doğrulayabiliyor mu?" sorusunun
     * davranışsal cevabı.
     *
     * Guard'ın iç yapısına (RequestGuard::getProvider) bakmıyoruz: Sanctum
     * kullanıcıyı user provider üzerinden DEĞİL, token'ın polimorfik
     * `tokenable` ilişkisi üzerinden çözer. Doğrulanması gereken şey budur.
     */
    public function test_a_bearer_token_authenticates_the_correct_user_model(): void
    {
        $user = User::factory()->create();
        $plainTextToken = $user->createToken('mobil-cihaz')->plainTextToken;

        $request = Request::create('/', 'GET');
        $request->headers->set('Authorization', 'Bearer '.$plainTextToken);

        $authenticated = Auth::guard('sanctum')->setRequest($request)->user();

        $this->assertInstanceOf(User::class, $authenticated);
        $this->assertTrue($authenticated->is($user));
        $this->assertSame(
            config('auth.providers.users.model'),
            $authenticated::class,
            'Sanctum, uygulamanın yapılandırılmış User modelinden farklı bir model döndürdü.'
        );
    }

    public function test_an_unknown_bearer_token_authenticates_nobody(): void
    {
        $request = Request::create('/', 'GET');
        $request->headers->set('Authorization', 'Bearer 999999|gecersiz-token-degeri');

        $this->assertNull(Auth::guard('sanctum')->setRequest($request)->user());
    }

    public function test_a_request_without_a_token_authenticates_nobody(): void
    {
        $request = Request::create('/', 'GET');

        $this->assertNull(Auth::guard('sanctum')->setRequest($request)->user());
    }

    public function test_the_personal_access_tokens_table_exists(): void
    {
        $this->assertTrue(
            DB::getSchemaBuilder()->hasTable('personal_access_tokens'),
            'Sanctum migration çalışmamış.'
        );
    }

    /**
     * Faz 1'in davranışı bozulmamalı: User hâlâ şirketlerine erişebilmeli.
     */
    public function test_adding_the_sanctum_trait_did_not_break_the_user_model(): void
    {
        $user = User::factory()->create();

        $this->assertTrue(method_exists($user, 'companies'));
        $this->assertTrue(method_exists($user, 'isMemberOf'));
        $this->assertArrayNotHasKey('password', $user->toArray());
    }

    // ---------------------------------------------------------------
    // TOKEN ÜRETİMİ
    // ---------------------------------------------------------------

    public function test_a_token_can_be_issued_for_a_user(): void
    {
        $user = User::factory()->create();

        $token = $user->createToken('mobil-cihaz');

        $this->assertNotEmpty($token->plainTextToken);
        $this->assertSame('mobil-cihaz', $token->accessToken->name);
        $this->assertSame(1, $user->tokens()->count());

        $this->assertDatabaseHas('personal_access_tokens', [
            'id' => $token->accessToken->getKey(),
            'tokenable_id' => $user->id,
            'tokenable_type' => User::class,
            'name' => 'mobil-cihaz',
        ]);
    }

    /**
     * GÜVENLİK: düz metin token asla veritabanına yazılmamalı.
     * Saklanan değer yalnızca SHA-256 özetidir.
     */
    public function test_the_plain_text_token_is_never_stored_in_the_database(): void
    {
        $user = User::factory()->create();

        $newToken = $user->createToken('mobil-cihaz');
        $plainTextToken = $newToken->plainTextToken;

        $stored = DB::table('personal_access_tokens')
            ->where('id', $newToken->accessToken->getKey())
            ->value('token');

        [, $secret] = explode('|', $plainTextToken, 2);

        $this->assertNotSame($plainTextToken, $stored);
        $this->assertNotSame($secret, $stored);
        $this->assertSame(hash('sha256', $secret), $stored);
        $this->assertSame(64, strlen($stored));

        $this->assertDatabaseMissing('personal_access_tokens', ['token' => $plainTextToken]);
        $this->assertDatabaseMissing('personal_access_tokens', ['token' => $secret]);
    }

    public function test_a_token_resolves_back_to_its_owner(): void
    {
        $user = User::factory()->create();
        $plainTextToken = $user->createToken('mobil-cihaz')->plainTextToken;

        $found = PersonalAccessToken::findToken($plainTextToken);

        $this->assertNotNull($found);
        $this->assertTrue($found->tokenable->is($user));
    }

    public function test_a_revoked_token_can_no_longer_be_resolved(): void
    {
        $user = User::factory()->create();
        $plainTextToken = $user->createToken('mobil-cihaz')->plainTextToken;

        $user->tokens()->delete();

        $this->assertNull(PersonalAccessToken::findToken($plainTextToken));
    }

    public function test_a_tampered_token_is_rejected(): void
    {
        $user = User::factory()->create();
        $plainTextToken = $user->createToken('mobil-cihaz')->plainTextToken;

        [$id] = explode('|', $plainTextToken, 2);

        $this->assertNull(PersonalAccessToken::findToken($id.'|sahte-token-degeri'));
    }

    // ---------------------------------------------------------------
    // ABILITIES
    // ---------------------------------------------------------------

    public function test_token_abilities_are_enforced(): void
    {
        $user = User::factory()->create();

        $token = $user->createToken('sinirli', ['customer:read'])->accessToken;

        $this->assertTrue($token->can('customer:read'));
        $this->assertFalse($token->can('customer:delete'));
    }

    public function test_a_token_without_explicit_abilities_receives_the_wildcard(): void
    {
        $user = User::factory()->create();

        $token = $user->createToken('tam-yetki')->accessToken;

        $this->assertSame(['*'], $token->abilities);
        $this->assertTrue($token->can('customer:delete'));
    }

    // ---------------------------------------------------------------
    // GUARD ENTEGRASYONU + FAIL CLOSED
    // ---------------------------------------------------------------

    public function test_acting_as_authenticates_the_user_through_the_sanctum_guard(): void
    {
        $user = User::factory()->create();

        Sanctum::actingAs($user);

        $this->assertTrue(Auth::guard('sanctum')->check());
        $this->assertSame($user->id, Auth::guard('sanctum')->id());
    }

    /**
     * FlowTiger Anayasası §4: kimlik doğrulama ≠ yetkilendirme.
     *
     * Geçerli bir Sanctum token'ı olan kullanıcı, aktif bir company context
     * olmadan hiçbir tenant verisine erişemez. Faz 1'in fail-closed davranışı
     * authentication eklendikten sonra da geçerli olmalıdır.
     */
    public function test_authentication_alone_does_not_grant_access_to_tenant_data(): void
    {
        $user = User::factory()->create();

        Sanctum::actingAs($user);
        app(CompanyContext::class)->clear();

        $this->assertTrue(
            Gate::forUser($user)->denies('viewAny', Customer::class),
            'Sadece giriş yapmış olmak tenant verisine erişim vermemeliydi.'
        );
    }
}
