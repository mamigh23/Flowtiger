<?php

namespace App\Http\Requests\Api\V1;

use App\Services\InvitationService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Self-servis kayıt gövdesinin doğrulanması (P0-01).
 *
 * authorize() daima true: LoginRequest ile aynı gerekçe — bu uç kimlik
 * doğrulamadan ÖNCE gelir, yetkilendirilecek bir kullanıcı henüz yoktur.
 *
 * role / company_id / active_company_id BİLİNÇLİ OLARAK kural listesinde
 * YOKTUR. Bu bir eksiklik değil, tasarımın kendisidir: FormRequest::validated()
 * yalnızca burada TANIMLI alanları döner (Anayasa §22'deki whitelist
 * doğrulama deseniyle aynı) — istemci gövdeye bu üç alandan hangisini
 * eklerse eklesin, RegistrationService'e hiçbiri ulaşmaz. `prohibited`
 * kuralı bilinçli olarak KULLANILMADI: bu uç kimlik doğrulaması olmadan
 * herkese açıktır ve ProfileUpdateRequest'teki gerekçeyle aynı — hangi
 * alanların "tanındığını" 422 mesajı üzerinden sızdırmamak.
 *
 * email için `unique:users` kuralı MemberStoreRequest'teki ile aynı: bu uç
 * zaten yalnızca YENİ bir hesap yaratabilir, var olan bir e-postayla kayıt
 * denemesi anlamlı bir sonuç üretmez.
 */
class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normalizasyon DOĞRULAMADAN ÖNCE yapılır (§5, §26) — ProfileUpdateRequest
     * ile aynı gerekçe, orada testiyle birlikte zaten kayıtlı: normalize
     * edilmemiş büyük harfli bir adres `unique:users` kontrolünü GEÇER.
     *
     * Postgres'te karşılaştırma büyük/küçük harfe duyarlıdır; bu yüzden
     * "Ali@site.com" ve "ali@site.com" aynı kişi olmasına rağmen İKİ AYRI
     * hesap (ve iki ayrı şirket) yaratabiliyordu — InvitationService'in
     * normaliseEmail() belgesinin tam olarak uyardığı sonuç.
     *
     * İkinci sonuç girişteydi: adres yazıldığı hâliyle saklandığı için
     * kullanıcı bir dahaki sefere farklı bir yazımla (telefon klavyesi ilk
     * harfi küçültür) girmeye çalıştığında hesabına erişemiyordu.
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
            'name' => ['required', 'string', 'max:255'],

            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],

            // Sabit 'min:8' YOK: PasswordUpdateRequest'teki Faz 8 kararıyla
            // aynı — parola politikası AppServiceProvider'da bir kez
            // tanımlanır ve tüm parola-yazan uçlarla PAYLAŞILIR.
            'password' => ['required', 'string', Password::defaults()],

            'company_name' => ['required', 'string', 'max:255'],
        ];
    }
}
