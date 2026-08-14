<?php

namespace App\Http\Requests\Api\V1;

use App\Services\InvitationService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Kendi profilini güncelleme gövdesi.
 *
 * KURAL LİSTESİNDE OLMAYAN HER ALAN DÜŞER — ve düşmesi gereken alanlar
 * tesadüf değil, bu ucun güvenlik sınırıdır (§7):
 *
 *   user_id           → kimlik gövdeden değil oturumdan gelir (§12)
 *   role              → Faz 4'ün rol değiştirme yetkisi atlatılamaz
 *   active_company_id → Faz 2.2'den beri mass-assignable değil
 *   company_id        → tenant sahipliği istekle belirlenmez
 *   password          → ayrı uç, ayrı doğrulama, ayrı token politikası
 *
 * Bu alanların hiçbiri için `prohibited` kuralı yazılmadı: gövdeye
 * konmaları zaten hiçbir etki yaratmıyor ve 422 dönmek, hangi alan
 * adlarının "tanındığı" bilgisini dışarı verirdi.
 *
 * Yetkilendirme yok çünkü yetkilendirilecek bir şey yok: kullanıcı kendi
 * kaydını düzenliyor. Kimliği auth:sanctum sağlıyor.
 */
class ProfileUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * E-postayı DOĞRULAMADAN ÖNCE normalize eder.
     *
     * Sırası kritik: normalize etmeden `unique` kontrolü yapılsaydı,
     * "USER@X.COM" PostgreSQL'de "user@x.com"dan farklı görünür,
     * validation'ı geçer ve veritabanındaki UNIQUE kısıtına çarparak
     * 500 üretirdi. Normalizasyon Faz 6'daki tek noktadan gelir (§8, §26).
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

            // ignore(): kullanıcı kendi adresini değiştirmeden adını
            // güncelleyebilmeli, "bu e-posta zaten alınmış" hatasına
            // takılmamalı.
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($this->user()),
            ],
        ];
    }
}
