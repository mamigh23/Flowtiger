<?php

namespace App\Policies;

use App\Models\Invitation;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\MembershipService;

/**
 * Davetleri kim yönetebilir?
 *
 * Davet göndermek, üye eklemenin gecikmeli hâlidir — bu yüzden yetki
 * sorusu Role::managesMembers()'a sorulur, yeni bir yetenek tanımlanmaz.
 * Ayrı bir "davet gönderebilir" yeteneği, üye yönetemeyen birinin şirkete
 * üye sokabilmesi gibi tuhaf bir boşluk yaratırdı.
 *
 * SORUMLULUK SINIRI (CompanyMemberPolicy ile aynı):
 * Burada yalnızca İSTEĞİ YAPANIN durumu doğrulanır — aktif şirket,
 * üyelik, rol. HEDEF davetin o şirkete ait olup olmadığı
 * InvitationService::findForCompanyOrFail'in işidir ve 404 üretir:
 *
 *   403 = senin şirketinde ama rolün yetmiyor
 *   404 = senin şirketinde değil
 *
 * ACCEPT BURADA YOK ve olmamalı (§21): daveti kabul eden kişi çoğu zaman
 * hiçbir şirketin üyesi değildir, hatta hesabı bile yoktur. Onun yetkisi
 * token'a sahip olmaktır; doğrulaması InvitationService'te yapılır.
 */
class InvitationPolicy
{
    public function __construct(
        private readonly CompanyContext $context,
        private readonly MembershipService $memberships,
    ) {}

    public function viewAny(User $actor): bool
    {
        return $this->managesInvitations($actor);
    }

    public function view(User $actor, Invitation $invitation): bool
    {
        return $this->managesInvitations($actor);
    }

    public function create(User $actor): bool
    {
        return $this->managesInvitations($actor);
    }

    /**
     * Daveti iptal etme.
     */
    public function delete(User $actor, Invitation $invitation): bool
    {
        return $this->managesInvitations($actor);
    }

    private function managesInvitations(User $actor): bool
    {
        if (! $this->context->has()) {
            return false;
        }

        $company = $this->context->getOrFail();

        // Savunma derinliği: context doğru kurulmuş olsa bile üyelik
        // yeniden doğrulanır.
        if (! $actor->isMemberOf($company)) {
            return false;
        }

        return $this->memberships->roleOf($company, $actor)?->managesMembers() ?? false;
    }
}
