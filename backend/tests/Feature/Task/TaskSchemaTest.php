<?php

namespace Tests\Feature\Task;

use App\Models\Company;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Task/Planning v1 — görevin ŞEMA sözleşmesi.
 *
 * Bu dosya API'ye bakmaz; veritabanının kendisine bakar. Burada
 * kanıtlanan kurallar uygulama katmanı yanlış yazılsa bile geçerli
 * kalmalıdır (finans şema testleriyle aynı yaklaşım).
 *
 * PLANLANAN GÜN BİR TAKVİM GÜNÜDÜR, TAMAMLANMA BİR ANDIR.
 * `scheduled_date` DATE, `completed_at` TIMESTAMP. İkisini aynı tipte
 * saklamak, saat dilimi sınırında görevin bir gün kaymasına yol açardı —
 * `financial_date` için verilen kararla aynı (§A8).
 *
 * DURUM SÜTUNU YOKTUR. `is_completed` diye bir alan bulunmaz; durum
 * `completed_at`ten türetilir. İki kaynaktan türeyen bir gerçek er ya da
 * geç ikiye ayrılır — InvitationStatus ve `voided_at` ile aynı karar.
 *
 * GÖREV SİLİNEBİLİR. Finans kaydı void ediliyor çünkü silinmesi geçmiş
 * bir dönemin toplamını sessizce değiştirir. Bir yapılacak işin böyle bir
 * özelliği yok; ona void uygulamak deseni anlamadan taklit etmek olurdu.
 */
class TaskSchemaTest extends TestCase
{
    use RefreshDatabase;

    private const TABLE = 'tasks';

    // =================================================================
    // SÜTUNLARIN VARLIĞI VE TİPLERİ
    // =================================================================

    public function test_the_table_has_all_required_columns(): void
    {
        foreach ([
            'id',
            'company_id',
            'title',
            'note',
            'scheduled_date',
            'scheduled_time',
            'completed_at',
            'created_by',
            'assigned_to',
            'customer_id',
            'created_at',
            'updated_at',
        ] as $column) {
            $this->assertTrue(
                Schema::hasColumn(self::TABLE, $column),
                self::TABLE." tablosunda '$column' sütunu yok."
            );
        }
    }

    /**
     * DURUM SÜTUNU BULUNMAMALI.
     *
     * `is_completed` eklenirse `completed_at` ile ikisi arasında bir gün
     * mutlaka çelişki doğar: biri güncellenip diğeri unutulur ve "bu iş
     * bitti mi?" sorusunun iki farklı cevabı olur.
     */
    public function test_there_is_no_stored_completion_flag(): void
    {
        foreach (['is_completed', 'completed', 'status', 'is_done'] as $column) {
            $this->assertFalse(
                Schema::hasColumn(self::TABLE, $column),
                "Durum saklanmamalı; '$column' sütunu bulundu."
            );
        }
    }

    /**
     * v1 KAPSAM SINIRI.
     *
     * Öncelik, tekrar ve AI kaynağı bilinçli olarak YOK. "İleride lazım
     * olur" gerekçesiyle eklenen bir sütun, kullanılmadığı sürece yalnızca
     * her sorguyu ve her formu bir tık daha karmaşık yapar (§3.6 YAGNI).
     */
    public function test_deferred_features_have_no_columns_yet(): void
    {
        foreach (['priority', 'recurrence_rule', 'recurring', 'source', 'parent_task_id'] as $column) {
            $this->assertFalse(
                Schema::hasColumn(self::TABLE, $column),
                "v1 kapsamı dışındaki '$column' sütunu eklenmiş."
            );
        }
    }

    /**
     * Planlanan gün bir TAKVİM GÜNÜDÜR, bir an değil.
     */
    public function test_the_scheduled_date_is_a_calendar_date_not_a_timestamp(): void
    {
        $this->assertSame('date', Schema::getColumnType(self::TABLE, 'scheduled_date'));
    }

    /**
     * Saat AYRI bir sütundur ve saatsiz görev meşrudur.
     *
     * Tarih ve saati tek bir timestamp'te birleştirmek, saati olmayan bir
     * görev için uydurma bir saat (00:00) yazmayı gerektirirdi — ve o
     * saat raporda gerçek bir randevu gibi görünürdü.
     */
    public function test_the_scheduled_time_is_a_separate_optional_column(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();

        $id = DB::table(self::TABLE)->insertGetId(
            $this->rawRow($company, $creator, ['scheduled_time' => null])
        );

        $this->assertNull(DB::table(self::TABLE)->where('id', $id)->value('scheduled_time'));
    }

    // =================================================================
    // NULL EDİLEBİLİRLİK
    // =================================================================

    public function test_a_new_task_is_not_completed(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();

        $id = DB::table(self::TABLE)->insertGetId($this->rawRow($company, $creator));

        $this->assertNull(DB::table(self::TABLE)->where('id', $id)->value('completed_at'));
    }

    public function test_an_assignee_is_optional(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();

        $id = DB::table(self::TABLE)->insertGetId(
            $this->rawRow($company, $creator, ['assigned_to' => null])
        );

        $this->assertNull(DB::table(self::TABLE)->where('id', $id)->value('assigned_to'));
    }

    public function test_a_customer_is_optional(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();

        $id = DB::table(self::TABLE)->insertGetId($this->rawRow($company, $creator));

        $this->assertNull(DB::table(self::TABLE)->where('id', $id)->value('customer_id'));
    }

