<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Login gövdesinin doğrulanması.
 *
 * Yalnızca ŞEKİL doğrulanır, kimlik değil: "bu e-posta kayıtlı mı?" gibi bir
 * kural (örn. exists:users) buraya ASLA eklenmemelidir — 422 yanıtı üzerinden
 * geçerli e-posta adresleri sayılabilir hale gelirdi. Kimlik doğrulama
 * sonucu, e-posta ve parola ayrımı yapmadan 401 döner.
 */
class LoginRequest extends FormRequest
{
    /**
     * Bu uç kimlik doğrulamadan ÖNCE gelir; yetkilendirilecek bir kullanıcı
     * henüz yoktur.
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
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string'],
        ];
    }
}
