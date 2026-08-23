<?php

namespace App\Http\Resources;

use App\Finance\RoundingPolicy;
use App\Models\FinanceEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Finans kaydının API'ye açılan yüzü — whitelist.
 *
 * AÇIKLANABİLİRLİK (playbook: "finansal hesaplamalar açıklanabilir"):
 * `calculation` bloğu, sonucun NASIL çıktığını taşır — hangi esastan
 * (net mi brüt mü), nasıl yuvarlanarak ve KDV'nin uygulanıp
 * uygulanmadığı.
 *
 * BU BLOK HESAPLANIR, SAKLANMAZ (§A5). Ayrı bir vergi tablosu YOKTUR:
 * saklanan bir "vergi tutarı" satırı bir gün kaynağıyla çelişirdi.
 * Buradaki değerler kaydın kendi alanlarından türetilir.
 *
 * MÜŞTERİ ÖZET OLARAK DÖNER (id, customer_no, name) — tam kayıt değil.
 * Finans listesi, müşteri verisini dolaylı yoldan dışarı veren bir uç
 * hâline gelmemeli; AuditLogResource'un `actor` özeti ile aynı karar.
 *
 * @mixin FinanceEntry
 */
class FinanceEntryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'direction' => $this->direction->value,

            // Takvim günü: saat taşımaz.
            'financial_date' => $this->financial_date?->format('Y-m-d'),

            'category' => $this->category,
            'note' => $this->note,

            'net_minor' => $this->net_minor,
            'vat_rate_bp' => $this->vat_rate_bp,
            'vat_minor' => $this->vat_minor,
            'gross_minor' => $this->gross_minor,
            'currency' => $this->currency,

            'customer' => $this->customerSummary(),

            'calculation' => [
                'basis' => $this->amount_basis,
                'rounding' => RoundingPolicy::MODE,
                'vat_applicable' => $this->isVatApplicable(),
            ],

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
        if ($this->customer_id === null) {
            return null;
        }

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
}
