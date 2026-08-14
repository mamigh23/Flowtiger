<?php

namespace App\Http\Requests\Api\V1;

use App\Services\InvitationService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Yeni parola belirleme gövdesi.
 *
 * PAROLA POLİTİKASI TEK KAYNAKTAN (§11):
 * Password::defaults() AppServiceProvider'da bir kez tanımlanır ve hem
 * burada hem PasswordUpdateRequest'te kullanılır. Politika değiştiğinde
 * (örneğin uncompromised() eklendiğinde) iki uç birlikte değişir; birinin
 * sessizce eskimesi mümkün değildir.
 *
 * `different:current_password` KURALI BURADA YOKTUR ve olamaz: sıfırlama
 * akışında mevcut parola hiç gönderilmez — zaten unutulduğu için buraya
 * gelinmiştir. Karşılaştırma yapmak için parolayı hash'ten geri çevirmek
 * gerekirdi ki mümkün değildir.
 *
 * Token GÖVDEDE taşınır, URL'de değil — Faz 6'daki davet token'ıyla aynı
 * gerekçe: URL'ler erişim loglarına, proxy'lere ve tarayıcı geçmişine
 * düşer.
 */
class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

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

            // Token'ın GEÇERLİLİĞİ burada denetlenmez; o Laravel
            // broker'ının işidir (hash karşılaştırması + süre kontrolü).
            // Burada yalnızca biçim doğrulanır.
            'token' => ['required', 'string'],

            'password' => [
                'required',
                'string',
                'max:255',
                Password::defaults(),
                'confirmed',
            ],
        ];
    }
}
