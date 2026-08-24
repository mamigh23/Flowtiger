<?php

namespace App\Http\Resources;

use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Ödemenin API'ye açılan yüzü — whitelist.
 *
 * `allocated_minor` ve `remaining_minor` SAKLANMAZ, HER OKUMADA
 * HESAPLANIR (§A5). Saklanan bir "kalan" sütunu, dağıtım değiştiğinde
 * güncellenmesi unutulan ilk şey olur ve kaynağıyla çelişirdi.
 *
 * Değişmez: amount = allocated + remaining. Üçü de tam sayıdır; hiçbir
 * adımda float'a düşülmez.
 *
 * MÜŞTERİ VE HEDEF ÖZET OLARAK DÖNER — tam kayıt değil. Ödeme listesi,
 * müşteri ya da finans kaydı verisini dolaylı yoldan dışarı veren bir uç
 * hâline gelmemeli (AuditLogResource'un `actor` özetiyle aynı karar).
 *
 * @mixin Payment
 */
class PaymentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $allocated = $this->allocatedMinor();

        return [
            'id' => $this->id,

            // Takvim günü: saat taşımaz.
            'financial_date' => $this->financial_date?->format('Y-m-d'),

            'amount_minor' => $this->amount_minor,
            'currency' => $this->currency,
            'method' => $this->method,
            'note' => $this->note,

            'customer' => $this->customerSummary(),

            'allocations' => $this->allocations
                ->map(fn ($allocation): array => [
                    'id' => $allocation->id,
                    'amount_minor' => $allocation->amount_minor,
                    'finance_entry' => $this->financeEntrySummary($allocation),
                ])
                ->values()
                ->all(),

            'allocated_minor' => $allocated,
            'remaining_minor' => $this->amount_minor - $allocated,

            'voided_at' => $this->voided_at?->toIso8601String(),
            'void_reason' => $this->void_reason,

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function customerSummary(): ?array
    {
        $customer = $this->customer;

        if ($customer === null) {
            return null;
        }

        return [
            'id' => $customer->id,
            // Kullanıcıya gösterilen numara customer_no'dur, id değil.
            'customer_no' => $customer->customer_no,
            'name' => $customer->name,
        ];
    }

    /**
     * Dağıtım hedefinin özeti.
     *
     * Invoice geldiğinde bu metot ikinci hedef türünü de karşılayacak;
     * hedefin nasıl okunduğu tek bir yerde toplandı.
     *
     * @return array<string, mixed>|null
     */
    private function financeEntrySummary(mixed $allocation): ?array
    {
        $entry = $allocation->financeEntry;

        if ($entry === null) {
            return null;
        }

        return [
            'id' => $entry->id,
            'direction' => $entry->direction->value,
            'financial_date' => $entry->financial_date?->format('Y-m-d'),
            'gross_minor' => $entry->gross_minor,
        ];
    }
}
