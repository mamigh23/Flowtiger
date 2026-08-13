<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Müşterinin API'ye açılan yüzü — whitelist.
 *
 * company_id BİLİNÇLİ OLARAK DIŞARIDA BIRAKILDI.
 *
 * İstemci zaten hangi şirkette çalıştığını biliyor (aktif şirket seçimi
 * onun kendi eylemi) ve tenant sahipliği istemcinin karar verebileceği bir
 * şey değildir. Alanı yanıta koymak, istemci geliştiricisini "peki bunu
 * geri gönderirsem ne olur?" sorusuna davet ederdi. Cevap "hiçbir şey" —
 * Customer::$fillable onu kabul etmez — ama bu soruyu hiç sordurmamak
 * daha iyidir (Anayasa §9).
 *
 * customer_no burada YER ALIR: şirket içinde kullanıcıya gösterilen
 * numara odur, id değil.
 *
 * @mixin Customer
 */
class CustomerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'customer_no' => (int) $this->customer_no,
            'name' => $this->name,
            'phone' => $this->phone,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
