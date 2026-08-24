<?php

namespace App\Policies;

use App\Models\Payment;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\MembershipService;

/**
 * Ödemelerin yetki katmanı (Faz 7 / Adım 4).
 *
 * FinanceEntryPolicy ile birebir aynı model: owner-only, üç bağımsız
 * koşul (aktif context + kaydın o şirkete ait olması + rolün finans
 * yetkisi taşıması).
 *
 * MEMBER İÇİN 403, başka TENANT için 404: ikincisi controller'a hiç
 * ulaşmaz, route model binding'de CompanyScope'a takılır.
 *
 * Rol sorusu Role'ün yetenek metotlarına sorulur — `$role === Role::Owner`
 * buraya yazılmaz (§3).
 */
class PaymentPolicy
{
    public function __construct(
        private readonly CompanyContext $context,
        private readonly MembershipService $memberships,
    ) {}

    public function viewAny(User $user): bool
    {
        return $this->roleAllows($user, 'viewsFinance');
    }

    public function view(User $user, Payment $payment): bool
    {
        return $this->belongsToActiveCompany($payment)
            && $this->roleAllows($user, 'viewsFinance');
    }

    public function create(User $user): bool
    {
        return $this->roleAllows($user, 'managesFinance');
    }

    public function update(User $user, Payment $payment): bool
    {
        return $this->belongsToActiveCompany($payment)
            && $this->roleAllows($user, 'managesFinance');
    }

    /**
     * İptal ayrı bir metot: ileride "düzeltebilir ama iptal edemez" gibi
     * bir rol tanımlanabilir.
     */
    public function void(User $user, Payment $payment): bool
    {
        return $this->belongsToActiveCompany($payment)
            && $this->roleAllows($user, 'managesFinance');
    }

    private function belongsToActiveCompany(Payment $payment): bool
    {
        if (! $this->context->has()) {
            return false;
        }

        return (int) $payment->company_id === $this->context->id();
    }

    private function roleAllows(User $user, string $capability): bool
    {
        if (! $this->context->has()) {
            return false;
        }

        $role = $this->memberships->roleOf($this->context->getOrFail(), $user);

        return $role?->{$capability}() ?? false;
    }
}
