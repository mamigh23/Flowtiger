<?php

namespace App\Http\Requests\Api\V1;

use App\Services\InvitationService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Parola sıfırlama bağlantısı isteme gövdesi.
 *
 * BURAYA `exists:users` KURALI ASLA EKLENMEMELİ (§6, §19).
 *
 * Böyle bir kural, kayıtlı olmayan bir adres için 422 döndürürdü ve
 * uç, herkese açık bir "bu e-posta FlowTiger'da var mı?" sorgusuna
 * dönüşürdü. Aynı sebeple adresin varlığına dair başka hiçbir kural da
 * eklenemez.
 *
 * Doğrulanan tek şey BİÇİMDİR: gönderilen değer bir e-posta adresine
 * benziyor mu? Adresin kime ait olduğu bu katmanın bilgisi değildir.
 */
class ForgotPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normalizasyon Faz 6'daki tek noktadan gelir (§5, §26).
     *
     * "User@Example.com" ile "user@example.com" aynı hesaptır; broker
     * kullanıcıyı e-postayla bulduğu için normalize edilmemiş bir adres
     * sessizce "kullanıcı yok" sonucuna götürürdü.
     */
    protected function prepareForValidation(): void
    {
        $email = $this->input('email');

        if (is_string($email)) {
            $this->merge(['email' => InvitationService::normaliseEmail($email)]);
        }
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
        ];
    }
}
