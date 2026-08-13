<?php

namespace Tests\Feature\Api\V1;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * Faz 2.3 — /api/v1/auth/* ve /api/v1/me uçlarının davranış kanıtı.
 *
 * Faz 2.1 Sanctum'un ÇALIŞTIĞINI kanıtladı; burada kanıtlanan şey onun
 * HTTP katmanına DOĞRU bağlandığıdır. İki ayrı soru:
 *
 *   Faz 2.1: token üretiliyor ve hash'lenerek saklanıyor mu?
 *   Faz 2.3: login bu token'ı doğru üretiyor, logout doğru token'ı
 *            iptal ediyor, response yanlış alan sızdırmıyor mu?
 *
 * Testler bilinçli olarak gerçek Bearer token yolundan gider;
 * Sanctum::actingAs() kullanılmaz, çünkü o TransientToken üretir ve
 * logout'un asıl davranışını (tek token iptali) gizlerdi.
 */
class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    private const LOGIN_URI = '/api/v1/auth/login';

    private const LOGOUT_URI = '/api/v1/auth/logout';

    private const ME_URI = '/api/v1/me';

    /**
     * UserFactory tüm kullanıcılara aynı parolayı verir (bkz. UserFactory).
     */
    private const FACTORY_PASSWORD = 'password';

    private function tokenFor(User $user, string $name = 'test-cihaz'): string
    {
        return $user->createToken($name)->plainTextToken;
    }

    /**
     * Gerçek Authorization header'ı ile istek atar.
     *
     * DİKKAT: bu metot withToken() OLARAK ADLANDIRILAMAZ — Laravel'in
     * Illuminate\Foundation\Testing\TestCase sınıfında aynı isimde PUBLIC
     * bir metot vardır ve görünürlük daraltılamaz (fatal error).
     */
    private function authenticateWithToken(string $token): self
    {
        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    /**
     * Bir sonraki isteğin kimlik doğrulamasını SIFIRDAN yaptırır.
     *
     * NEDEN GEREKLİ:
     * Illuminate\Auth\RequestGuard::user(), çözümlediği kullanıcıyı
     * $this->user içinde önbelleğe alır ve setRequest() bu önbelleği
     * TEMİZLEMEZ (vendor/.../Auth/RequestGuard.php). Guard örneği ise
     * AuthManager'da, AuthManager da container'da singleton olarak yaşar.
     *
     * Gerçek hayatta bu bir sorun değildir: her HTTP isteği kendi
     * process'inde, sıfırdan bir container ile başlar. Feature testlerinde
     * ise TEK bir container üzerinde ARKA ARKAYA iki istek yapılır; ikinci
     * istek, birincinin çözdüğü kullanıcıyı hazır bulur ve token'ı hiç
     * sorgulamaz.
     *
     * Bu yüzden "logout sonrası token geçersiz mi?" gibi bir soruyu
     * guard'ı unutmadan sormak, uygulamayı değil test ortamının belleğini
     * ölçmek olur. forgetGuards() guard'ları düşürür; sonraki istek
     * Bearer token'ı yeniden çözmek ZORUNDA kalır.
     */
    private function forgetResolvedGuards(): void
    {
        Auth::forgetGuards();
    }

    // ---------------------------------------------------------------
    // A) LOGIN — MUTLU YOL
    // ---------------------------------------------------------------

    public function test_login_with_valid_credentials_returns_token_and_user(): void
    {
        $user = User::factory()->create(['email' => 'mami@flowtiger.test']);

        $response = $this->postJson(self::LOGIN_URI, [
            'email' => 'mami@flowtiger.test',
            'password' => self::FACTORY_PASSWORD,
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'token',
                    'user' => ['id', 'name', 'email'],
                ],
            ])
            ->assertJsonPath('data.user.id', $user->getKey())
            ->assertJsonPath('data.user.email', 'mami@flowtiger.test');

        $this->assertIsString($response->json('data.token'));
        $this->assertNotSame('', $response->json('data.token'));
    }

    public function test_login_creates_exactly_one_personal_access_token(): void
    {
        $user = User::factory()->create();

        $this->assertSame(0, $user->tokens()->count());

        $this->postJson(self::LOGIN_URI, [
            'email' => $user->email,
            'password' => self::FACTORY_PASSWORD,
        ])->assertOk();

        $this->assertSame(
            1,
            $user->tokens()->count(),
            'Login tam olarak bir personal access token üretmeliydi.'
        );
    }

    /**
     * Yeni bir login, kullanıcının başka cihazlardaki oturumlarını
     * düşürmemelidir.
     */
    public function test_login_does_not_revoke_previously_issued_tokens(): void
    {
        $user = User::factory()->create();
        $existingToken = $this->tokenFor($user, 'mobil');

        $this->postJson(self::LOGIN_URI, [
            'email' => $user->email,
            'password' => self::FACTORY_PASSWORD,
        ])->assertOk();

        $this->authenticateWithToken($existingToken)
            ->getJson(self::ME_URI)
            ->assertOk();
    }

    // ---------------------------------------------------------------
    // B) LOGIN — SIZINTI YOK
    // ---------------------------------------------------------------

    public function test_login_response_does_not_expose_password_or_remember_token(): void
    {
        $user = User::factory()->create();

        $response = $this->postJson(self::LOGIN_URI, [
            'email' => $user->email,
            'password' => self::FACTORY_PASSWORD,
        ])->assertOk();

        $response->assertJsonMissingPath('data.user.password');
        $response->assertJsonMissingPath('data.user.remember_token');

        $body = $response->getContent();

        $this->assertStringNotContainsString(
            'password',
            $body,
            'Login yanıtında "password" anahtarı hiç geçmemeliydi.'
        );
        $this->assertStringNotContainsString('remember_token', $body);
        $this->assertStringNotContainsString(
            $user->getAuthPassword(),
            $body,
            'Parola hash\'i yanıta sızmış.'
        );
    }

    /**
     * FlowTiger Anayasası §16: plaintext token veritabanına ASLA yazılmaz.
     *
     * Faz 2.1 bunu createToken() seviyesinde kanıtlamıştı; burada HTTP
     * yolunun da aynı garantiyi koruduğu doğrulanıyor.
     */
    public function test_plaintext_token_is_never_stored_in_the_database(): void
    {
        $user = User::factory()->create();

        $plainTextToken = $this->postJson(self::LOGIN_URI, [
            'email' => $user->email,
            'password' => self::FACTORY_PASSWORD,
        ])->assertOk()->json('data.token');

        // Sanctum formatı: "<id>|<plaintext>"
        $this->assertStringContainsString('|', $plainTextToken);

        [$tokenId, $plainTextPart] = explode('|', $plainTextToken, 2);

        $this->assertFalse(
            DB::table('personal_access_tokens')->where('token', $plainTextToken)->exists(),
            'Tam plaintext token veritabanında bulundu.'
        );

        $this->assertFalse(
            DB::table('personal_access_tokens')->where('token', $plainTextPart)->exists(),
            'Plaintext token gövdesi veritabanında bulundu.'
        );

        $stored = DB::table('personal_access_tokens')->where('id', (int) $tokenId)->first();

        $this->assertNotNull($stored);
        $this->assertSame(
            hash('sha256', $plainTextPart),
            $stored->token,
            'Veritabanında SHA-256 hash saklanmalıydı.'
        );
    }

    // ---------------------------------------------------------------
    // C) LOGIN — BAŞARISIZ
    // ---------------------------------------------------------------

    public function test_login_with_wrong_password_returns_401(): void
    {
        $user = User::factory()->create();

        $this->postJson(self::LOGIN_URI, [
            'email' => $user->email,
            'password' => 'yanlis-parola',
        ])->assertUnauthorized();

        $this->assertSame(0, $user->tokens()->count(), 'Başarısız login token üretmemeliydi.');
    }

    public function test_login_with_unknown_email_returns_401(): void
    {
        $this->postJson(self::LOGIN_URI, [
            'email' => 'olmayan@flowtiger.test',
            'password' => self::FACTORY_PASSWORD,
        ])->assertUnauthorized();

        $this->assertSame(0, PersonalAccessToken::query()->count());
    }

    /**
     * User enumeration koruması: "e-posta yok" ile "parola yanlış"
     * dışarıdan ayırt edilememeli.
     */
    public function test_failed_login_does_not_reveal_whether_the_email_exists(): void
    {
        $user = User::factory()->create();

        $wrongPassword = $this->postJson(self::LOGIN_URI, [
            'email' => $user->email,
            'password' => 'yanlis-parola',
        ])->assertUnauthorized();

        $unknownEmail = $this->postJson(self::LOGIN_URI, [
            'email' => 'olmayan@flowtiger.test',
            'password' => 'yanlis-parola',
        ])->assertUnauthorized();

        $this->assertSame(
            $wrongPassword->json(),
            $unknownEmail->json(),
            'İki başarısız login yanıtı birbirinden ayırt edilebiliyor; '.
            'bu, geçerli e-posta adreslerinin sayılmasına izin verir.'
        );
    }

    // ---------------------------------------------------------------
    // D) LOGIN — VALIDATION
    // ---------------------------------------------------------------

    public function test_login_without_credentials_returns_422(): void
    {
        $this->postJson(self::LOGIN_URI, [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_login_with_malformed_email_returns_422(): void
    {
        $this->postJson(self::LOGIN_URI, [
            'email' => 'e-posta-degil',
            'password' => self::FACTORY_PASSWORD,
        ])->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    /**
     * Brute-force koruması. Laravel'in yerleşik throttle middleware'i,
     * yeni bağımlılık olmadan.
     */
    public function test_login_is_rate_limited_after_repeated_failures(): void
    {
        $user = User::factory()->create();

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson(self::LOGIN_URI, [
                'email' => $user->email,
                'password' => 'yanlis-parola',
            ])->assertUnauthorized();
        }

        $this->postJson(self::LOGIN_URI, [
            'email' => $user->email,
            'password' => 'yanlis-parola',
        ])->assertStatus(429);
    }

    // ---------------------------------------------------------------
    // E) LOGOUT
    // ---------------------------------------------------------------

    public function test_logout_returns_204_for_an_authenticated_user(): void
    {
        $user = User::factory()->create();

        $this->authenticateWithToken($this->tokenFor($user))
            ->postJson(self::LOGOUT_URI)
            ->assertNoContent();
    }

    public function test_token_no_longer_works_after_logout(): void
    {
        $user = User::factory()->create();
        $token = $this->tokenFor($user);

        $this->authenticateWithToken($token)->postJson(self::LOGOUT_URI)->assertNoContent();

        // Token veritabanından silindi; ikinci isteğin bunu FARK ETMESİ için
        // guard'ın önbelleğe aldığı kullanıcı düşürülmeli.
        $this->forgetResolvedGuards();

        $this->authenticateWithToken($token)
            ->getJson(self::ME_URI)
            ->assertUnauthorized();
    }

    /**
     * Anayasa gereği logout YALNIZCA mevcut token'ı iptal eder.
     * Kullanıcının diğer cihazları oturumda kalmalıdır.
     */
    public function test_logout_revokes_only_the_current_token(): void
    {
        $user = User::factory()->create();

        $mobileToken = $this->tokenFor($user, 'mobil');
        $desktopToken = $this->tokenFor($user, 'masaustu');

        $this->assertSame(2, $user->tokens()->count());

        $this->authenticateWithToken($mobileToken)->postJson(self::LOGOUT_URI)->assertNoContent();

        $this->assertSame(
            1,
            $user->tokens()->count(),
            'Logout yalnızca tek bir token silmeliydi.'
        );

        // Bu satır olmadan test YANLIŞ NEDENLE geçerdi: guard, ilk istekte
        // çözdüğü kullanıcıyı önbellekte tuttuğu için ikinci istek masaüstü
        // token'ını hiç doğrulamaz ve silinmiş bir token'la bile 200 dönerdi.
        $this->forgetResolvedGuards();

        $this->authenticateWithToken($desktopToken)
            ->getJson(self::ME_URI)
            ->assertOk()
            ->assertJsonPath('data.id', $user->getKey());
    }

    public function test_logout_without_authentication_returns_401(): void
    {
        $this->postJson(self::LOGOUT_URI)->assertUnauthorized();
    }

    public function test_logout_with_an_invalid_token_returns_401(): void
    {
        $this->authenticateWithToken('1|tamamen-uydurma-token')
            ->postJson(self::LOGOUT_URI)
            ->assertUnauthorized();
    }

    // ---------------------------------------------------------------
    // F) ME
    // ---------------------------------------------------------------

    public function test_me_returns_the_authenticated_user(): void
    {
        $user = User::factory()->create(['name' => 'Mami']);

        $this->authenticateWithToken($this->tokenFor($user))
            ->getJson(self::ME_URI)
            ->assertOk()
            ->assertJsonPath('data.id', $user->getKey())
            ->assertJsonPath('data.name', 'Mami')
            ->assertJsonPath('data.email', $user->email);
    }

    public function test_me_does_not_expose_password_or_remember_token(): void
    {
        $user = User::factory()->create();

        $response = $this->authenticateWithToken($this->tokenFor($user))
            ->getJson(self::ME_URI)
            ->assertOk();

        $response->assertJsonMissingPath('data.password');
        $response->assertJsonMissingPath('data.remember_token');

        $this->assertStringNotContainsString('password', $response->getContent());
        $this->assertStringNotContainsString('remember_token', $response->getContent());
        $this->assertStringNotContainsString($user->getAuthPassword(), $response->getContent());
    }

    public function test_me_without_authentication_returns_401(): void
    {
        $this->getJson(self::ME_URI)->assertUnauthorized();
    }

    /**
     * /me tenant verisi döndürmez, bu yüzden aktif şirket GEREKTİRMEZ.
     * Şirketi olmayan bir kullanıcı da kendi kimliğini görebilmelidir.
     */
    public function test_me_works_without_an_active_company(): void
    {
        $user = User::factory()->create();

        $this->assertNull($user->active_company_id);

        $this->authenticateWithToken($this->tokenFor($user))
            ->getJson(self::ME_URI)
            ->assertOk();
    }
}
