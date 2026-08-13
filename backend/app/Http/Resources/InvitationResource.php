<?php

namespace App\Http\Resources;

use App\Models\Invitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Davetin API'ye açılan yüzü — whitelist.
 *
 * TOKEN BURADA YOK VE OLMAYACAK.
 * Ne plaintext (zaten hiçbir yerde saklanmıyor) ne de token_hash.
 * Hash'i göstermek de anlamsız bir sızıntı olurdu: doğrulama için
 * kullanılan değerin kendisidir.
 *
 * E-POSTA MASKELENİR (§27).
 * Owner adresi kendi yazdı, ama davet listesi zamanla şirket üyesi
 * OLMAYAN insanların adreslerinin toplandığı bir yere dönüşür: kabul
 * etmemiş, süresi dolmuş, iptal edilmiş davetler. Bu listenin bir ekran
 * görüntüsü ya da bir API sızıntısı, sisteme hiç girmemiş kişilerin
 * adreslerini de dışarı taşır. Maskeleme, "kimi davet etmiştim"
 * sorusunu yanıtlarken bu birikimi engeller.
 *
 * @mixin Invitation
 */
class InvitationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'email' => $this->maskEmail((string) $this->email),
            'role' => $this->role->value,

            // Saklanmayan, hesaplanan alan (bkz. InvitationStatus).
            'status' => $this->status()->value,

            'expires_at' => $this->expires_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * a***@example.com
     *
     * Alan adı korunur: owner'ın "bu davet şirket dışına mı gitti"
     * sorusunu yanıtlayabilmesi için gerekli. Yerel kısımdan yalnızca
     * ilk karakter kalır.
     */
    private function maskEmail(string $email): string
    {
        $atPosition = mb_strpos($email, '@');

        if ($atPosition === false || $atPosition === 0) {
            // Geçerli bir e-posta değil (validation buna izin vermez).
            // Yine de hiçbir şey sızdırmadan dön.
            return '***';
        }

        $local = mb_substr($email, 0, $atPosition);
        $domain = mb_substr($email, $atPosition);

        return mb_substr($local, 0, 1).'***'.$domain;
    }
}
