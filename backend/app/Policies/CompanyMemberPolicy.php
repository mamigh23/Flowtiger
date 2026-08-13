<?php

namespace App\Policies;

use App\Models\User;
use App\Services\CompanyContext;
use App\Services\MembershipService;

/**
 * Üye yönetiminin yetki katmanı.
 *
 * Modeli User'dır ama sorduğu soru kullanıcı hakkında DEĞİLDİR:
 * "isteği yapan kişi, AKTİF ŞİRKETİN üyelerini yönetebilir mi?"
 * Rol kullanıcıya değil üyeliğe ait olduğu için cevap her zaman aktif
 * company context'e bağlıdır. Bu yüzden policy AppServiceProvider'da
 * açıkça kaydedilir; isimlendirme yoluyla otomatik keşfedilen bir
 * "UserPolicy" olsaydı, uygulamadaki her User yetkilendirmesi sessizce
 * şirket üyeliği kuralına tabi olurdu.
 *
 * SORUMLULUK SINIRI — bilinçli:
 * Burada yalnızca İSTEĞİ YAPANIN durumu doğrulanır (aktif şirket +
 * üyelik + rol). HEDEF kullanıcının o şirkete ait olup olmadığı burada
 * KONTROL EDİLMEZ; o iş MembershipService::findMemberOrFail'e aittir ve
 * 404 üretir. Bölünme kasıtlıdır:
 *
 *   403 = "senin şirketinde ama rolün yetmiyor"
 *   404 = "senin şirketinde değil"
 *
 * Policy'ye hedef kontrolü de konsaydı her red 403 olur, başka tenant'ın
 * kullanıcı ID'lerinin varlığı doğrulanabilirdi.
 */
class CompanyMemberPolicy
{
    public function __construct(
        private readonly CompanyContext $context,
        private readonly MembershipService $memberships,
    ) {}

    public function viewAny(User $actor): bool
    {
        return $this->managesMembers($actor);
    }

    public function view(User $actor, User $member): bool
    {
        return $this->managesMembers($actor);
    }

    public function create(User $actor): bool
    {
        return $this->managesMembers($actor);
    }

    public function update(User $actor, User $member): bool
    {
        return $this->managesMembers($actor);
    }

    /**
     * Rol değiştirme.
     *
     * Ayrı bir yetenek olarak durur çünkü mass assignment ile
     * karıştırılamayacak kadar tehlikelidir: bir üyenin kendini owner
     * yapması, tüm şirketin kontrolünü ele geçirmesi demektir (§10, §11).
     * Yalnızca üye yönetebilen roller çağırabilir; member için daima false.
     *
     * "Son owner member yapılamaz" kuralı BURADA DEĞİL serviste yaşar:
     * bu bir yetki sorusu değil, veritabanı durumuna bağlı bir sistem
     * kuralıdır ve kontrolü ile yazması aynı kilit altında olmalıdır.
     */
    public function changeRole(User $actor, User $member): bool
    {
        return $this->managesMembers($actor);
    }

    /**
     * Üyelik kaldırma.
     *
     * Owner kendi üyeliğini SİLEMEZ (§5, §12). Bu kural rol kontrolünden
     * ÖNCE gelir: yanlışlıkla kendini şirketten atmak, son owner olmasa
     * bile geri alınamaz bir işlemdir ve bunu ancak başka bir owner
     * yapabilmelidir.
     */
    public function delete(User $actor, User $member): bool
    {
        if ($actor->is($member)) {
            return false;
        }

        return $this->managesMembers($actor);
    }

    /**
     * İsteği yapan, aktif şirketin üyelerini yönetebilir mi?
     *
     * Üç koşul da sağlanmalı (§14):
     *   1. aktif bir company context var
     *   2. kullanıcı gerçekten o şirketin üyesi
     *   3. üyelik rolü üye yönetimine izin veriyor
     *
     * 2. adım, context'in doğru kurulmuş olmasına güvenmemek içindir —
     * CustomerPolicy'deki aynı savunma derinliği kararı.
     */
    private function managesMembers(User $actor): bool
    {
        if (! $this->context->has()) {
            return false;
        }

        $company = $this->context->getOrFail();

        if (! $actor->isMemberOf($company)) {
            return false;
        }

        return $this->memberships->roleOf($company, $actor)?->managesMembers() ?? false;
    }
}
