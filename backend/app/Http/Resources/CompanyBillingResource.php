<?php

namespace App\Http\Resources;

use App\Models\Company;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Şirketin mali kimliğinin API'ye açılan yüzü — whitelist.
 *
 * CompanyResource'tan AYRI bir sınıftır ve öyle kalmalıdır. İkisi farklı
 * soruları yanıtlar ve farklı yerlerde kullanılır:
 *
 *   CompanyResource        → "hangi şirketlerdeyim?" (liste, seçim)
 *   CompanyBillingResource → "bu şirketin mali kimliği nedir?"
 *
 * Ayrı tutmanın somut faydası: mali kimlik alanları liste ucuna
 * sızmıyor. Liste ucunun şekli web ve Flutter istemcileri tarafından
 * kullanılıyor ve testlerle çivili; oraya alan eklemek gereksiz bir
 * kırılma olurdu.
 *
 * `name` burada da yer alıyor çünkü mali kimlik ekranında hangi şirkete
 * bakıldığı görünmeli — ve `name` zaten CompanyResource üzerinden açık,
 * yani yeni bir sızıntı değil.
 *
 * SecurityEventResource'un AuditLogResource'tan ayrılmasıyla aynı karar.
 *
 * @mixin Company
 */
class CompanyBillingResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,

            'legal_name' => $this->legal_name,
            'tax_number' => $this->tax_number,
            'tax_office' => $this->tax_office,
            'billing_address' => $this->billing_address,
            'country' => $this->country,

            // İkisi de NOT NULL: hiçbir koşulda null dönmezler.
            'timezone' => $this->timezone,
            'default_currency' => $this->default_currency,
        ];
    }
}
