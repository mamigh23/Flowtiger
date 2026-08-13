<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Yeni müşteri gövdesinin doğrulanması.
 *
 * KURAL LİSTESİNDE OLMAYAN HER ALAN SESSİZCE DÜŞER.
 * validated() yalnızca burada tanımlı alanları döndürür; bu yüzden
 * gövdeye company_id ya da customer_no koymak hiçbir etki yaratmaz.
 *
 * Bunlar için ayrıca `prohibited` kuralı YAZILMADI: 422 dönmek, saldırgana
 * "bu alan tanınıyor ama korunuyor" bilgisini verirdi. Sessizce yok saymak
 * hem daha az bilgi sızdırır hem de asıl savunmayı doğru katmanda tutar —
 * Customer::$fillable (§9) ve BelongsToCompany'nin yazma sınırı (§3).
 *
 * Yetki kontrolü burada YAPILMAZ; CustomerPolicy'nin işidir (§21).
 */
class CustomerStoreRequest extends FormRequest
{
    /**
     * Yetkilendirme controller'da, Policy üzerinden yapılır.
     * Burada true dönmek "herkes yapabilir" demek değildir.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
        ];
    }
}
