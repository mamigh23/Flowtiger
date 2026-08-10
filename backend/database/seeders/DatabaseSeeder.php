<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * FlowTiger Anayasası §13'teki geliştirme/test verisini yeniden üretir.
     *
     * Idempotent: tekrar tekrar çalıştırılabilir, duplicate kayıt üretmez.
     * Tüm adımlar tek transaction içindedir — yarım kalmış bir seed
     * tutarsız üyelik/müşteri verisi bırakmaz.
     */
    public function run(): void
    {
        DB::transaction(function (): void {
            $owner = $this->seedOwner();
            $company = $this->seedCompany();

            // Pivot üzerinden owner üyeliği. syncWithoutDetaching, tekrar
            // çalıştırıldığında mevcut diğer üyeleri düşürmez.
            $company->users()->syncWithoutDetaching([
                $owner->getKey() => ['role' => 'owner'],
            ]);

            $this->seedCustomers($company);
        });
    }

    private function seedOwner(): User
    {
        // Idempotency anahtarı e-postadır (users tablosundaki tek UNIQUE alan).
        // 'password' alanı modelde 'hashed' cast'ine sahip; düz metin verilir.
        return User::firstOrCreate(
            ['email' => 'owner@flowtiger.test'],
            [
                'name' => 'Test Owner',
                'password' => 'password',
            ],
        );
    }

    private function seedCompany(): Company
    {
        return Company::firstOrCreate(
            ['name' => 'FlowTiger Test Company'],
        );
    }

    private function seedCustomers(Company $company): void
    {
        // customer_no şirket içinde anlamlıdır (company_id + customer_no UNIQUE).
        // Numaralar burada bilinçli olarak sabittir: seed edilmiş ortamın her
        // makinede birebir aynı olması gerekir.
        $customers = [
            ['customer_no' => 1, 'name' => 'Ahmet', 'phone' => '05050000000'],
            ['customer_no' => 2, 'name' => 'Mehmet', 'phone' => '05050000001'],
        ];

        foreach ($customers as $attributes) {
            // Seeder sistem seviyesi bir işlemdir: aktif company context yoktur,
            // bu yüzden tenant scope'u açıkça devre dışı bırakılır.
            $customer = Customer::withoutTenantScope('seeder: gelistirme verisi kuruluyor')
                ->where('company_id', $company->getKey())
                ->where('customer_no', $attributes['customer_no'])
                ->first();

            if ($customer === null) {
                $customer = new Customer();

                // company_id ve customer_no mass-assignable değildir (§9);
                // sistem tarafından açıkça atanır.
                $customer->company_id = $company->getKey();
                $customer->customer_no = $attributes['customer_no'];
            }

            $customer->fill([
                'name' => $attributes['name'],
                'phone' => $attributes['phone'],
            ])->save();
        }
    }
}