    public function test_the_company_is_required(): void
    {
        $creator = User::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow(null, $creator));
    }

    /**
     * "BUNU KİM PLANLADI?" SORUSU CEVAPSIZ KALAMAZ.
     *
     * Şirket geneli görünürlükte görevleri herkes görüyor; kimin
     * eklediğini bilmemek, listenin kime ait olduğunu belirsizleştirirdi.
     */
    public function test_the_creator_is_required(): void
    {
        $company = Company::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow($company, null));
    }

    public function test_the_title_is_required(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow($company, $creator, ['title' => null]));
    }

    public function test_the_scheduled_date_is_required(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow($company, $creator, ['scheduled_date' => null]));
    }

    // =================================================================
    // VERİTABANI KISITLARI
    // =================================================================

    /**
     * BOŞLUKTAN İBARET BAŞLIK KABUL EDİLMEZ.
     *
     * FormRequest bunu zaten yakalıyor; kısıt burada da duruyor çünkü
     * başlıksız bir görev listede görünmez bir satır olur ve kullanıcı
     * onu ne okuyabilir ne de silebilir.
     */
    public function test_a_blank_title_is_rejected_by_the_database(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();

        $this->expectException(QueryException::class);

        DB::table(self::TABLE)->insert($this->rawRow($company, $creator, ['title' => '   ']));
    }

    // =================================================================
    // İLİŞKİLER
    // =================================================================

    public function test_deleting_a_company_removes_its_tasks(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();

        DB::table(self::TABLE)->insert($this->rawRow($company, $creator));

        $company->delete();

        $this->assertSame(0, DB::table(self::TABLE)->count());
    }

    /**
     * Müşteri silinince görev SİLİNMEZ, bağlantı kopar.
     *
     * "Ahmet'i ara" görevi, Ahmet kayıttan çıkarılsa bile hâlâ yapılacak
     * bir iştir. Cascade delete, kullanıcının gününü habersiz boşaltırdı.
     */
    public function test_deleting_a_customer_detaches_the_task_but_keeps_it(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();
        $customer = Customer::factory()->forCompany($company)->create();

        DB::table(self::TABLE)->insert(
            $this->rawRow($company, $creator, ['customer_id' => $customer->getKey()])
        );

        $customer->delete();

        $this->assertSame(1, DB::table(self::TABLE)->count());
        $this->assertNull(DB::table(self::TABLE)->value('customer_id'));
    }

    /**
     * Atanan kişi silinince görev SİLİNMEZ, ataması boşalır.
     *
     * İş ortadan kalkmaz; yalnızca sahipsiz kalır ve yeniden atanabilir.
     */
    public function test_deleting_the_assignee_detaches_the_task_but_keeps_it(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();
        $assignee = User::factory()->create();

        DB::table(self::TABLE)->insert(
            $this->rawRow($company, $creator, ['assigned_to' => $assignee->getKey()])
        );

        $assignee->delete();

        $this->assertSame(1, DB::table(self::TABLE)->count());
        $this->assertNull(DB::table(self::TABLE)->value('assigned_to'));
    }

    // =================================================================
    // MODEL SÖZLEŞMESİ
    // =================================================================

    /**
     * SAHİPLİK VE SUNUCUNUN YAZDIĞI ALANLAR TOPLU ATANAMAZ.
     *
     * `company_id` tenant sahipliğidir ve aktif context'ten gelir (§9).
     * `completed_at` sunucunun yazdığı bir zaman damgasıdır: istemci bir
     * işin NE ZAMAN bitirildiğini seçemez. `created_by` de aynı sebeple
     * dışarıdadır — başkasının adına görev eklenemez.
     */
    public function test_ownership_and_server_written_columns_are_not_mass_assignable(): void
    {
        $fillable = (new Task)->getFillable();

        foreach (['company_id', 'completed_at', 'created_by'] as $column) {
            $this->assertNotContains(
                $column,
                $fillable,
                "Task::\$fillable '$column' alanını içermemeli."
            );
        }
    }

    public function test_the_model_uses_the_company_tenant_scope(): void
    {
        $this->assertContains(
            BelongsToCompany::class,
            class_uses_recursive(Task::class),
            'Task tenant scope trait\'ini kullanmıyor.'
        );
    }

    /**
     * Durum modelde de TÜRETİLİR, saklanmaz.
     */
    public function test_completion_is_derived_from_the_timestamp(): void
    {
        $company = Company::factory()->create();
        $creator = User::factory()->create();

        DB::table(self::TABLE)->insert($this->rawRow($company, $creator));

        $task = Task::withoutTenantScope('şema testi: tenant context kurulmadı')->first();

        $this->assertFalse($task->isCompleted());

        $task->completed_at = now();

        $this->assertTrue($task->isCompleted());
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function rawRow(?Company $company, ?User $creator, array $overrides = []): array
    {
        return array_merge([
            'company_id' => $company?->getKey(),
            'title' => 'Ahmet Yılmaz\'ı ara',
            'note' => null,
            'scheduled_date' => '2026-08-27',
            'scheduled_time' => '09:00:00',
            'completed_at' => null,
            'created_by' => $creator?->getKey(),
            'assigned_to' => null,
            'customer_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides);
    }
}
