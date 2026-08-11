<?php

namespace Tests\Feature\Company;

use App\Exceptions\CrossTenantAccessException;
use App\Models\Company;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Faz 2.2 — aktif şirket seçimi.
 *
 * Zincirin ilk halkası: Authenticated User → Valid Membership → Active Company.
 * Buradaki tek kural, üyeliği doğrulanmamış hiçbir şirketin aktif hale
 * gelememesidir (FlowTiger Anayasası §4, §21).
 */
class CompanySelectionTest extends TestCase
{
    use RefreshDatabase;

    private function service(): CompanySelectionService
    {
        return app(CompanySelectionService::class);
    }

    // ---------------------------------------------------------------
    // A) VERİTABANI ALANI
    // ---------------------------------------------------------------

    public function test_a_new_user_has_no_active_company(): void
    {
        $user = User::factory()->create();

        $this->assertNull($user->active_company_id);
        $this->assertNull($user->activeCompany);
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'active_company_id' => null,
        ]);
    }

    public function test_active_company_is_released_when_the_company_is_deleted(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        $this->service()->select($user, $company);
        $this->assertSame($company->id, $user->fresh()->active_company_id);

        $company->delete();

        $this->assertNull(
            $user->fresh()->active_company_id,
            'Şirket silindiğinde active_company_id null olmalıydı.'
        );
    }

    // ---------------------------------------------------------------
    // B) KENDİ ŞİRKETİNİ SEÇME
    // ---------------------------------------------------------------

    public function test_a_user_can_select_a_company_they_belong_to(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        $selected = $this->service()->select($user, $company);

        $this->assertTrue($selected->is($company));
        $this->assertSame($company->id, $user->fresh()->active_company_id);
    }

    public function test_selecting_a_company_also_establishes_the_company_context(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        $this->service()->select($user, $company);

        $this->assertTrue(app(CompanyContext::class)->has());
        $this->assertSame($company->id, app(CompanyContext::class)->id());
    }

    public function test_a_user_can_switch_between_their_own_companies(): void
    {
        $user = User::factory()->create();
        $first = Company::factory()->withOwner($user)->create();
        $second = Company::factory()->withMember($user)->create();

        $this->service()->select($user, $first);
        $this->service()->select($user, $second);

        $this->assertSame($second->id, $user->fresh()->active_company_id);
        $this->assertSame($second->id, app(CompanyContext::class)->id());
    }

    // ---------------------------------------------------------------
    // C, D, E) ÜYE OLMADIĞI ŞİRKET — FAIL CLOSED
    // ---------------------------------------------------------------

    public function test_a_user_cannot_select_a_company_they_do_not_belong_to(): void
    {
        $user = User::factory()->create();
        $foreign = Company::factory()->create();

        $this->expectException(CrossTenantAccessException::class);

        $this->service()->select($user, $foreign);
    }

    public function test_a_rejected_selection_does_not_write_the_active_company(): void
    {
        $user = User::factory()->create();
        $foreign = Company::factory()->create();

        try {
            $this->service()->select($user, $foreign);
        } catch (CrossTenantAccessException) {
            // beklenen
        }

        $this->assertNull($user->fresh()->active_company_id);
        $this->assertDatabaseMissing('users', [
            'id' => $user->id,
            'active_company_id' => $foreign->id,
        ]);
    }

    public function test_a_rejected_selection_does_not_establish_a_company_context(): void
    {
        $user = User::factory()->create();
        $foreign = Company::factory()->create();

        try {
            $this->service()->select($user, $foreign);
        } catch (CrossTenantAccessException) {
            // beklenen
        }

        $this->assertFalse(app(CompanyContext::class)->has());
    }

    /**
     * §11 — CONTEXT KİRLENMESİ.
     *
     * Başarısız bir seçim, hâlihazırda kurulu ve güvenli olan context'i
     * bozmamalıdır. Aksi halde bir saldırgan, geçersiz seçim denemeleriyle
     * kullanıcıyı context'siz bırakıp fail-closed davranışı tetikleyebilir
     * ya da daha kötüsü, yarım kalmış bir duruma sürükleyebilirdi.
     */
    public function test_a_rejected_selection_does_not_pollute_an_existing_context(): void
    {
        $user = User::factory()->create();
        $own = Company::factory()->withOwner($user)->create();
        $foreign = Company::factory()->create();

        $this->service()->select($user, $own);

        try {
            $this->service()->select($user, $foreign);
        } catch (CrossTenantAccessException) {
            // beklenen
        }

        $this->assertSame($own->id, $user->fresh()->active_company_id, 'active_company_id kirlendi.');
        $this->assertSame($own->id, app(CompanyContext::class)->id(), 'CompanyContext kirlendi.');
    }

    // ---------------------------------------------------------------
    // F) OTOMATİK SEÇİM
    // ---------------------------------------------------------------

    public function test_a_user_with_exactly_one_company_gets_it_selected_automatically(): void
    {
        $user = User::factory()->create();
        $company = Company::factory()->withOwner($user)->create();

        $selected = $this->service()->selectAutomatically($user);

        $this->assertNotNull($selected);
        $this->assertTrue($selected->is($company));
        $this->assertSame($company->id, $user->fresh()->active_company_id);
    }

    public function test_a_user_with_no_companies_gets_nothing_selected(): void
    {
        $user = User::factory()->create();

        $this->assertNull($this->service()->selectAutomatically($user));
        $this->assertNull($user->fresh()->active_company_id);
        $this->assertFalse(app(CompanyContext::class)->has());
    }

    public function test_a_user_with_several_companies_must_choose_explicitly(): void
    {
        $user = User::factory()->create();
        Company::factory()->withOwner($user)->create();
        Company::factory()->withMember($user)->create();

        $this->assertNull(
            $this->service()->selectAutomatically($user),
            'Birden fazla şirketi olan kullanıcı için otomatik seçim yapılmamalıydı.'
        );
        $this->assertNull($user->fresh()->active_company_id);
    }

    public function test_automatic_selection_never_overrides_an_existing_choice(): void
    {
        $user = User::factory()->create();
        $first = Company::factory()->withOwner($user)->create();

        $this->service()->select($user, $first);
        $selected = $this->service()->selectAutomatically($user);

        $this->assertTrue($selected->is($first));
        $this->assertSame($first->id, $user->fresh()->active_company_id);
    }

    // ---------------------------------------------------------------
    // L, M) MASS ASSIGNMENT
    // ---------------------------------------------------------------

    public function test_active_company_id_is_not_mass_assignable(): void
    {
        $user = User::factory()->create();
        $foreign = Company::factory()->create();

        $user->fill(['active_company_id' => $foreign->id]);

        $this->assertNull(
            $user->active_company_id,
            'active_company_id request gövdesinden doldurulabiliyor.'
        );
    }

    public function test_a_user_cannot_be_created_with_an_arbitrary_active_company(): void
    {
        $foreign = Company::factory()->create();

        $user = User::create([
            'name' => 'Sizinti Denemesi',
            'email' => 'sizinti@flowtiger.test',
            'password' => 'gizli-parola',
            'active_company_id' => $foreign->id,
        ]);

        $this->assertNull($user->fresh()->active_company_id);
    }

    public function test_updating_a_user_through_mass_assignment_cannot_change_the_active_company(): void
    {
        $user = User::factory()->create();
        $own = Company::factory()->withOwner($user)->create();
        $foreign = Company::factory()->create();

        $this->service()->select($user, $own);

        $user->update([
            'name' => 'Yeni Ad',
            'active_company_id' => $foreign->id,
        ]);

        $this->assertSame('Yeni Ad', $user->fresh()->name);
        $this->assertSame(
            $own->id,
            $user->fresh()->active_company_id,
            'Mass assignment ile başka şirkete geçilebiliyor.'
        );
    }
}
