<?php

namespace App\Services;

use App\Exceptions\CrossTenantAccessException;
use App\Exceptions\TenantContextMissingException;
use App\Models\Company;
use App\Models\User;

/**
 * Kullanıcının o anda üzerinde çalıştığı şirket.
 *
 * Tenant isolation'ın tamamı bu değere dayanır; bu yüzden context'e
 * DOĞRULANMAMIŞ bir şirket giremez. Tek giriş noktası setForUser()'dır
 * ve üyelik kontrolü yapmadan atama yapmaz (FlowTiger Anayasası §5, §21).
 *
 * Container'a `scoped` olarak bağlanır: her istek/job kendi örneğini alır,
 * uzun ömürlü süreçlerde context sızmaz.
 */
class CompanyContext
{
    private ?Company $company = null;

    /**
     * Kullanıcıyı bir şirkete sokar.
     *
     * Üyelik doğrulanamazsa atama YAPILMAZ ve exception fırlatılır.
     * Doğrulama başarısız olduğunda mevcut context'e de dokunulmaz.
     *
     * @throws CrossTenantAccessException
     */
    public function setForUser(User $user, Company $company): void
    {
        if (! $user->isMemberOf($company)) {
            throw CrossTenantAccessException::forCompanyEntry($user, $company);
        }

        $this->company = $company;
    }

    public function has(): bool
    {
        return $this->company !== null;
    }

    public function get(): ?Company
    {
        return $this->company;
    }

    public function id(): ?int
    {
        return $this->company?->id;
    }

    /**
     * @throws TenantContextMissingException
     */
    public function getOrFail(): Company
    {
        return $this->company ?? throw TenantContextMissingException::forContextRead();
    }

    /**
     * @throws TenantContextMissingException
     */
    public function idOrFail(): int
    {
        return $this->getOrFail()->id;
    }

    public function clear(): void
    {
        $this->company = null;
    }
}
