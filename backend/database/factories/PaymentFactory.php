<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\Payment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Payment>
 */
class PaymentFactory extends Factory
{
    protected $model = Payment::class;

    /**
     * Varsayılan: 1.200,00 TL banka tahsilatı, dağıtımsız.
     *
     * Dağıtım fixture'da ÜRETİLMEZ: "toplam dağıtım ödemeyi aşamaz"
     * kuralı serviste, transaction içinde uygulanır. Factory'nin o kuralı
     * atlayarak dağıtım yazması, testleri gerçekte olmayan bir durumla
     * kurmak olurdu.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'customer_id' => null,
            'financial_date' => '2026-08-20',
            'amount_minor' => 120000,
            'currency' => 'TRY',
            'method' => 'bank',
            'note' => null,
            'voided_at' => null,
            'void_reason' => null,
        ];
    }

    public function forCompany(Company $company): static
    {
        return $this->state(fn (): array => [
            'company_id' => $company->getKey(),
        ]);
    }

    public function voided(?string $reason = null): static
    {
        return $this->state(fn (): array => [
            'voided_at' => now(),
            'void_reason' => $reason,
        ]);
    }
}
