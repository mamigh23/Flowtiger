<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Müşterinin fatura kimliğinin API'ye açılan yüzü — whitelist.
 *
 * CustomerResource'tan AYRI bir sınıftır. Ayrı tutmanın somut faydası,
 * CustomerApiTest'in çivilediği liste/detay sözleşmesinin bozulmaması:
 *
 *   CustomerResource        → id, customer_no, name, phone, tarihler
 *   CustomerBillingResource → mali kimlik + hangi müşteri olduğu
 *
 * Fatura alanları liste/detay yanıtına EKLENMEDİ. İhtiyaç doğarsa
 * eklemek sonradan yapılabilir ve toplama yönünde bir değişikliktir;
 * bugün eklemek ise iki istemciyi ve çivili bir testi gereksiz yere
 * kırardı.
 *
 * `phone` BURADA YOK: o mali kimlik değil, iletişim bilgisidir ve kendi
 * ucunda yaşar.
 *
 * @mixin Customer
 */
class CustomerBillingResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,

            // Kullanıcıya gösterilen numara customer_no'dur, id değil.
            'customer_no' => $this->customer_no,
            'name' => $this->name,

            'billing_email' => $this->billing_email,
            'tax_number' => $this->tax_number,
            'tax_office' => $this->tax_office,
            'billing_address' => $this->billing_address,
            'country' => $this->country,
        ];
    }
}
