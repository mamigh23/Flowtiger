<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Exceptions\TaskException;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Görevlerin iş mantığı (Task/Planning v1).
 *
 * NORMAL İŞLEMLER AUDIT'E YAZILMAZ. Oluşturma, güncelleme, tamamlama ve
 * yeniden açma iz bırakmaz. Her onay kutusu işareti bir audit satırı
 * üretseydi denetim geçmişi bir görev akışına dönüşür ve asıl işini —
 * güvenlik ve yetki değişikliklerinin izini tutmayı — göremez hâle
 * gelirdi (§16 "devasa audit listesi").
 *
 * SİLME İSTİSNADIR VE YAZILIR. Silinen görev geri gelmez; "bu iş listede
 * vardı, şimdi yok" sorusunun cevabı bir yerde durmalı. Kayıt SİLMEDEN
 * ÖNCE ve aynı transaction içinde yazılır (§9).
 *
 * `note` AUDIT'E GİRMEZ: serbest metindir ve kullanıcı oraya kişisel veri
 * yazabilir. Audit tablosu tasarım gereği kalıcıdır; oraya yazılan bir not
 * asla silinemez. PaymentService'teki kararla aynı.
 */
class TaskService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $attributes  TaskRequest::validated()
     */
    public function create(Company $company, User $creator, array $attributes): Task
    {
        $task = new Task;

        $task->fill($this->attributes($attributes));

        // Sahiplik ve oluşturan gövdeden GELMEZ (§9).
        $task->company_id = $company->getKey();
        $task->created_by = $creator->getKey();

        $task->save();

        return $task;
    }

    /**
     * PUT: görevin tam hâli yazılır.
     *
     * TAMAMLANMA DURUMUNA DOKUNULMAZ. Tamamlanmış bir görevin notunu
     * düzeltmek onu yeniden açmamalı; tamamlanma yalnızca kendi ucundan
     * değişir.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function update(Company $company, Task $task, array $attributes): Task
    {
        $task->fill($this->attributes($attributes));
        $task->save();

        return $task;
    }

    /**
     * Görevi tamamlar — zamanı SUNUCU yazar.
     *
     * @throws TaskException
     */
    public function complete(Company $company, Task $task): Task
    {
        if ($task->isCompleted()) {
            throw TaskException::alreadyCompleted();
        }

        $task->completed_at = now();
        $task->save();

        return $task;
    }

    /**
     * @throws TaskException
     */
    public function reopen(Company $company, Task $task): Task
    {
        if (! $task->isCompleted()) {
            throw TaskException::notCompleted();
        }

        $task->completed_at = null;
        $task->save();

        return $task;
    }

    /**
     * Görevi siler — void ETMEZ.
     *
     * Finans kaydı iptal ediliyor çünkü silinmesi geçmiş bir dönemin
     * toplamını sessizce değiştirir. Yapılacak bir işin böyle bir
     * özelliği yok; yanlış yazılmış bir görevi kalıcı olarak taşımak
     * kullanıcıya hizmet etmez.
     *
     * Audit kaydı silmeden ÖNCE ve aynı transaction içinde yazılır: iki
     * ayrı işlem olsaydı arada bir hata "silinmiş ama izi olmayan" ya da
     * "izi olan ama silinmemiş" bir görev bırakırdı.
     */
    public function delete(Company $company, Task $task): void
    {
        DB::transaction(function () use ($company, $task): void {
            $this->audit->record(
                action: AuditAction::TaskDeleted,
                company: $company,
                auditable: $task,
                oldValues: [
                    'title' => $task->title,
                    'scheduled_date' => $task->scheduled_date?->format('Y-m-d'),
                    'completed_at' => $task->completed_at?->toIso8601String(),
                ],
            );

            $task->delete();
        });
    }

    /**
     * Toplu atanabilir alanlar — sunucunun yazdıkları hariç.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function attributes(array $attributes): array
    {
        return [
            'title' => $attributes['title'],
            'note' => $attributes['note'] ?? null,
            'scheduled_date' => $attributes['scheduled_date'],
            'scheduled_time' => $attributes['scheduled_time'] ?? null,
            'assigned_to' => $attributes['assigned_to'] ?? null,
            'customer_id' => $attributes['customer_id'] ?? null,
        ];
    }
}
