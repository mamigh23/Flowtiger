<?php

namespace Tests\Feature\Api\V1;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * Task/Planning v1 — görev ucunun sözleşmesi.
 *
 * GÖREVLER ŞİRKET GENELİDİR. Finans owner'a özeldir çünkü şirketin mali
 * görünümüdür; yapılacak iş listesi ise operasyonel çalışmadır. Üye kendi
 * gününü yönetemiyorsa ürün işe yaramaz. Bu yüzden `TaskPolicy` üç
 * bağımsız koşulun aynısını uygular ama rol yeteneği hem owner'a hem
 * member'a açıktır.
 *
 * SUNUCUNUN YAZDIĞI ALANLAR İSTEMCİDEN GELMEZ:
 *   company_id   → aktif context (§9)
 *   created_by   → oturumdaki kullanıcı
 *   completed_at → complete ucu, sunucu saatiyle
 * Üçü de `prohibited`; sessizce yok saymak, kullanıcının "gönderdiğim
 * değer uygulandı" sanmasına yol açardı.
 *
 * DURUM TÜRETİLİR: `is_completed` yanıtta VARDIR ama saklanmaz —
 * `completed_at`ten okunur. İstemci de onu yeniden hesaplamaz.
 *
 * NORMAL İŞLEMLER AUDIT'E YAZILMAZ. Her onay kutusu işareti audit satırı
 * üretseydi denetim geçmişi bir görev akışına dönüşür ve asıl işini —
 * güvenlik ve yetki değişikliklerinin izini tutmayı — göremez hâle
 * gelirdi (§16 "devasa audit listesi").
 */
class TaskApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/tasks';

    private User $owner;

    private User $member;

    private Company $company;

    private Customer $customer;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->member = User::factory()->create();

        $this->company = Company::factory()->withOwner($this->owner)->create();

        // Bkz. setTimezone() — mali kimlik alanları mass-assignable DEĞİL.
        $this->setTimezone('Europe/Istanbul');

        $this->company->users()->attach($this->member, ['role' => 'member']);

        $this->customer = Customer::factory()->forCompany($this->company)->create(['name' => 'Zeynep Kaya']);

        app(CompanySelectionService::class)->select($this->owner, $this->company);
        app(CompanySelectionService::class)->select($this->member, $this->company);
        app(CompanyContext::class)->clear();
    }

    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    /**
     * Şirketin saat dilimini kurar — `update()` İLE DEĞİL.
     *
     * `timezone` mali kimlik alanıdır ve Company modelinde bilinçli olarak
     * mass-assignable DEĞİLDİR (§9): fillable olsaydı, gövdesine fazladan
     * alan koyan herhangi bir istek şirketin vergi numarasını sessizce
     * değiştirebilirdi. Bunun test tarafındaki sonucu şu:
     *
     *   $company->update(['timezone' => 'X'])   → SESSİZCE YOK SAYILIR
     *   Company::factory()->create(['timezone' => 'X'])  → aynı şekilde
     *
     * Fixture "kurulmuş gibi" görünür, şirket varsayılanda kalır ve test
     * gerçekte olmayan bir durumu ölçer. `forceFill` bypass'ı AÇIKÇA yapar
     * ve bellekteki örneği de günceller — böylece `$this->company->timezone`
     * ile veritabanındaki değer ayrışmaz.
     *
     * Yazılan değer geçerli bir IANA saat dilimidir; NOT NULL kısıtı ve
     * varsayılan mimarisi olduğu gibi korunur.
     */
    private function setTimezone(string $timezone): void
    {
        $this->company->forceFill(['timezone' => $timezone])->save();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Ahmet Yılmaz\'ı ara',
            'note' => 'Teklif hakkında geri dönüş',
            'scheduled_date' => '2026-08-27',
            'scheduled_time' => '09:00',
            'customer_id' => null,
            'assigned_to' => null,
        ], $overrides);
    }

    /** Scope'suz okuma — test, ölçtüğü mekanizmaya güvenerek sonuç okumamalı. */
    private function rawTask(int $id): ?Task
    {
        return Task::withoutTenantScope('test doğrulaması')->find($id);
    }

    // =================================================================
    // OLUŞTURMA
    // =================================================================

    public function test_a_task_can_be_created(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload())
            ->assertCreated()
            ->json('data');

        $this->assertSame('Ahmet Yılmaz\'ı ara', $data['title']);
        $this->assertSame('2026-08-27', $data['scheduled_date']);
        $this->assertSame('09:00', $data['scheduled_time']);
    }

    /** Saatsiz görev meşrudur: her iş bir randevu değildir. */
    public function test_a_task_can_be_created_without_a_time(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['scheduled_time' => null]))
            ->assertCreated()
            ->json('data');

        $this->assertNull($data['scheduled_time']);
    }

    public function test_a_new_task_is_not_completed(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload())
            ->assertCreated()
            ->json('data');

        $this->assertNull($data['completed_at']);
        $this->assertFalse($data['is_completed']);
    }

    /**
     * REGRESYON — OLUŞTURAN OTURUMDAN GELİR, GÖVDEDEN DEĞİL.
     */
    public function test_the_creator_is_taken_from_the_session(): void
    {
        $id = $this->apiAs($this->member)
            ->postJson(self::URI, $this->payload())
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($this->member->getKey(), $this->rawTask($id)->created_by);
    }

    public function test_the_company_is_taken_from_the_active_context(): void
    {
        $id = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload())
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($this->company->getKey(), $this->rawTask($id)->company_id);
    }

    public function test_a_task_can_reference_a_customer(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['customer_id' => $this->customer->getKey()]))
            ->assertCreated()
            ->json('data');

        $this->assertSame($this->customer->getKey(), $data['customer']['id']);
        $this->assertSame('Zeynep Kaya', $data['customer']['name']);
        $this->assertSame($this->customer->customer_no, $data['customer']['customer_no']);
    }

    public function test_a_task_can_be_assigned_to_a_member(): void
    {
        $data = $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['assigned_to' => $this->member->getKey()]))
            ->assertCreated()
            ->json('data');

        $this->assertSame($this->member->getKey(), $data['assigned_to']['id']);
    }

    // =================================================================
    // DOĞRULAMA
    // =================================================================

    public function test_a_title_is_required(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['title' => '']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('title');
    }

    public function test_a_blank_title_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['title' => '   ']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('title');
    }

    public function test_a_scheduled_date_is_required(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['scheduled_date' => null]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('scheduled_date');
    }

    public function test_the_scheduled_date_must_be_a_calendar_day(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['scheduled_date' => '2026-08-27T09:00:00Z']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('scheduled_date');
    }

    public function test_the_scheduled_time_must_be_hours_and_minutes(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['scheduled_time' => '09:00:00']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('scheduled_time');
    }

    /**
     * REGRESYON — SUNUCUNUN YAZDIĞI ALANLAR REDDEDİLİR.
     *
     * Sessizce yok saymak yerine 422: kullanıcı gönderdiği değerin
     * uygulandığını sanmamalı.
     */
    public function test_server_written_fields_are_prohibited(): void
    {
        foreach ([
            'company_id' => 999,
            'created_by' => 999,
            'completed_at' => '2026-08-27T10:00:00Z',
            'is_completed' => true,
        ] as $field => $value) {
            $this->apiAs($this->owner)
                ->postJson(self::URI, $this->payload([$field => $value]))
                ->assertStatus(422)
                ->assertJsonValidationErrors($field);
        }
    }

    /**
     * TENANT SINIRI DOĞRULAMADA ÇİZİLİR.
     *
     * Başka şirketin müşterisi 422 alır. 404 dönmek ucun kendisini
     * bulunamaz gösterirdi; 403 ise o müşterinin VAR OLDUĞUNU doğrulardı.
     */
    public function test_a_customer_from_another_company_is_rejected(): void
    {
        $otherCompany = Company::factory()->create();
        $foreign = Customer::factory()->forCompany($otherCompany)->create();

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['customer_id' => $foreign->getKey()]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_id');
    }

    /**
     * Atanan kişi ŞİRKETİN ÜYESİ olmalı.
     *
     * Aksi hâlde bir görev, o şirketi hiç görmeyen birine atanabilir ve
     * kimse onu tamamlayamazdı.
     */
    public function test_a_task_cannot_be_assigned_to_a_non_member(): void
    {
        $outsider = User::factory()->create();

        $this->apiAs($this->owner)
            ->postJson(self::URI, $this->payload(['assigned_to' => $outsider->getKey()]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('assigned_to');
    }

    // =================================================================
    // LİSTELEME
    // =================================================================

    public function test_tasks_are_listed_for_the_active_company(): void
    {
        Task::factory()->forCompany($this->company)->createdBy($this->owner)->count(3)->create();

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }

    /**
     * SIRALAMA: saate göre artan, saatsizler EN SONA.
     *
     * Saatsiz bir işi günün başına koymak, saati olan randevuların önüne
     * geçirirdi. İkincil sıra (id) zorunlu: aynı saatli iki görev
     * sayfalar arasında yer değiştirmemeli.
     */
    public function test_tasks_are_ordered_by_time_with_untimed_tasks_last(): void
    {
        $date = '2026-08-27';

        $late = $this->makeTask(['scheduled_date' => $date, 'scheduled_time' => '16:30:00']);
        $untimed = $this->makeTask(['scheduled_date' => $date, 'scheduled_time' => null]);
        $early = $this->makeTask(['scheduled_date' => $date, 'scheduled_time' => '09:00:00']);

        $ids = $this->apiAs($this->owner)
            ->getJson(self::URI.'?date='.$date)
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame(
            [$early->getKey(), $late->getKey(), $untimed->getKey()],
            $ids
        );
    }

    public function test_the_list_can_be_filtered_by_date(): void
    {
        $this->makeTask(['scheduled_date' => '2026-08-27']);
        $this->makeTask(['scheduled_date' => '2026-08-28']);

        $this->apiAs($this->owner)
            ->getJson(self::URI.'?date=2026-08-27')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_the_list_is_paginated_with_a_default_page_size(): void
    {
        Task::factory()->forCompany($this->company)->createdBy($this->owner)->count(20)->create();

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(15, 'data')
            ->assertJsonPath('meta.per_page', 15);
    }

    /**
     * Üst sınır olmazsa `?per_page=1000000` tek istekte tüm tenant'ı
     * belleğe çeker — bu bir DoS vektörüdür (§16 "unbounded list").
     */
    public function test_the_page_size_is_capped(): void
    {
        $this->apiAs($this->owner)
            ->getJson(self::URI.'?per_page=101')
            ->assertStatus(422)
            ->assertJsonValidationErrors('per_page');
    }

    // =================================================================
    // BUGÜN
    // =================================================================

    /**
     * REGRESYON — "BUGÜN" ŞİRKETİN SAAT DİLİMİNDE BELİRLENİR.
     *
     * İstemci "bugün"ü kendi saatiyle hesaplasaydı, saat dilimi
     * şirketinkinden farklı bir kullanıcı yanlış günün işlerini görürdü.
     * Mali kimlik fazında dönem sınırı için `timezone` tam olarak bu
     * tuzağa karşı NOT NULL yapılmıştı.
     */
    public function test_today_uses_the_company_timezone(): void
    {
        $this->setTimezone('Pacific/Kiritimati');

        $today = now()->setTimezone('Pacific/Kiritimati')->toDateString();
        $elsewhere = now()->setTimezone('Pacific/Kiritimati')->subDay()->toDateString();

        $mine = $this->makeTask(['scheduled_date' => $today]);
        $this->makeTask(['scheduled_date' => $elsewhere]);

        $ids = $this->apiAs($this->owner)
            ->getJson(self::URI.'/today')
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$mine->getKey()], $ids);
    }

    public function test_today_returns_an_empty_list_when_nothing_is_planned(): void
    {
        $this->makeTask(['scheduled_date' => '2020-01-01']);

        $this->apiAs($this->owner)
            ->getJson(self::URI.'/today')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    // =================================================================
    // GÜNCELLEME
    // =================================================================

    /**
     * PUT TAM DEĞİŞTİRMEDİR: gövdede olmayan alan boşaltılır.
     */
    public function test_a_task_can_be_updated(): void
    {
        $task = $this->makeTask(['title' => 'Eski başlık']);

        $data = $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$task->getKey(), $this->payload(['title' => 'Yeni başlık']))
            ->assertOk()
            ->json('data');

        $this->assertSame('Yeni başlık', $data['title']);
    }

    public function test_updating_does_not_change_the_creator(): void
    {
        $task = $this->makeTask();

        $this->apiAs($this->member)
            ->putJson(self::URI.'/'.$task->getKey(), $this->payload())
            ->assertOk();

        $this->assertSame($this->owner->getKey(), $this->rawTask($task->getKey())->created_by);
    }

    /**
     * REGRESYON — GÜNCELLEME TAMAMLANMA DURUMUNU BOZMAZ.
     *
     * Tamamlanmış bir görevin notunu düzeltmek onu yeniden açmamalı;
     * tamamlanma yalnızca kendi ucundan değişir.
     */
    public function test_updating_a_completed_task_keeps_it_completed(): void
    {
        $task = $this->makeTask(['completed_at' => now()]);

        $data = $this->apiAs($this->owner)
            ->putJson(self::URI.'/'.$task->getKey(), $this->payload(['title' => 'Düzeltilmiş']))
            ->assertOk()
            ->json('data');

        $this->assertTrue($data['is_completed']);
        $this->assertNotNull($data['completed_at']);
    }

    // =================================================================
    // TAMAMLAMA
    // =================================================================

    /**
     * TAMAMLANMA ZAMANINI SUNUCU YAZAR.
     *
     * İstemci bir işin ne zaman bitirildiğini seçemez; seçebilseydi
     * "bu haftayı ne zaman kapattık" sorusunun cevabı uydurulabilirdi.
     */
    public function test_a_task_can_be_completed(): void
    {
        $task = $this->makeTask();

        $data = $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$task->getKey().'/complete')
            ->assertOk()
            ->json('data');

        $this->assertTrue($data['is_completed']);
        $this->assertNotNull($data['completed_at']);
    }

    public function test_a_completed_task_can_be_reopened(): void
    {
        $task = $this->makeTask(['completed_at' => now()]);

        $data = $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$task->getKey().'/reopen')
            ->assertOk()
            ->json('data');

        $this->assertFalse($data['is_completed']);
        $this->assertNull($data['completed_at']);
    }

    /**
     * İKİNCİ KEZ TAMAMLAMA REDDEDİLİR.
     *
     * Sessizce başarılı dönmek ilk tamamlanma anını ÜZERİNE YAZARDI —
     * yani "bu iş ne zaman bitti" sorusunun cevabı, ikinci bir tıklamayla
     * değişirdi. Yetki hatası değil, kaydın durumu izin vermiyor: 403
     * değil 422 (PaymentException deseni).
     */
    public function test_completing_an_already_completed_task_is_rejected(): void
    {
        $task = $this->makeTask(['completed_at' => now()]);

        $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$task->getKey().'/complete')
            ->assertStatus(422)
            ->assertJsonPath('code', 'task_already_completed');
    }

    public function test_reopening_an_open_task_is_rejected(): void
    {
        $task = $this->makeTask();

        $this->apiAs($this->owner)
            ->postJson(self::URI.'/'.$task->getKey().'/reopen')
            ->assertStatus(422)
            ->assertJsonPath('code', 'task_not_completed');
    }

    // =================================================================
    // SİLME
    // =================================================================

    /**
     * GÖREV SİLİNİR, İPTAL EDİLMEZ.
     *
     * Finans kaydı void ediliyor çünkü silinmesi geçmiş bir dönemin
     * toplamını sessizce değiştirir. Yapılacak bir işin böyle bir
     * özelliği yok; yanlış yazılmış bir görevi kalıcı olarak taşımak
     * kullanıcıya hizmet etmez.
     */
    public function test_a_task_can_be_deleted(): void
    {
        $task = $this->makeTask();

        $this->apiAs($this->owner)
            ->deleteJson(self::URI.'/'.$task->getKey())
            ->assertNoContent();

        $this->assertNull($this->rawTask($task->getKey()));
    }

    /**
     * P0-04 — Member Permission Hardening.
     *
     * Member şirketin TÜM operasyonel görevlerini görüntüleyebilir,
     * oluşturabilir, güncelleyebilir ve tamamlayabilir ama SİLEMEZ — ürün
     * kararı budur. 403 doğrudur, 404 değil: görev gerçekten var ve Member
     * gerçekten bu şirketin üyesi; eksik olan yalnızca yetki.
     */
    public function test_a_member_cannot_delete_a_task(): void
    {
        $task = $this->makeTask();

        $this->apiAs($this->member)
            ->deleteJson(self::URI.'/'.$task->getKey())
            ->assertForbidden();

        $this->assertNotNull($this->rawTask($task->getKey()), 'Görev silinmemiş olmalı.');
    }

    // =================================================================
    // YETKİ
    // =================================================================

    /**
     * REGRESYON — GÖREVLER ŞİRKET GENELİDİR.
     *
     * Member da görevleri görür, oluşturur, tamamlar. Finans owner'a
     * özeldir çünkü mali görünümdür; iş listesi operasyonel çalışmadır.
     */
    public function test_a_member_can_manage_tasks(): void
    {
        $task = $this->makeTask();

        $this->apiAs($this->member)->getJson(self::URI)->assertOk();
        $this->apiAs($this->member)->postJson(self::URI, $this->payload())->assertCreated();
        $this->apiAs($this->member)
            ->postJson(self::URI.'/'.$task->getKey().'/complete')
            ->assertOk();
    }

    /**
     * Member başkasının oluşturduğu görevi de görür: liste şirketindir,
     * kişinin değil.
     */
    public function test_a_member_sees_tasks_created_by_others(): void
    {
        $this->makeTask(['title' => 'Owner\'ın işi']);

        $this->apiAs($this->member)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_an_unauthenticated_request_is_rejected(): void
    {
        $this->getJson(self::URI)->assertUnauthorized();
    }

    // =================================================================
    // YARDIMCI
    // =================================================================

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function makeTask(array $attributes = []): Task
    {
        return Task::factory()
            ->forCompany($this->company)
            ->createdBy($this->owner)
            ->create($attributes);
    }
}
