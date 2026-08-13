<?php

namespace Tests\Feature\Api\V1;

use App\Enums\Role;
use App\Models\Company;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Faz 4 — üye yönetiminin tenant sınırı.
 *
 * Kanıtlanması gereken matris (§6):
 *
 *   A Owner → A Member  ✅ yönetebilir
 *   A Owner → B Member  ❌ göremez, yönetemez
 *   A Owner → B Owner   ❌ göremez, yönetemez
 *
 * Bu dosyanın en önemli testi en sonda: rol KULLANICIYA değil ÜYELİĞE
 * aittir. Aynı kişi A'da owner, B'de member olabilir ve B'ye geçtiğinde
 * owner yetkilerini YANINDA GETİREMEZ. Rol global bir kullanıcı özelliği
 * olsaydı, tek bir şirkette owner olmak tüm sistemde owner olmak anlamına
 * gelirdi.
 */
class MemberTenantIsolationApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/members';

    private User $ownerA;

    private User $memberA;

    private User $ownerB;

    private User $memberB;

    private Company $companyA;

    private Company $companyB;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->ownerA = User::factory()->create(['name' => 'A Owner', 'email' => 'a-owner@flowtiger.test']);
        $this->memberA = User::factory()->create(['name' => 'A Member', 'email' => 'a-member@flowtiger.test']);
        $this->ownerB = User::factory()->create(['name' => 'B Owner', 'email' => 'b-owner@flowtiger.test']);
        $this->memberB = User::factory()->create(['name' => 'B Member', 'email' => 'b-member@flowtiger.test']);

        $this->companyA = Company::factory()->withOwner($this->ownerA)->create(['name' => 'Sirket A']);
        $this->companyB = Company::factory()->withOwner($this->ownerB)->create(['name' => 'Sirket B']);

        $this->addToCompany($this->memberA, $this->companyA, Role::Member);
        $this->addToCompany($this->memberB, $this->companyB, Role::Member);

        $this->giveActiveCompany($this->ownerA, $this->companyA);
        $this->giveActiveCompany($this->ownerB, $this->companyB);
    }

    private function addToCompany(User $user, Company $company, Role $role): User
    {
        $company->users()->syncWithoutDetaching([$user->getKey() => ['role' => $role->value]]);

        return $user;
    }

    private function giveActiveCompany(User $user, Company $company): void
    {
        app(CompanySelectionService::class)->select($user, $company);
        app(CompanyContext::class)->clear();
    }

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

    private function roleInDatabase(Company $company, User $user): ?string
    {
        return DB::table('company_users')
            ->where('company_id', $company->getKey())
            ->where('user_id', $user->getKey())
            ->first()?->role;
    }

    // ===============================================================
    // LİSTELEME
    // ===============================================================

    public function test_the_list_only_contains_members_of_the_active_company(): void
    {
        $response = $this->apiAs($this->ownerA)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $ids = collect($response->json('data'))->pluck('id')->all();

        sort($ids);
        $expected = [$this->ownerA->getKey(), $this->memberA->getKey()];
        sort($expected);

        $this->assertSame($expected, $ids);

        $this->assertNotContains($this->ownerB->getKey(), $ids);
        $this->assertNotContains($this->memberB->getKey(), $ids);
    }

    public function test_the_list_does_not_leak_another_tenants_emails(): void
    {
        $body = $this->apiAs($this->ownerA)->getJson(self::URI)->assertOk()->getContent();

        $this->assertStringContainsString('a-member@flowtiger.test', $body);
        $this->assertStringNotContainsString('b-member@flowtiger.test', $body);
        $this->assertStringNotContainsString('b-owner@flowtiger.test', $body);
    }

    // ===============================================================
    // OKUMA
    // ===============================================================

    public function test_an_owner_cannot_view_another_tenants_member(): void
    {
        $this->apiAs($this->ownerA)
            ->getJson($this->uriFor($this->memberB))
            ->assertNotFound();
    }

    public function test_an_owner_cannot_view_another_tenants_owner(): void
    {
        $this->apiAs($this->ownerA)
            ->getJson($this->uriFor($this->ownerB))
            ->assertNotFound();
    }

    public function test_the_404_response_does_not_leak_the_foreign_user(): void
    {
        $body = $this->apiAs($this->ownerA)
            ->getJson($this->uriFor($this->memberB))
            ->assertNotFound()
            ->getContent();

        $this->assertStringNotContainsString('b-member@flowtiger.test', $body);
        $this->assertStringNotContainsString('B Member', $body);
    }

    // ===============================================================
    // YAZMA
    // ===============================================================

    public function test_an_owner_cannot_update_another_tenants_member(): void
    {
        $this->apiAs($this->ownerA)
            ->putJson($this->uriFor($this->memberB), [
                'name' => 'Ele Gecirildi',
                'email' => 'elegecirildi@flowtiger.test',
            ])
            ->assertNotFound();

        $this->assertDatabaseHas('users', [
            'id' => $this->memberB->getKey(),
            'email' => 'b-member@flowtiger.test',
        ]);
        $this->assertDatabaseMissing('users', ['email' => 'elegecirildi@flowtiger.test']);
    }

    public function test_an_owner_cannot_change_another_tenants_member_role(): void
    {
        $this->apiAs($this->ownerA)
            ->patchJson($this->roleUriFor($this->memberB), ['role' => 'owner'])
            ->assertNotFound();

        $this->assertSame(
            'member',
            $this->roleInDatabase($this->companyB, $this->memberB),
            'Başka tenant\'ın üyesinin rolü değiştirilmiş.'
        );
    }

    public function test_an_owner_cannot_remove_another_tenants_member(): void
    {
        $this->apiAs($this->ownerA)
            ->deleteJson($this->uriFor($this->memberB))
            ->assertNotFound();

        $this->assertSame(
            'member',
            $this->roleInDatabase($this->companyB, $this->memberB),
            'Başka tenant\'ın üyeliği kaldırılmış.'
        );
    }

    public function test_an_owner_cannot_remove_another_tenants_owner(): void
    {
        $this->apiAs($this->ownerA)
            ->deleteJson($this->uriFor($this->ownerB))
            ->assertNotFound();

        $this->assertSame('owner', $this->roleInDatabase($this->companyB, $this->ownerB));
    }

    // ===============================================================
    // OLUŞTURMA
    // ===============================================================

    public function test_a_member_created_in_one_company_does_not_join_another(): void
    {
        $this->apiAs($this->ownerA)
            ->postJson(self::URI, [
                'name' => 'Yalniz A',
                'email' => 'yalniz-a@flowtiger.test',
                'password' => 'gizli-parola',
                'role' => 'member',
            ])
            ->assertCreated();

        $created = User::query()->where('email', 'yalniz-a@flowtiger.test')->firstOrFail();

        $this->assertTrue($created->isMemberOf($this->companyA));
        $this->assertFalse($created->isMemberOf($this->companyB));

        // B'nin owner'ı bu kullanıcıyı kendi listesinde GÖRMEMELİ.
        $this->apiAs($this->ownerB)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    // ===============================================================
    // BAĞLAM DEĞİŞİMİ
    // ===============================================================

    public function test_switching_the_active_company_switches_the_member_list(): void
    {
        $this->addToCompany($this->ownerA, $this->companyB, Role::Owner);

        $this->apiAs($this->ownerA)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonPath('meta.total', 2);

        $body = $this->apiAs($this->ownerA)->getJson(self::URI)->assertOk()->getContent();
        $this->assertStringNotContainsString('b-member@flowtiger.test', $body);

        $this->giveActiveCompany($this->ownerA, $this->companyB);

        $body = $this->apiAs($this->ownerA)->getJson(self::URI)->assertOk()->getContent();

        $this->assertStringContainsString('b-member@flowtiger.test', $body);
        $this->assertStringNotContainsString('a-member@flowtiger.test', $body);
    }

    /**
     * FAZ 4'ÜN EN KRİTİK TESTİ.
     *
     * Rol kullanıcının değil ÜYELİĞİN özelliğidir. A'da owner olan biri
     * B'ye member olarak katıldığında, B'de owner yetkilerini kullanamaz.
     *
     * Bu test kırılırsa "owner" global bir kullanıcı tipine dönüşmüş
     * demektir: tek bir şirkette owner olmak, sistemdeki tüm şirketlerde
     * owner olmak anlamına gelir.
     */
    public function test_a_role_belongs_to_the_membership_not_to_the_user(): void
    {
        // Aynı kişi: A'da owner, B'de member.
        $this->addToCompany($this->ownerA, $this->companyB, Role::Member);

        // A aktifken yönetebiliyor.
        $this->apiAs($this->ownerA)->getJson(self::URI)->assertOk();

        // B aktifken YÖNETEMEZ.
        $this->giveActiveCompany($this->ownerA, $this->companyB);

        $this->apiAs($this->ownerA)->getJson(self::URI)->assertForbidden();

        $this->apiAs($this->ownerA)
            ->patchJson($this->roleUriFor($this->memberB), ['role' => 'owner'])
            ->assertForbidden();

        $this->apiAs($this->ownerA)
            ->deleteJson($this->uriFor($this->memberB))
            ->assertForbidden();

        $this->assertSame(
            'member',
            $this->roleInDatabase($this->companyB, $this->memberB),
            'A şirketinin owner\'ı, B şirketinde owner yetkisi kullanabildi.'
        );
    }
}
