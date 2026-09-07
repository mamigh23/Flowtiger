<?php

namespace App\Http\Requests\Api\V1;

use App\Services\InvitationService;
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
     * Normalizasyon TEK noktadan gelir (§5, §26) — ForgotPasswordRequest,
     * ResetPasswordRequest ve ProfileUpdateRequest ile AYNI desen.
     *
     * "User@Example.com" ile "user@example.com" AYNI HESAPTIR. Kimlik
     * doğrulama kullanıcıyı e-postayla bulur; normalize edilmemiş bir adres
     * sessizce "kullanıcı yok" sonucuna gider ve 401 döner. Kullanıcı doğru
     * parolayı yazdığı hâlde giremez ve arayüzde sebebini gösteren hiçbir
     * işaret yoktur — telefon klavyesinin ilk harfi küçülttüğü ya da parola
     * yöneticisinin adresi farklı yazdığı her durumda hesap erişilemez olur.
     *
     * Bu ucun normalize ETMEMESİ davet akışını da kırıyordu: davet edilen
     * hesabı InvitationService küçük harfe çevirerek yaratır, ama davetli
     * kendi adresini yazdığı gibi (büyük harfli) girdiğinde hesabına HİÇ
     * giremiyordu.
     *
     * Audit tarafı bu adresleri ZATEN aynı hesap sayıyor (AuditLogService
     * e-postayı küçük harfe çevirip hash'ler, bkz. AuditTrailTest); kimlik
     * doğrulamanın aynı kabulü paylaşmaması ürün içi bir çelişkiydi.
     */
    protected function prepareForValidation(): void
    {
        $email = $this->input('email');

        if (is_string($email)) {
            $this->merge(['email' => InvitationService::normaliseEmail($email)]);
        }
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
