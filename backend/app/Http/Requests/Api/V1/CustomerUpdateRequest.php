<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Müşteri güncelleme gövdesinin doğrulanması.
 *
 * Uç PUT'tur, PATCH değil: gövde kaydın TAM halini tanımlar. Bu yüzden
 * `name` zorunludur ve gönderilmeyen `phone` null olarak yazılır —
 * "alanı boşalt" ile "alana dokunma" arasındaki belirsizlik, kısmi
 * güncelleme semantiği olmadan çözülemez.
 *
 * customer_no ve company_id burada da yoktur ve olmayacaktır:
 * ilki sistemin ürettiği bir kimlik (§7), ikincisi tenant sahipliğidir ve
 * mevcut bir kayıt için ASLA değiştirilemez (BelongsToCompany::forTransfer).
 */
class CustomerUpdateRequest extends FormRequest
{
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
