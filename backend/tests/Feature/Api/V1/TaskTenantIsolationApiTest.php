<?php

namespace Tests\Feature\Api\V1;

use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * Task/Planning v1 — görevin izolasyon kanıtı.
 *
 * CRUD davranışı ayrı dosyada (TaskApiTest). Burada ölçülen şey işlevsellik
 * değil GÜVENLİKTİR ve bir güvenlik kanıtının CRUD testleri arasında
 * kaybolmaması gerekir.
 *
 *                      A'nın görevi   B'nin görevi
 *   A kullanıcısı          ✅              ❌
 *   B kullanıcısı          ❌              ✅
 *
 * REDDİN ŞEKLİ: başka tenant'ın kaydı için 403 değil 404. 403, "böyle bir
 * kayıt var ama senin değil" bilgisini verirdi ve id taramasıyla rakip
 * şirketin kaç görevi olduğu çıkarılabilirdi.
 *
 * FİNANSTAN FARK: burada MEMBER İÇİN 403 YOKTUR. Görevler şirket
 * genelidir; üye de kendi şirketinin işlerini görür ve yönetir. Reddedilen
 * tek şey BAŞKA ŞİRKETİN kaydıdır ve o da 404 olur.
 */
class TaskTenantIsolationApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/tasks';

    private User $ownerA;

    private User $ownerB;

    private User $memberA;

    private Company $companyA;

    private Company $companyB;

    private Task $taskA;

    private Task $taskB;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->ownerA = User::factory()->create();
        $this->ownerB = User::factory()->create();
        $this->memberA = User::factory()->create();

        $this->companyA = Company::factory()->withOwner($this->ownerA)->create(['name' => 'Sirket A']);
        $this->companyB = Company::factory()->withOwner($this->ownerB)->create(['name' => 'Sirket B']);

        $this->companyA->users()->attach($this->memberA, ['role' => 'member']);

        /*
         * Fixture'lar context YOKKEN kuruluyor: test, ölçtüğü mekanizmayı
         * kurarken kullanmamalı.
         *
         * TARİH AÇIKÇA VERİLİYOR VE BUGÜN DEĞİL.
         *
         * TaskFactory'nin varsayılanı sabit bir takvim günüdür ('2026-08-27').
         * Sabit bir varsayılan, yılda bir gün "bugün"e denk gelir — ve o gün
         * `/today` sorgulayan her test sessizce fazladan kayıt görür. Bu
         * dosyada tam olarak bu oldu: taban görevler bugüne düştü ve izolasyon
         * testi 1 yerine 2 kayıt saydı.
         *
         * Taban tarih `now()`dan TÜRETİLİYOR, sabit yazılmıyor: hangi gün
         * çalışırsa çalışsın bugüne denk gelemez. Fixture'ı bugünün dışına
         * almak semptomu gizlemek değil — testin ölçmek istediği durumu
         * gerçekten kurmak.
         */
        $baseline = now()->subYear()->toDateString();

        $this->taskA = Task::factory()->forCompany($this->companyA)->createdBy($this->ownerA)
            ->create(['scheduled_date' => $baseline]);
        $this->taskB = Task::factory()->forCompany($this->companyB)->createdBy($this->ownerB)
            ->create(['scheduled_date' => $baseline]);

        $this->giveActiveCompany($this->ownerA, $this->companyA);
        $this->giveActiveCompany($this->ownerB, $this->companyB);
        $this->giveActiveCompany($this->memberA, $this->companyA);
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

    // =================================================================
    // LİSTELEME
    // =================================================================

    public function test_a_company_only_sees_its_own_tasks(): void
    {
        $ids = $this->apiAs($this->ownerA)
            ->getJson(self::URI)
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$this->taskA->getKey()], $ids);
    }

    public function test_the_today_endpoint_is_also_scoped(): void
    {
        /*
         * `fresh()` ZORUNLU.
         *
         * `timezone` NOT NULL'dur ve varsayılanı VERİTABANINDA tanımlıdır
         * (Europe/Istanbul). Eloquent insert'ten sonra modeli tazelemez;
         * factory bu alanı göndermediği için BELLEKTEKİ örnekte değer
         * `null` kalır — sütun dolu olsa bile.
         *
         * Kod tabanının kendi konvansiyonu da bu: FiscalIdentitySchemaTest
         * ve CompanyBillingApiTest `timezone` okurken `fresh()` kullanıyor.
         */
        $today = now()->setTimezone($this->companyA->fresh()->timezone)->toDateString();

        $mine = Task::factory()->forCompany($this->companyA)->createdBy($this->ownerA)
            ->create(['scheduled_date' => $today]);
        $theirs = Task::factory()->forCompany($this->companyB)->createdBy($this->ownerB)
            ->create(['scheduled_date' => $today]);

        $returned = $this->apiAs($this->ownerA)
            ->getJson(self::URI.'/today')
            ->assertOk()
            ->json('data.*.id');

        /*
         * SAYI DEĞİL KİMLİK: hangi görevin döndüğü kilitleniyor.
         *
         * `assertJsonCount(1)` doğru sayıyı görünce susardı — ama yanlış
         * kaydın döndüğü bir sızıntıda sayı yine 1 olabilirdi. Kimlik
         * iddiası hem sayıyı hem içeriği kapsar ve bir hata durumunda
         * PHPUnit'in çıktısı hangi id'lerin geldiğini doğrudan gösterir.
         *
         * İddia gevşemedi — aksine, sayının kapsadığı her şeyi kapsıyor
         * ve üstüne kimliği de ekliyor.
         */
        $this->assertSame([$mine->getKey()], $returned);
        $this->assertNotContains($theirs->getKey(), $returned);
    }

    // =================================================================
    // TEKİL ERİŞİM
    // =================================================================

    public function test_reading_another_companys_task_returns_not_found(): void
    {
        $this->apiAs($this->ownerA)
            ->getJson(self::URI.'/'.$this->taskB->getKey())
            ->assertNotFound();
    }

    public function test_updating_another_companys_task_returns_not_found(): void
    {
        $this->apiAs($this->ownerA)
            ->putJson(self::URI.'/'.$this->taskB->getKey(), [
                'title' => 'Sızma denemesi',
                'scheduled_date' => '2026-08-27',
                'scheduled_time' => null,
                'customer_id' => null,
                'assigned_to' => null,
            ])
            ->assertNotFound();

        $this->assertNotSame(
            'Sızma denemesi',
            Task::withoutTenantScope('test doğrulaması')->find($this->taskB->getKey())->title
        );
    }

    public function test_deleting_another_companys_task_returns_not_found(): void
    {
        $this->apiAs($this->ownerA)
            ->deleteJson(self::URI.'/'.$this->taskB->getKey())
            ->assertNotFound();

        $this->assertNotNull(Task::withoutTenantScope('test doğrulaması')->find($this->taskB->getKey()));
    }

    public function test_completing_another_companys_task_returns_not_found(): void
    {
        $this->apiAs($this->ownerA)
            ->postJson(self::URI.'/'.$this->taskB->getKey().'/complete')
            ->assertNotFound();

        $this->assertNull(
            Task::withoutTenantScope('test doğrulaması')->find($this->taskB->getKey())->completed_at
        );
    }

    public function test_reopening_another_companys_task_returns_not_found(): void
    {
        $this->taskB->forceFill(['completed_at' => now()])->save();

        $this->apiAs($this->ownerA)
            ->postJson(self::URI.'/'.$this->taskB->getKey().'/reopen')
            ->assertNotFound();

        $this->assertNotNull(
            Task::withoutTenantScope('test doğrulaması')->find($this->taskB->getKey())->completed_at
        );
    }

    // =================================================================
    // ÜYE ERİŞİMİ
    // =================================================================

    /**
     * Üye KENDİ şirketinin görevine erişir — finanstan farklı olarak
     * burada rol kapısı yoktur.
     */
    public function test_a_member_can_reach_their_own_companys_task(): void
    {
        $this->apiAs($this->memberA)
            ->getJson(self::URI.'/'.$this->taskA->getKey())
            ->assertOk();
    }

    /**
     * Ama üye de başka şirketin görevini göremez: rol yetkisi tenant
     * sınırının yerine geçmez.
     */
    public function test_a_member_cannot_reach_another_companys_task(): void
    {
        $this->apiAs($this->memberA)
            ->getJson(self::URI.'/'.$this->taskB->getKey())
            ->assertNotFound();
    }

    // =================================================================
    // BAĞLI KAYITLAR
    // =================================================================

    /**
     * Başka şirketin üyesine atama YAPILAMAZ.
     *
     * Doğrulamada reddedilir (422), 404 değil: uç bulunabilir durumdadır,
     * gönderilen değer geçersizdir.
     */
    public function test_a_task_cannot_be_assigned_to_another_companys_user(): void
    {
        $this->apiAs($this->ownerA)
            ->postJson(self::URI, [
                'title' => 'Yabancıya atama',
                'scheduled_date' => '2026-08-27',
                'scheduled_time' => null,
                'customer_id' => null,
                'assigned_to' => $this->ownerB->getKey(),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('assigned_to');
    }
}
