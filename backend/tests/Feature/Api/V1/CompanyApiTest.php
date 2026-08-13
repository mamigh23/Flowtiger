<?php

namespace Tests\Feature\Api\V1;

use App\Models\Company;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Faz 2.3 — şirket listeleme ve şirket seçme uçları.
 *
 * Bu iki uç bilinçli olarak company.context middleware'i OLMADAN çalışır:
 * kullanıcı henüz bir şirket seçmemişken de listeyi görebilmeli ve seçim
 * yapabilmelidir. Aksi halde çok şirketli kullanıcı kilitlenirdi.
 *
 * Kritik güvenlik iddiası (Anayasa §5, §11, §16):
 * BAŞARISIZ bir seçim hiçbir yan etki bırakmaz — ne veritabanında,
 * ne de bellekteki company context'te.
 */
class CompanyApiTest extends TestCase
{
    use RefreshDatabase;

    private const COMPANIES_URI = '/api/v1/companies';

    private User $user;

    private Company $ownCompany;

    private Company $foreignCompany;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();

        $this->ownCompany = Company::factory()
            ->withOwner($this->user)
            ->create(['name' => 'Kendi Sirketim']);

        // Başka bir tenant. Bu kullanıcının bu şirketle hiçbir ilişkisi yok.
        $this->foreignCompany = Company::factory()
            ->withOwner(User::factory()->create())
            ->create(['name' => 'Yabanci Sirket']);
    }

    private function selectUri(Company $company): string
    {
        return self::COMPANIES_URI.'/'.$company->getKey().'/select';
    }

    private function withTokenFor(User $user): self
    {
        return $this->withHeader(
            'Authorization',
            'Bearer '.$user->createToken('test-cihaz')->plainTextToken
        );
    }

    private function context(): CompanyContext
    {
        return app(CompanyContext::class);
    }

    // ---------------------------------------------------------------
    // A) LİSTELEME
    // ---------------------------------------------------------------

    public function test_companies_endpoint_lists_only_companies_the_user_belongs_to(): void
    {
        $secondOwnCompany = Company::factory()
            ->withMember($this->user)
            ->create(['name' => 'Ikinci Sirketim']);

        $response = $this->withTokenFor($this->user)
            ->getJson(self::COMPANIES_URI)
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $returnedIds = collect($response->json('data'))->pluck('id')->all();

        sort($returnedIds);
        $expectedIds = [$this->ownCompany->getKey(), $secondOwnCompany->getKey()];
        sort($expectedIds);

        $this->assertSame($expectedIds, $returnedIds);

        $this->assertNotContains(
            $this->foreignCompany->getKey(),
            $returnedIds,
            'Üye olunmayan şirket listede görünüyor — tenant sızıntısı.'
        );

        $this->assertStringNotContainsString(
            'Yabanci Sirket',
            $response->getContent(),
            'Başka tenant\'ın şirket adı yanıta sızmış.'
        );
    }

    public function test_companies_endpoint_returns_an_empty_list_for_a_user_without_companies(): void
    {
        $lonelyUser = User::factory()->create();

        $this->withTokenFor($lonelyUser)
            ->getJson(self::COMPANIES_URI)
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    /**
     * Listeleme aktif şirket GEREKTİRMEZ; gerektirseydi kullanıcı
     * hangi şirketi seçeceğini asla öğrenemezdi.
     */
    public function test_companies_endpoint_does_not_require_an_active_company(): void
    {
        Company::factory()->withMember($this->user)->create();

        $this->assertNull($this->user->fresh()->active_company_id);

        $this->withTokenFor($this->user)
            ->getJson(self::COMPANIES_URI)
            ->assertOk();
    }

    public function test_companies_endpoint_reports_the_active_company(): void
    {
        app(CompanySelectionService::class)->select($this->user, $this->ownCompany);
        $this->context()->clear();

        $this->withTokenFor($this->user)
            ->getJson(self::COMPANIES_URI)
            ->assertOk()
            ->assertJsonPath('meta.active_company_id', $this->ownCompany->getKey());
    }

    public function test_companies_endpoint_reports_null_when_no_company_is_active(): void
    {
        $this->withTokenFor($this->user)
            ->getJson(self::COMPANIES_URI)
            ->assertOk()
            ->assertJsonPath('meta.active_company_id', null);
    }

    public function test_companies_endpoint_requires_authentication(): void
    {
        $this->getJson(self::COMPANIES_URI)->assertUnauthorized();
    }

    /**
     * company.context bu route'a BAĞLANMAMIŞ olmalı. Bağlanırsa,
     * şirket seçmemiş kullanıcı listeyi göremez ve sistemde kilitlenir.
     */
    public function test_companies_route_is_not_behind_the_company_context_middleware(): void
    {
        $route = Route::getRoutes()->getByName('api.v1.companies.index');

        $this->assertNotNull($route, 'api.v1.companies.index route\'u bulunamadı.');

        $this->assertNotContains(
            'company.context',
            $route->gatherMiddleware(),
            'Şirket listeleme ucu company.context arkasına alınmış.'
        );
    }

    // ---------------------------------------------------------------
    // B) SEÇME — MUTLU YOL
    // ---------------------------------------------------------------

    public function test_user_can_select_a_company_they_belong_to(): void
    {
        $this->withTokenFor($this->user)
            ->postJson($this->selectUri($this->ownCompany))
            ->assertOk()
            ->assertJsonPath('data.id', $this->ownCompany->getKey())
            ->assertJsonPath('data.name', 'Kendi Sirketim');

        $this->assertSame(
            $this->ownCompany->getKey(),
            $this->user->fresh()->active_company_id,
            'Başarılı seçim active_company_id\'yi veritabanına yazmalıydı.'
        );
    }

    public function test_successful_selection_establishes_the_company_context(): void
    {
        $this->assertFalse($this->context()->has());

        $this->withTokenFor($this->user)
            ->postJson($this->selectUri($this->ownCompany))
            ->assertOk();

        $this->assertTrue($this->context()->has());
        $this->assertSame($this->ownCompany->getKey(), $this->context()->id());
    }

    public function test_user_can_switch_between_their_own_companies(): void
    {
        $otherOwnCompany = Company::factory()->withMember($this->user)->create();

        $this->withTokenFor($this->user)
            ->postJson($this->selectUri($this->ownCompany))
            ->assertOk();

        $this->withTokenFor($this->user)
            ->postJson($this->selectUri($otherOwnCompany))
            ->assertOk();

        $this->assertSame($otherOwnCompany->getKey(), $this->user->fresh()->active_company_id);
    }

    // ---------------------------------------------------------------
    // C) SEÇME — REDDEDİLEN
    // ---------------------------------------------------------------

    public function test_selecting_a_company_the_user_does_not_belong_to_returns_403(): void
    {
        $this->withTokenFor($this->user)
            ->postJson($this->selectUri($this->foreignCompany))
            ->assertForbidden();
    }

    public function test_failed_selection_does_not_change_active_company_id(): void
    {
        app(CompanySelectionService::class)->select($this->user, $this->ownCompany);
        $this->context()->clear();

        $this->withTokenFor($this->user)
            ->postJson($this->selectUri($this->foreignCompany))
            ->assertForbidden();

        $this->assertSame(
            $this->ownCompany->getKey(),
            $this->user->fresh()->active_company_id,
            'Reddedilen seçim active_company_id\'yi değiştirmiş.'
        );
    }

    public function test_failed_selection_does_not_leave_a_user_without_a_company_selected(): void
    {
        $this->assertNull($this->user->fresh()->active_company_id);

        $this->withTokenFor($this->user)
            ->postJson($this->selectUri($this->foreignCompany))
            ->assertForbidden();

        $this->assertNull(
            $this->user->fresh()->active_company_id,
            'Reddedilen seçim yine de bir şirket atamış.'
        );
    }

    /**
     * En kritik iddia: reddedilen bir seçim, ZATEN KURULU olan context'i
     * kirletmemelidir. Kirletseydi, bir isteğin reddedilmesi sonraki
     * tenant sorgularını yanlış şirkete yönlendirebilirdi.
     */
    public function test_failed_selection_does_not_pollute_an_existing_context(): void
    {
        app(CompanySelectionService::class)->select($this->user, $this->ownCompany);

        $this->assertSame($this->ownCompany->getKey(), $this->context()->id());

        $this->withTokenFor($this->user)
            ->postJson($this->selectUri($this->foreignCompany))
            ->assertForbidden();

        $this->assertSame(
            $this->ownCompany->getKey(),
            $this->context()->id(),
            'Reddedilen seçim mevcut company context\'i kirletmiş.'
        );
    }

    /**
     * 403 yanıtı, reddedilen şirket hakkında bilgi sızdırmamalıdır.
     */
    public function test_forbidden_selection_response_does_not_leak_company_details(): void
    {
        $response = $this->withTokenFor($this->user)
            ->postJson($this->selectUri($this->foreignCompany))
            ->assertForbidden();

        $this->assertStringNotContainsString('Yabanci Sirket', $response->getContent());
    }

    public function test_selecting_a_nonexistent_company_returns_404(): void
    {
        $this->withTokenFor($this->user)
            ->postJson(self::COMPANIES_URI.'/999999/select')
            ->assertNotFound();
    }

    public function test_select_requires_authentication(): void
    {
        $this->postJson($this->selectUri($this->ownCompany))->assertUnauthorized();

        $this->assertNull(
            $this->user->fresh()->active_company_id,
            'Kimliği doğrulanmamış istek active_company_id\'yi değiştirmiş.'
        );
    }

    /**
     * Üyeliği sonradan kaldırılan kullanıcı, o şirketi artık seçemez.
     */
    public function test_a_user_whose_membership_was_revoked_can_no_longer_select_the_company(): void
    {
        $this->ownCompany->users()->detach($this->user->getKey());

        $this->withTokenFor($this->user)
            ->postJson($this->selectUri($this->ownCompany))
            ->assertForbidden();
    }
}
