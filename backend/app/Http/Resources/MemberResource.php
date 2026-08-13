<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Bir şirket üyesinin API'ye açılan yüzü — whitelist.
 *
 * UserResource'tan AYRI bir sınıftır ve öyle kalmalıdır. İkisi farklı
 * soruları yanıtlar:
 *
 *   UserResource   → "ben kimim?"        (kendi hesabım, aktif şirketim)
 *   MemberResource → "bu kişi şirkette   (başkasının kaydı, roldeki yeri)
 *                     ne yapıyor?"
 *
 * Bu yüzden active_company_id ve email_verified_at burada YOKTUR (§17):
 * bir üyenin hangi şirkette çalıştığı ya da e-postasını doğrulayıp
 * doğrulamadığı, diğer üyelerin bilmesi gereken bilgiler değildir.
 *
 * password ve remember_token hiçbir koşulda buraya eklenmemelidir.
 *
 * @mixin User
 */
class MemberResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,

            // Rol kullanıcının değil ÜYELİĞİN özelliğidir; bu yüzden
            // pivot'tan okunur. Pivot yüklenmemişse alan hiç görünmez —
            // yanlış bir varsayılan göstermektense hiç göstermemek daha
            // dürüsttür.
            'role' => $this->whenPivotLoaded('company_users', fn () => $this->pivot->role),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
