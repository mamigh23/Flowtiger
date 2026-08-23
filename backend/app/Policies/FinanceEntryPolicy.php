<?php

namespace App\Policies;

use App\Models\FinanceEntry;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\MembershipService;

/**
 * Finans kayıtlarının yetki katmanı (Faz 7 / Adım 3).
 *
 * OWNER-ONLY. Finans kayıtları şirketin mali görünümüdür ve audit ile
 * aynı sınıfa girer.
 *
 * ÜÇ BAĞIMSIZ KOŞUL — CustomerPolicy'nin savunma derinliği artı rol:
 *   1. Aktif company context olmalı.
 *   2. Kayıt (varsa) o şirkete ait olmalı.
 *   3. Kullanıcının o şirketteki rolü finans yetkisi taşımalı.
 *
 * Üçüncüsü olmasaydı her üye şirketin tüm mali durumunu görürdü.
 *
 * MEMBER İÇİN 403 DOĞRUDUR, 404 DEĞİL: kayıt vardır ve kullanıcı da
 * şirketin üyesidir; eksik olan yalnızca yetkidir. Varlık gizlemenin bir
 * anlamı yok. Başka TENANT'ın kaydı ise route model binding'de
 * CompanyScope'a takılır ve controller'a hiç ulaşmadan 404 olur.
 *
 * Rol sorusu Role'ün yetenek metotlarına sorulur, `$role === Role::Owner`
 * diye buraya yazılmaz — AuditLogPolicy deseni (§3).
 */
class FinanceEntryPolicy
{
    public function __construct(
        private readonly CompanyContext $context,
        private readonly MembershipService $memberships,
    ) {}

    public function viewAny(User $user): bool
    {
        return $this->roleAllows($user, 'viewsFinance');
    }

    public function view(User $user, FinanceEntry $entry): bool
    {
        return $this->belongsToActiveCompany($entry)
            && $this->roleAllows($user, 'viewsFinance');
    }

    public function create(User $user): bool
    {
        return $this->roleAllows($user, 'managesFinance');
    }

    public function update(User $user, FinanceEntry $entry): bool
    {
        return $this->belongsToActiveCompany($entry)
            && $this->roleAllows($user, 'managesFinance');
    }

    /**
     * İptal, güncellemeyle aynı yetkiyi ister.
     *
     * Ayrı bir metot olarak duruyor çünkü ayrı bir sorudur: ileride
     * "kaydı düzeltebilir ama iptal edemez" gibi bir rol tanımlanabilir.
     */
    public function void(User $user, FinanceEntry $entry): bool
    {
        return $this->belongsToActiveCompany($entry)
            && $this->roleAllows($user, 'managesFinance');
    }

    private function belongsToActiveCompany(FinanceEntry $entry): bool
    {
        if (! $this->context->has()) {
            return false;
        }

        return (int) $entry->company_id === $this->context->id();
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
