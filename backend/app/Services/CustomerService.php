<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Exceptions\CrossTenantAccessException;
use App\Models\Company;
use App\Models\Customer;
use Illuminate\Support\Facades\DB;

class CustomerService
{
    public function __construct(
        private readonly CompanyContext $context,
        private readonly AuditLogService $audit,
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

            $this->audit->record(
                action: AuditAction::CustomerCreated,
                company: $company,
                auditable: $customer,
                newValues: [
                    'customer_no' => $customer->customer_no,
                    'name' => $customer->name,
                    'phone' => $customer->phone,
                ],
            );

            return $customer;
        });
    }

    /**
     * Müşteriyi günceller.
     *
     * FAZ 3 KARARININ BİLİNÇLİ OLARAK TERSİNE ÇEVRİLMESİ:
     * Faz 3'te bu metodu yazmamıştım; gerekçem "tek satırlık bir işlem
     * için ikinci bir soyutlama katmanı" idi (projenin kendi YAGNI
     * ilkesi). Faz 5 o gerekçeyi geçersiz kıldı: artık gerçek bir iş
     * kuralı var — değişiklik ile audit kaydı AYNI transaction'da
     * olmalı (§9). Kayıt güncellenip iz kaybolursa, "bu müşterinin
     * telefonunu kim değiştirdi" sorusu cevapsız kalır.
     *
     * Tenant koruması değişmedi: müşteri zaten aktif şirket scope'undan
     * geçerek gelir, BelongsToCompany da başka şirkete taşınmasını
     * engeller.
     */
    public function update(Company $company, Customer $customer, string $name, ?string $phone): Customer
    {
        $this->guardAgainstCrossTenantWrite($company);

        return DB::transaction(function () use ($company, $customer, $name, $phone): Customer {
            $oldValues = [
                'name' => $customer->name,
                'phone' => $customer->phone,
            ];

            $customer->fill([
                'name' => $name,
                'phone' => $phone,
            ])->save();

            $this->audit->record(
                action: AuditAction::CustomerUpdated,
                company: $company,
                auditable: $customer,
                oldValues: $oldValues,
                newValues: ['name' => $customer->name, 'phone' => $customer->phone],
            );

            return $customer;
        });
    }

    /**
     * Müşteriyi siler ve silinen halini audit'e bırakır.
     *
     * old_values burada özellikle değerli: kayıt artık yok, geriye
     * yalnızca audit'teki kopya kalıyor. "Ne silindi" sorusunun tek
     * cevabı bu satır olacak.
     */
    public function delete(Company $company, Customer $customer): void
    {
        $this->guardAgainstCrossTenantWrite($company);

        DB::transaction(function () use ($company, $customer): void {
            $oldValues = [
                'customer_no' => $customer->customer_no,
                'name' => $customer->name,
                'phone' => $customer->phone,
            ];

            $customer->delete();

            $this->audit->record(
                action: AuditAction::CustomerDeleted,
                company: $company,
                auditable: $customer,
                oldValues: $oldValues,
            );
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
