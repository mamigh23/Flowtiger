<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Customer;
use Illuminate\Support\Facades\DB;

class CustomerService
{
    public function create(
        Company $company,
        string $name,
        ?string $phone = null
    ): Customer {
        return DB::transaction(function () use ($company, $name, $phone) {

            $company = Company::whereKey($company->id)
                ->lockForUpdate()
                ->firstOrFail();

            $lastCustomerNo = Customer::where('company_id', $company->id)
                ->max('customer_no');

            $nextCustomerNo = ($lastCustomerNo ?? 0) + 1;

            return Customer::create([
                'company_id' => $company->id,
                'customer_no' => $nextCustomerNo,
                'name' => $name,
                'phone' => $phone,
            ]);
        });
    }
}