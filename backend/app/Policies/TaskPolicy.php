<?php

namespace App\Policies;

use App\Models\Task;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\MembershipService;

/**
 * Görevlerin yetki katmanı (Task/Planning v1).
 *
 * FinanceEntryPolicy'nin ÜÇ BAĞIMSIZ KOŞULU aynen geçerli:
 *   1. Aktif company context olmalı.
 *   2. Kayıt (varsa) o şirkete ait olmalı.
 *   3. Kullanıcının o şirketteki rolü görev yetkisi taşımalı.
 *
 * AMA OWNER-ONLY DEĞİL — view/create/update/complete için. Finans şirketin
 * mali görünümüdür; görev listesi operasyonel çalışmadır. Üye kendi gününü
 * yönetemiyorsa ürün işe yaramaz. Üçüncü koşul bu dört eylem için her iki
 * rolde de geçiyor — koşulun kendisi yine de duruyor, çünkü rol sorusu
 * Role'ün yetenek metotlarına sorulur, `$role === Role::Owner` diye buraya
 * yazılmaz (§3).
 *
 * DELETE İSTİSNADIR (P0-04 — Member Permission Hardening): silme geri
 * alınamaz (görev void edilmez, silinir) ve `deletesTasks()` yeteneği
 * yalnızca Owner'da true döner. Aynı üç-koşul iskeleti kullanılır, üçüncü
 * koşulun sorduğu yetenek farklıdır — bu yüzden ayrı bir metot ya da yeni
 * bir soyutlama eklenmedi.
 *
 * Başka TENANT'ın görevi buraya HİÇ ULAŞMAZ: route model binding sorgusu
 * CompanyScope'un altından geçer ve 404 olur. İkinci koşul yine de
 * duruyor — savunma derinliği, tek bir scope'un unutulmasına karşı.
 */
class TaskPolicy
{
    public function __construct(
        private readonly CompanyContext $context,
        private readonly MembershipService $memberships,
    ) {}

    public function viewAny(User $user): bool
    {
        return $this->roleAllows($user, 'viewsTasks');
    }

    public function view(User $user, Task $task): bool
    {
        return $this->belongsToActiveCompany($task)
            && $this->roleAllows($user, 'viewsTasks');
    }

    public function create(User $user): bool
    {
        return $this->roleAllows($user, 'managesTasks');
    }

    public function update(User $user, Task $task): bool
    {
        return $this->belongsToActiveCompany($task)
            && $this->roleAllows($user, 'managesTasks');
    }

    public function delete(User $user, Task $task): bool
    {
        return $this->belongsToActiveCompany($task)
            && $this->roleAllows($user, 'deletesTasks');
    }

    /**
     * Tamamlama VE yeniden açma.
     *
     * FinanceEntry'de `void` ayrı bir metottu çünkü iptal, güncellemeden
     * FARKLI bir sorudur (kaydın mali geçerliliğini sonlandırmak).
     * Tamamlama ile yeniden açma ise AYNI sorudur — "bu kullanıcı işin
     * durumunu değiştirebilir mi?" — ve ikisini ayırmak, aynı cevabı iki
     * yerde tekrarlamak olurdu.
     */
    public function complete(User $user, Task $task): bool
    {
        return $this->belongsToActiveCompany($task)
            && $this->roleAllows($user, 'managesTasks');
    }

    private function belongsToActiveCompany(Task $task): bool
    {
        if (! $this->context->has()) {
            return false;
        }

        return (int) $task->company_id === $this->context->id();
    }

    /**
     * Kullanıcının AKTİF ŞİRKETTEKİ rolü bu yeteneği taşıyor mu?
     */
    private function roleAllows(User $user, string $capability): bool
    {
        if (! $this->context->has()) {
            return false;
        }

        $role = $this->memberships->roleOf($this->context->getOrFail(), $user);

        return $role?->{$capability}() ?? false;
    }
}
