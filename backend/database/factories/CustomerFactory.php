<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Customer>
 */
class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    /**
     * customer_no global değil, şirket içinde artan bir numaradır
     * (FlowTiger Anayasası §3). Bu yüzden numara, ilişkili şirkete göre
     * hesaplanır — aksi halde company_id + customer_no UNIQUE kısıtı
     * testlerde rastgele patlar.
     *
     * ⚠ TOPLU ÜRETİMDE create() KULLANMAYIN — createMany() KULLANIN.
     *
     * Numara aşağıda lazy attribute olarak, yani model BELLEKTE
     * üretilirken hesaplanır. Laravel'in Factory::create() metodu ise
     * count(N) verildiğinde önce N modelin TAMAMINI make() eder, ancak
     * ondan SONRA store() ile tek tek kaydeder. Dolayısıyla N closure'ın
     * hepsi aynı max(customer_no) değerini görür, hepsi aynı numarayı
     * üretir ve ikinci INSERT'te UNIQUE kısıtı patlar:
     *
     *   ❌ Customer::factory()->count(5)->forCompany($c)->create()
     *   ✅ Customer::factory()->count(5)->forCompany($c)->createMany()
     *
     * createMany() her kaydı ayrı ayrı create() ettiği için her closure
     * bir öncekinin yazdığı satırı görür.
     *
     * Tek kayıt üretiminde create() güvenlidir.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'customer_no' => fn (array $attributes): int => $this->nextCustomerNo($attributes['company_id']),
            'name' => fake()->name(),
            'phone' => '05'.fake()->numerify('#########'),
        ];
    }

    /**
     * Müşteriyi mevcut bir şirkete bağlar.
     */
    public function forCompany(Company $company): static
    {
        return $this->state(fn (): array => [
            'company_id' => $company->getKey(),
        ]);
    }

    /**
     * Şirket içindeki bir sonraki müşteri numarası.
     *
     * NOT: Bu, CustomerService'teki üretim mantığının test amaçlı bir
     * kopyasıdır; transaction/row lock içermez. Concurrency davranışı
     * factory ile değil, CustomerService üzerinden test edilmelidir.
     */
    private function nextCustomerNo(mixed $companyId): int
    {
        $companyId = $companyId instanceof Company
            ? $companyId->getKey()
            : $companyId;

        return (int) Customer::withoutTenantScope('factory: numara hesabı company_id ile sınırlı')
            ->where('company_id', $companyId)
            ->max('customer_no') + 1;
    }
}
