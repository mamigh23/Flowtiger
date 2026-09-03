<?php

namespace App\Policies;

use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\MembershipService;

/**
 * Tenant isolation'ın yetki katmanı (FlowTiger Anayasası §9, §21).
 *
 * İki bağımsız koşul birlikte sağlanmadıkça erişim yoktur:
 *   1. Müşteri, aktif company context'e ait olmalı.
 *   2. Kullanıcı, o şirketin üyesi olmalı.
 *
 * İkinci koşul fazlalık gibi görünebilir — context zaten setForUser() ile
 * doğrulanıyor. Bilinçli bir savunma derinliği: policy'nin doğruluğu,
 * context'in doğru kurulmuş olmasına bağlı kalmamalı.
 *
 * SİLME AYRICA ROL İSTER (P0-04 — Member Permission Hardening): view/create/
 * update için tenant üyeliği yeterliyken, delete() üçüncü ve bağımsız bir
 * koşul daha ekler — TaskPolicy/FinanceEntryPolicy'deki `roleAllows` deseni.
 * Tenant kontrolü ile rol kontrolü burada da KARIŞTIRILMAZ; ikisi ayrı
 * private metotlardır.
 */
class CustomerPolicy
{
    public function __construct(
        private readonly CompanyContext $context,
        private readonly MembershipService $memberships,
    ) {}

    public function viewAny(User $user): bool
    {
        return $this->hasActiveMembership($user);
    }

    public function view(User $user, Customer $customer): bool
    {
        return $this->belongsToActiveCompany($user, $customer);
    }

    public function create(User $user): bool
    {
        return $this->hasActiveMembership($user);
    }

    public function update(User $user, Customer $customer): bool
    {
        return $this->belongsToActiveCompany($user, $customer);
    }

    public function delete(User $user, Customer $customer): bool
    {
        return $this->belongsToActiveCompany($user, $customer)
            && $this->roleAllows($user, 'deletesCustomers');
    }

    /**
     * Aktif bir şirket var mı ve kullanıcı o şirketin üyesi mi?
     */
    private function hasActiveMembership(User $user): bool
    {
        if (! $this->context->has()) {
            return false;
        }

        return $user->isMemberOf($this->context->id());
    }

    /**
     * Müşteri aktif şirkete mi ait ve kullanıcı o şirketin üyesi mi?
     */
    private function belongsToActiveCompany(User $user, Customer $customer): bool
    {
        if (! $this->context->has()) {
            return false;
        }

        if ((int) $customer->company_id !== $this->context->id()) {
            return false;
        }

        return $user->isMemberOf($this->context->id());
    }

    /**
     * Kullanıcının AKTİF ŞİRKETTEKİ rolü bu yeteneği taşıyor mu?
     *
     * TaskPolicy/FinanceEntryPolicy ile aynı desen: rol sorusu Role'ün
     * yetenek metoduna sorulur, `$role === Role::Owner` diye buraya
     * yazılmaz (§3).
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
