<?php

namespace App\Policies;

use App\Models\User;
use App\Services\CompanyContext;
use App\Services\MembershipService;

/**
 * Audit geçmişini kim okuyabilir?
 *
 * İlk sürümde yalnızca owner (§16). Sebebi sadece gizlilik değil: audit
 * log, kimin ne zaman ne yaptığını gösterir ve yanlış ellerde bir
 * gözetleme aracına dönüşür. Bir üyenin, iş arkadaşlarının her hareketini
 * görebilmesi varsayılan olamaz.
 *
 * Rol sorusu Role::viewsAuditLogs()'a sorulur — managesMembers()'a değil.
 * İkisi bugün aynı cevabı veriyor ama farklı sorular; ileride "denetçi"
 * rolü üye yönetmeden audit okuyabilmeli.
 *
 * Yazma yetkisi TANIMLANMADI ve tanımlanmayacak: audit kaydı API üzerinden
 * oluşturulamaz, güncellenemez, silinemez. Model seviyesindeki değişmezlik
 * bekçisi bunu ayrıca zorlar.
 */
class AuditLogPolicy
{
    public function __construct(
        private readonly CompanyContext $context,
        private readonly MembershipService $memberships,
    ) {}

    public function viewAny(User $actor): bool
    {
        if (! $this->context->has()) {
            return false;
        }

        $company = $this->context->getOrFail();

        // Savunma derinliği: context doğru kurulmuş olsa bile üyelik
        // yeniden doğrulanır (CustomerPolicy ve CompanyMemberPolicy ile
        // aynı yaklaşım).
        if (! $actor->isMemberOf($company)) {
            return false;
        }

        return $this->memberships->roleOf($company, $actor)?->viewsAuditLogs() ?? false;
    }
}
