<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Üye güncelleme gövdesinin doğrulanması.
 *
 * ROL BURADA YOKTUR VE OLMAYACAKTIR (§10).
 *
 * Rol değişimi ayrı bir uçtan, ayrı bir yetki kontrolünden geçer. Aynı
 * gövdede kabul edilseydi, "üyeyi güncelle" yetkisi sessizce "rol değiştir"
 * yetkisine dönüşürdü. Kural listesinde bulunmadığı için validated()
 * gövdeye konan bir 'role' alanını zaten düşürür; ayrıca User modelinde
 * role diye bir sütun da yoktur — rol pivot'ta yaşar, dolayısıyla mass
 * assignment yüzeyi hiç mevcut değildir.
 *
 * PAROLA DA YOKTUR: owner'ın bir üyenin parolasını değiştirebilmesi,
 * o üyenin hesabına girebilmesi demektir. Kullanıcının kendi parolasını
 * değiştirmesi ayrı bir ucun konusudur.
 */
class MemberUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('update', $this->route('user'));
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],

            // ignore(): kullanıcının kendi e-postasını değiştirmeden ad
            // güncellemesi "bu e-posta zaten alınmış" hatasına takılmamalı.
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($this->route('user')),
            ],
        ];
    }
}
