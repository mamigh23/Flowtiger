<?php

namespace Database\Factories;

use App\Models\FinanceEntry;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PaymentAllocation>
 */
class PaymentAllocationFactory extends Factory
{
    protected $model = PaymentAllocation::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => null,
            'payment_id' => null,
            'finance_entry_id' => null,
            'amount_minor' => 50000,
        ];
    }

    /**
     * Dağıtımı bir ödemeye ve hedefe bağlar.
     *
     * Tenant anahtarı ÖDEMEDEN türetilir: dağıtım, ödemesinin ait olduğu
     * şirketten başka bir şirkete yazılamaz.
     */
    public function forPayment(Payment $payment, FinanceEntry $target): static
    {
        return $this->state(fn (): array => [
            'company_id' => $payment->company_id,
            'payment_id' => $payment->getKey(),
            'finance_entry_id' => $target->getKey(),
        ]);
    }
}
