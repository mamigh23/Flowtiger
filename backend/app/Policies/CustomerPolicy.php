<?php

namespace App\Policies;

use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;

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
 */
class CustomerPolicy
{
    public function __construct(
        private readonly CompanyContext $context,
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
        return $this->belongsToActiveCompany($user, $customer);
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
}
