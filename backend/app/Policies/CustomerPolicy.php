<?php

namespace App\Policies;

use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;

class CustomerPolicy
{
    public function view(User $user, Customer $customer): bool
    {
        $companyId = app(CompanyContext::class)->id();

        return $companyId !== null
            && $customer->company_id === $companyId;
    }
}