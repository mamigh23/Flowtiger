<?php

namespace Tests\Feature\Auth;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Faz 2.1 — authentication temelinin davranış testleri.
 *
 * Bu dosya bilinçli olarak Sanctum'a bağımlı DEĞİLDİR: burada doğrulanan
 * şeyler (kullanıcı oluşturma, parola hashleme, doğru user provider)
 * hangi token mekanizması seçilirse seçilsin geçerli olmalıdır.
 *
 * Sanctum'a özgü testler (token üretimi, HasApiTokens uyumu) paket
 * kurulduktan sonra ayrı bir dosyada eklenecektir.
 */
class AuthenticationFoundationTest extends TestCase
{
    use RefreshDatabase;

    // ---------------------------------------------------------------
    // KULLANICI OLUŞTURMA
    // ---------------------------------------------------------------

    public function test_a_user_can_be_created_and_persisted(): void
    {
        $user = User::create([
            'name' => 'Test Owner',
            'email' => 'owner@flowtiger.test',
            'password' => 'gizli-parola',
        ]);

        $this->assertTrue($user->exists);
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'email' => 'owner@flowtiger.test',
        ]);
    }

    // ---------------------------------------------------------------
    // PAROLA GÜVENLİĞİ
    // ---------------------------------------------------------------

    public function test_password_is_never_stored_as_plain_text(): void
    {
        $plain = 'gizli-parola';

        $user = User::create([
            'name' => 'Test Owner',
            'email' => 'owner@flowtiger.test',
            'password' => $plain,
        ]);

        // Veritabanındaki ham değeri Eloquent'i atlayarak okuyoruz:
        // cast katmanı bir şeyi gizliyorsa burada ortaya çıkar.
        $stored = DB::table('users')->where('id', $user->id)->value('password');

        $this->assertNotSame($plain, $stored, 'Parola düz metin olarak yazılmış.');
        $this->assertNotEmpty($stored);
        $this->assertTrue(
            Hash::check($plain, $stored),
            'Saklanan değer parolanın geçerli bir hash\'i değil.'
        );
    }

    public function test_an_already_hashed_password_is_not_hashed_twice(): void
    {
        $hash = Hash::make('gizli-parola');

        $user = User::create([
            'name' => 'Test Owner',
            'email' => 'owner@flowtiger.test',
            'password' => $hash,
        ]);

        $this->assertTrue(
            Hash::check('gizli-parola', $user->fresh()->password),
            'hashed cast, zaten hashlenmiş bir değeri tekrar hashlemiş.'
        );
    }

    public function test_password_and_remember_token_are_hidden_from_serialization(): void
    {
        $user = User::factory()->create();

        $serialized = $user->toArray();

        $this->assertArrayNotHasKey('password', $serialized);
        $this->assertArrayNotHasKey('remember_token', $serialized);
    }

    public function test_user_factory_still_produces_a_verifiable_password(): void
    {
        $user = User::factory()->create();

        $this->assertTrue(
            Hash::check('password', $user->password),
            'UserFactory davranışı bozulmuş.'
        );
    }

    // ---------------------------------------------------------------
    // AUTH YAPILANDIRMASI
    // ---------------------------------------------------------------

    public function test_default_guard_is_session_based_for_the_web_client(): void
    {
        $this->assertSame('web', config('auth.defaults.guard'));
        $this->assertSame('session', config('auth.guards.web.driver'));
        $this->assertSame('users', config('auth.guards.web.provider'));
    }

    public function test_auth_provider_resolves_to_the_application_user_model(): void
    {
        $this->assertSame('eloquent', config('auth.providers.users.driver'));
        $this->assertSame(User::class, config('auth.providers.users.model'));

        $this->assertSame(
            User::class,
            Auth::guard('web')->getProvider()->getModel(),
            'Web guard beklenen User modelini kullanmıyor.'
        );
    }

    public function test_a_user_can_be_authenticated_through_the_default_guard(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user);

        $this->assertTrue(Auth::check());
        $this->assertSame($user->id, Auth::id());
    }

    // ---------------------------------------------------------------
    // FAZ 1 REGRESYON KORUMASI
    // ---------------------------------------------------------------

    public function test_user_to_companies_relationship_is_intact(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        $this->assertTrue($user->isMemberOf($company));

        $membership = $user->companies()->first();

        $this->assertSame($company->id, $membership->id);
        $this->assertSame(
            'owner',
            $membership->pivot->role,
            'company_users pivot rolü kaybolmuş.'
        );
    }
}
