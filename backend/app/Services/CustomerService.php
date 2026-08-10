<?php

namespace App\Services;

use App\Exceptions\CrossTenantAccessException;
use App\Models\Company;
use App\Models\Customer;
use Illuminate\Support\Facades\DB;

class CustomerService
{
    public function __construct(
        private readonly CompanyContext $context,
    ) {}

    /**
     * Şirket içinde güvenli şekilde artan bir customer_no ile müşteri oluşturur.
     *
     * Concurrency yaklaşımı Faz 0'dan beri aynıdır ve korunmuştur:
     * transaction + company satır kilidi + company_id/customer_no UNIQUE
     * (FlowTiger Anayasası §7).
     */
    public function create(
        Company $company,
        string $name,
        ?string $phone = null
    ): Customer {
        $this->guardAgainstCrossTenantWrite($company);

        return DB::transaction(function () use ($company, $name, $phone) {

            $company = Company::whereKey($company->id)
                ->lockForUpdate()
                ->firstOrFail();

            // Numara hesabı şirkete göre yapılır ve bilinçli olarak aktif
            // context'ten bağımsızdır: yukarıdaki guard zaten ikisinin
            // uyuştuğunu (ya da context olmadığını) doğruladı.
            $lastCustomerNo = Customer::withoutTenantScope('customer_no üretimi: sorgu zaten company_id ile sınırlı')
                ->where('company_id', $company->id)
                ->max('customer_no');

            $nextCustomerNo = ($lastCustomerNo ?? 0) + 1;

            // company_id ve customer_no artık mass-assignable değil (§9);
            // sistem tarafından üretilen değerler olarak açıkça atanır.
            $customer = new Customer([
                'name' => $name,
                'phone' => $phone,
            ]);

            $customer->company_id = $company->id;
            $customer->customer_no = $nextCustomerNo;
            $customer->save();

            return $customer;
        });
    }

    /**
     * Aktif bir company context varken, başka bir şirkete yazılamaz.
     *
     * Context yoksa (seeder, konsol komutu) çağıran taraf şirketi açıkça
     * belirtmiş demektir; bu yol sistem seviyesidir ve engellenmez.
     */
    private function guardAgainstCrossTenantWrite(Company $company): void
    {
        if (! $this->context->has()) {
            return;
        }

        if ($this->context->id() !== $company->getKey()) {
            throw CrossTenantAccessException::forWrite(
                Customer::class,
                $this->context->id(),
                (int) $company->getKey(),
            );
        }
    }
}
