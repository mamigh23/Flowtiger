<?php

namespace Tests\Feature\Api\V1;

use App\Enums\Role;
use App\Exceptions\LastOwnerException;
use App\Models\Company;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use App\Services\MembershipService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Faz 4 — üye yönetimi ucunun davranış kanıtı.
 *
 * Bu dosyanın merkezindeki iki soru:
 *   1. OWNER yönetebiliyor, MEMBER yönetemiyor mu?
 *   2. Şirket hiçbir yoldan ownersız kalabiliyor mu?
 *
 * Tenant izolasyonu ayrı dosyada (MemberTenantIsolationApiTest).
 */
class MemberApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/members';

    private User $owner;

    private User $member;

    private Company $company;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create(['name' => 'Ali Owner']);
        $this->member = User::factory()->create(['name' => 'Veli Member']);

        $this->company = Company::factory()->withOwner($this->owner)->create();
        $this->addToCompany($this->member, Role::Member);

        $this->giveActiveCompany($this->owner);
        $this->giveActiveCompany($this->member);
    }

    // ---------------------------------------------------------------
    // YARDIMCILAR
    // ---------------------------------------------------------------

    private function addToCompany(User $user, Role $role, ?Company $company = null): User
    {
        ($company ?? $this->company)->users()->syncWithoutDetaching([
            $user->getKey() => ['role' => $role->value],
        ]);

        return $user;
    }

    private function giveActiveCompany(User $user, ?Company $company = null): void
    {
        app(CompanySelectionService::class)->select($user, $company ?? $this->company);
        app(CompanyContext::class)->clear();
    }

    /**
     * Auth::forgetGuards() zorunlu: bu dosyadaki testler aynı test içinde
     * owner ve member olarak sırayla istek atar. Temizlenmezse ikinci
     * istek birincinin kullanıcısıyla çalışır.
     */
    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    private function uriFor(User $user): string
    {
        return self::URI.'/'.$user->getKey();
    }

    private function roleUriFor(User $user): string
    {
        return self::URI.'/'.$user->getKey().'/role';
    }

    /**
     * Rolü doğrudan pivot'tan okur — testin kendisi servise güvenmemeli.
     */
    private function roleInDatabase(User $user, ?Company $company = null): ?string
    {
        $row = DB::table('company_users')
            ->where('company_id', ($company ?? $this->company)->getKey())
            ->where('user_id', $user->getKey())
            ->first();

        return $row?->role;
    }

    // ===============================================================
    // LİSTELEME
    // ===============================================================

    public function test_owner_can_list_the_members(): void
    {
        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonStructure([
                'data' => [['id', 'name', 'email', 'role', 'created_at', 'updated_at']],
                'links',
                'meta',
            ]);
    }

    public function test_the_list_reports_the_role_of_each_member(): void
    {
        $response = $this->apiAs($this->owner)->getJson(self::URI)->assertOk();

        $roles = collect($response->json('data'))->pluck('role', 'id');

        $this->assertSame('owner', $roles[$this->owner->getKey()]);
        $this->assertSame('member', $roles[$this->member->getKey()]);
    }

    public function test_a_member_cannot_list_the_members(): void
    {
        $this->apiAs($this->member)->getJson(self::URI)->assertForbidden();
    }

    public function test_listing_requires_authentication(): void
    {
        $this->getJson(self::URI)->assertUnauthorized();
    }

    public function test_listing_requires_an_active_company(): void
    {
        $stranger = User::factory()->create();

        $this->apiAs($stranger)->getJson(self::URI)->assertForbidden();
    }

    public function test_the_list_is_paginated(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->addToCompany(User::factory()->create(), Role::Member);
        }

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(15, 'data')
            ->assertJsonPath('meta.per_page', 15)
            ->assertJsonPath('meta.total', 22);

        $this->apiAs($this->owner)
            ->getJson(self::URI.'?per_page=5')
            ->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('meta.per_page', 5);
    }

    public function test_the_list_rejects_a_per_page_above_the_maximum(): void
    {
        $this->apiAs($this->owner)
            ->getJson(self::URI.'?per_page=5000')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['per_page']);
    }

    /**
     * §17, §22: parola ve token hiçbir koşulda dışarı çıkmamalı.
     */
    public function test_the_member_resource_exposes_only_whitelisted_fields(): void
    {
        $response = $this->apiAs($this->owner)->getJson(self::URI)->assertOk();

        $keys = array_keys($response->json('data.0'));
        sort($keys);

        $this->assertSame(
            ['created_at', 'email', 'id', 'name', 'role', 'updated_at'],
            $keys,
            'MemberResource beklenmeyen bir alan döndürüyor.'
        );

        $body = $response->getContent();

        $this->assertStringNotContainsString('password', $body);
        $this->assertStringNotContainsString('remember_token', $body);
        $this->assertStringNotContainsString('active_company_id', $body);
        $this->assertStringNotContainsString($this->owner->getAuthPassword(), $body);
    }

    // ===============================================================
    // TEKİL GÖRÜNTÜLEME
    // ===============================================================

    public function test_owner_can_view_a_member(): void
    {
        $this->apiAs($this->owner)
            ->getJson($this->uriFor($this->member))
            ->assertOk()
            ->assertJsonPath('data.id', $this->member->getKey())
            ->assertJsonPath('data.role', 'member');
    }

    public function test_a_member_cannot_view_a_member(): void
    {
        $this->apiAs($this->member)
            ->getJson($this->uriFor($this->owner))
            ->assertForbidden();
    }

    public function test_viewing_an_unknown_user_returns_404(): void
    {
        $this->apiAs($this->owner)
            ->getJson(self::URI.'/999999')
            ->assertNotFound();
    }

    public function test_viewing_a_user_who_is_not_a_member_returns_404(): void
    {
        $stranger = User::factory()->create();

        $this->apiAs($this->owner)
            ->getJson($this->uriFor($stranger))
            ->assertNotFound();
    }

    public function test_viewing_requires_authentication(): void
    {
        $this->getJson($this->uriFor($this->member))->assertUnauthorized();
    }

    // ===============================================================
    // ÜYE OLUŞTURMA
    // ===============================================================

    public function test_owner_can_create_a_member(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, [
                'name' => 'Yeni Uye',
                'email' => 'yeni@flowtiger.test',
                'password' => 'gizli-parola',
                'role' => 'member',
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Yeni Uye')
            ->assertJsonPath('data.email', 'yeni@flowtiger.test')
            ->assertJsonPath('data.role', 'member');

        $created = User::query()->where('email', 'yeni@flowtiger.test')->firstOrFail();

        $this->assertSame('member', $this->roleInDatabase($created));
    }

    public function test_owner_can_create_another_owner(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, [
                'name' => 'Ikinci Owner',
                'email' => 'owner2@flowtiger.test',
                'password' => 'gizli-parola',
                'role' => 'owner',
            ])
            ->assertCreated()
            ->assertJsonPath('data.role', 'owner');

        $created = User::query()->where('email', 'owner2@flowtiger.test')->firstOrFail();

        $this->assertSame('owner', $this->roleInDatabase($created));
    }

    /**
     * §9, §22: parola hash'lenerek saklanır, yanıta çıkmaz.
     */
    public function test_the_created_member_password_is_hashed(): void
    {
        $response = $this->apiAs($this->owner)
            ->postJson(self::URI, [
                'name' => 'Parola Testi',
                'email' => 'parola@flowtiger.test',
                'password' => 'cok-gizli-parola',
                'role' => 'member',
            ])
            ->assertCreated();

        $created = User::query()->where('email', 'parola@flowtiger.test')->firstOrFail();

        $this->assertNotSame('cok-gizli-parola', $created->password);
        $this->assertTrue(Hash::check('cok-gizli-parola', $created->password));

        $this->assertStringNotContainsString('cok-gizli-parola', $response->getContent());
        $this->assertStringNotContainsString($created->password, $response->getContent());
    }

    public function test_the_created_member_belongs_only_to_the_active_company(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, [
                'name' => 'Tek Sirket',
                'email' => 'tek@flowtiger.test',
                'password' => 'gizli-parola',
                'role' => 'member',
            ])
            ->assertCreated();

        $created = User::query()->where('email', 'tek@flowtiger.test')->firstOrFail();

        $this->assertSame(1, $created->companies()->count());
        $this->assertTrue($created->isMemberOf($this->company));
    }

    public function test_a_member_cannot_create_a_member(): void
    {
        $this->apiAs($this->member)
            ->postJson(self::URI, [
                'name' => 'Kacak',
                'email' => 'kacak@flowtiger.test',
                'password' => 'gizli-parola',
                'role' => 'member',
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'kacak@flowtiger.test']);
    }

    /**
     * §9: normal member owner oluşturamaz. Member zaten hiç üye
     * oluşturamadığı için bu yol da kapalıdır.
     */
    public function test_a_member_cannot_create_an_owner(): void
    {
        $this->apiAs($this->member)
            ->postJson(self::URI, [
                'name' => 'Sahte Owner',
                'email' => 'sahte@flowtiger.test',
                'password' => 'gizli-parola',
                'role' => 'owner',
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'sahte@flowtiger.test']);
    }

    public function test_creating_with_an_existing_email_returns_422(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, [
                'name' => 'Kopya',
                'email' => $this->member->email,
                'password' => 'gizli-parola',
                'role' => 'member',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_creating_with_an_invalid_role_returns_422(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, [
                'name' => 'Gecersiz Rol',
                'email' => 'gecersiz@flowtiger.test',
                'password' => 'gizli-parola',
                'role' => 'superadmin',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['role']);

        $this->assertDatabaseMissing('users', ['email' => 'gecersiz@flowtiger.test']);
    }

    public function test_creating_without_any_field_returns_422(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'email', 'password', 'role']);
    }

    public function test_creating_with_a_short_password_returns_422(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, [
                'name' => 'Kisa Parola',
                'email' => 'kisa@flowtiger.test',
                'password' => 'kisa',
                'role' => 'member',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_creating_requires_authentication(): void
    {
        $this->postJson(self::URI, [
            'name' => 'Kimliksiz',
            'email' => 'kimliksiz@flowtiger.test',
            'password' => 'gizli-parola',
            'role' => 'member',
        ])->assertUnauthorized();

        $this->assertDatabaseMissing('users', ['email' => 'kimliksiz@flowtiger.test']);
    }

    // ===============================================================
    // ÜYE GÜNCELLEME
    // ===============================================================

    public function test_owner_can_update_a_member(): void
    {
        $this->apiAs($this->owner)
            ->putJson($this->uriFor($this->member), [
                'name' => 'Guncel Ad',
                'email' => 'guncel@flowtiger.test',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Guncel Ad')
            ->assertJsonPath('data.email', 'guncel@flowtiger.test');

        $this->assertDatabaseHas('users', [
            'id' => $this->member->getKey(),
            'name' => 'Guncel Ad',
            'email' => 'guncel@flowtiger.test',
        ]);
    }

    /**
     * §10: rol gövdeye konarak değiştirilemez.
     */
    public function test_updating_a_member_cannot_change_their_role(): void
    {
        $this->apiAs($this->owner)
            ->putJson($this->uriFor($this->member), [
                'name' => $this->member->name,
                'email' => $this->member->email,
                'role' => 'owner',
            ])
            ->assertOk()
            ->assertJsonPath('data.role', 'member');

        $this->assertSame(
            'member',
            $this->roleInDatabase($this->member),
            'Rol, update gövdesinden değiştirilebiliyor.'
        );
    }

    public function test_a_member_cannot_update_a_member(): void
    {
        $this->apiAs($this->member)
            ->putJson($this->uriFor($this->owner), [
                'name' => 'Ele Gecirildi',
                'email' => 'elegecirildi@flowtiger.test',
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'elegecirildi@flowtiger.test']);
    }

    public function test_a_member_can_keep_their_own_email_while_updating(): void
    {
        $this->apiAs($this->owner)
            ->putJson($this->uriFor($this->member), [
                'name' => 'Sadece Ad Degisti',
                'email' => $this->member->email,
            ])
            ->assertOk();
    }

    public function test_updating_to_an_existing_email_returns_422(): void
    {
        $this->apiAs($this->owner)
            ->putJson($this->uriFor($this->member), [
                'name' => $this->member->name,
                'email' => $this->owner->email,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_updating_requires_authentication(): void
    {
        $this->putJson($this->uriFor($this->member), [
            'name' => 'Kimliksiz',
            'email' => 'kimliksiz@flowtiger.test',
        ])->assertUnauthorized();
    }

    // ===============================================================
    // ROL DEĞİŞTİRME
    // ===============================================================

    public function test_owner_can_promote_a_member_to_owner(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->roleUriFor($this->member), ['role' => 'owner'])
            ->assertOk()
            ->assertJsonPath('data.role', 'owner');

        $this->assertSame('owner', $this->roleInDatabase($this->member));
    }

    public function test_owner_can_demote_another_owner_when_one_remains(): void
    {
        $secondOwner = $this->addToCompany(User::factory()->create(), Role::Owner);

        $this->apiAs($this->owner)
            ->patchJson($this->roleUriFor($secondOwner), ['role' => 'member'])
            ->assertOk()
            ->assertJsonPath('data.role', 'member');

        $this->assertSame('member', $this->roleInDatabase($secondOwner));
    }

    public function test_a_member_cannot_change_a_role(): void
    {
        $this->apiAs($this->member)
            ->patchJson($this->roleUriFor($this->owner), ['role' => 'member'])
            ->assertForbidden();

        $this->assertSame('owner', $this->roleInDatabase($this->owner));
    }

    /**
     * §10: bir MEMBER hiçbir şekilde kendisini OWNER yapamaz.
     */
    public function test_a_member_cannot_promote_themselves_to_owner(): void
    {
        $this->apiAs($this->member)
            ->patchJson($this->roleUriFor($this->member), ['role' => 'owner'])
            ->assertForbidden();

        $this->assertSame(
            'member',
            $this->roleInDatabase($this->member),
            'Member kendini owner yapabildi — yetki sistemi kırılmış.'
        );
    }

    public function test_changing_to_an_invalid_role_returns_422(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->roleUriFor($this->member), ['role' => 'superadmin'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['role']);

        $this->assertSame('member', $this->roleInDatabase($this->member));
    }

    public function test_changing_the_role_without_a_role_returns_422(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->roleUriFor($this->member), [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['role']);
    }

    /**
     * §11, §19: şirketin son owner'ı member'a çevrilemez.
     */
    public function test_the_last_owner_cannot_be_demoted(): void
    {
        $this->assertSame(1, $this->company->users()->wherePivot('role', 'owner')->count());

        $this->apiAs($this->owner)
            ->patchJson($this->roleUriFor($this->owner), ['role' => 'member'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'company_requires_an_owner');

        $this->assertSame(
            'owner',
            $this->roleInDatabase($this->owner),
            'Son owner member yapıldı — şirket ownersız kaldı.'
        );
    }

    /**
     * Son owner'a yeniden "owner" atamak bir değişiklik değildir; son owner
     * kuralına takılmamalıdır.
     */
    public function test_assigning_the_same_role_is_a_no_op(): void
    {
        $this->apiAs($this->owner)
            ->patchJson($this->roleUriFor($this->owner), ['role' => 'owner'])
            ->assertOk()
            ->assertJsonPath('data.role', 'owner');

        $this->assertSame('owner', $this->roleInDatabase($this->owner));
    }

    public function test_changing_a_role_requires_authentication(): void
    {
        $this->patchJson($this->roleUriFor($this->member), ['role' => 'owner'])
            ->assertUnauthorized();

        $this->assertSame('member', $this->roleInDatabase($this->member));
    }

    // ===============================================================
    // ÜYE ÇIKARMA
    // ===============================================================

    public function test_owner_can_remove_a_member(): void
    {
        $this->apiAs($this->owner)
            ->deleteJson($this->uriFor($this->member))
            ->assertNoContent();

        $this->assertNull($this->roleInDatabase($this->member));
    }

    /**
     * §12: yalnızca üyelik kaldırılır, kullanıcı kaydı SİLİNMEZ.
     */
    public function test_removing_a_member_only_detaches_the_membership(): void
    {
        $this->apiAs($this->owner)
            ->deleteJson($this->uriFor($this->member))
            ->assertNoContent();

        $this->assertDatabaseHas('users', [
            'id' => $this->member->getKey(),
            'email' => $this->member->email,
        ]);

        $this->assertDatabaseMissing('company_users', [
            'company_id' => $this->company->getKey(),
            'user_id' => $this->member->getKey(),
        ]);
    }

    public function test_removing_a_member_clears_their_stale_active_company(): void
    {
        $this->assertSame($this->company->getKey(), $this->member->fresh()->active_company_id);

        $this->apiAs($this->owner)
            ->deleteJson($this->uriFor($this->member))
            ->assertNoContent();

        $this->assertNull(
            $this->member->fresh()->active_company_id,
            'Çıkarılan üyenin aktif şirket referansı temizlenmeliydi.'
        );
    }

    public function test_a_member_cannot_remove_anyone(): void
    {
        $this->apiAs($this->member)
            ->deleteJson($this->uriFor($this->owner))
            ->assertForbidden();

        $this->assertSame('owner', $this->roleInDatabase($this->owner));
    }

    /**
     * §5, §12: owner kendi üyeliğini silemez.
     */
    public function test_an_owner_cannot_remove_themselves(): void
    {
        $secondOwner = $this->addToCompany(User::factory()->create(), Role::Owner);

        // İkinci owner varken bile kendini silemez: kural son owner
        // kuralından bağımsızdır.
        $this->apiAs($this->owner)
            ->deleteJson($this->uriFor($this->owner))
            ->assertForbidden();

        $this->assertSame('owner', $this->roleInDatabase($this->owner));
        $this->assertNotNull($this->roleInDatabase($secondOwner));
    }

    public function test_removing_a_user_who_is_not_a_member_returns_404(): void
    {
        $stranger = User::factory()->create();

        $this->apiAs($this->owner)
            ->deleteJson($this->uriFor($stranger))
            ->assertNotFound();
    }

    public function test_removing_requires_authentication(): void
    {
        $this->deleteJson($this->uriFor($this->member))->assertUnauthorized();

        $this->assertSame('member', $this->roleInDatabase($this->member));
    }

    /**
     * Son owner'ın ÇIKARILMASI HTTP üzerinden ulaşılamaz bir yoldur:
     * kendini silmeyi policy engeller (403) ve başka bir owner varsa zaten
     * "son owner" değildir. Kural yine de servis seviyesinde durmalı —
     * konsol komutları ve gelecekteki çağıranlar için.
     */
    public function test_the_last_owner_cannot_be_removed_at_the_service_level(): void
    {
        $this->expectException(LastOwnerException::class);

        app(MembershipService::class)->remove($this->company, $this->owner);
    }

    public function test_the_last_owner_membership_survives_a_failed_removal(): void
    {
        try {
            app(MembershipService::class)->remove($this->company, $this->owner);
        } catch (LastOwnerException) {
            // beklenen
        }

        $this->assertSame(
            'owner',
            $this->roleInDatabase($this->owner),
            'Başarısız çıkarma yine de üyeliği kaldırmış — transaction geri alınmamış.'
        );
    }

    // ===============================================================
    // VERİTABANI KISITI
    // ===============================================================

    public function test_the_company_users_table_has_a_role_check_constraint(): void
    {
        $constraint = DB::selectOne(
            "SELECT conname FROM pg_constraint WHERE conname = 'company_users_role_check'"
        );

        $this->assertNotNull(
            $constraint,
            'company_users.role için CHECK kısıtı bulunamadı.'
        );
    }

    /**
     * Uygulama katmanı tamamen atlansa bile veritabanı tanınmayan bir rolü
     * kabul etmemeli.
     */
    public function test_the_database_rejects_an_unknown_role(): void
    {
        $outsider = User::factory()->create();

        $this->expectException(QueryException::class);

        DB::table('company_users')->insert([
            'company_id' => $this->company->getKey(),
            'user_id' => $outsider->getKey(),
            'role' => 'superadmin',
        ]);
    }
}
