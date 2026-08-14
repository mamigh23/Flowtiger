<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Kendi parolasını değiştirme gövdesi.
 *
 * ESKİ PAROLA KONTROLÜ VALIDATION'DA (§9):
 * Laravel'in yerleşik `current_password` kuralı, oturum açmış kullanıcının
 * parolasıyla karşılaştırır. Controller'a yanlış parolayla hiç
 * ulaşılamaz — kontrolü servise taşımak, "acaba çağırmayı unuttum mu?"
 * sorusunu her yeni çağrı yolunda yeniden sordururdu.
 *
 * Yanlış parola 422 döner (Laravel'in doğrulama standardı ve §19'daki
 * convention). 401 dönmek yanıltıcı olurdu: kullanıcının kimliği
 * doğrulanmış durumda, hatalı olan tek şey gönderdiği alan.
 *
 * Hata mesajı hesap durumu sızdırmaz (§10): yalnızca "parola hatalı"
 * denir; hesabın kilitli/doğrulanmamış/başka bir durumda olup olmadığına
 * dair hiçbir ipucu verilmez.
 *
 * `different:current_password` — yeni parola eskisiyle aynı olamaz.
 * Karşılaştırma gönderilen iki alan arasında yapılır; hiçbir yerde
 * parola saklanmaz ya da loglanmaz.
 */
class PasswordUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'current_password'],

            'new_password' => [
                'required',
                'string',
                'max:255',
                // Faz 8'de 'min:8' yerine geçti: parola politikası artık
                // AppServiceProvider'da bir kez tanımlanıyor ve sıfırlama
                // akışıyla PAYLAŞILIYOR (§11). Politika değiştiğinde iki
                // uç birlikte değişir; birinin sessizce eskimesi mümkün
                // değil.
                Password::defaults(),
                'confirmed',
                'different:current_password',
            ],
        ];
    }
}
