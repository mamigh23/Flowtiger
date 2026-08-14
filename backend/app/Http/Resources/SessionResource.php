<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Bir oturumun (Sanctum token'ının) API'ye açılan yüzü — whitelist.
 *
 * BURADA OLMAYAN VE ASLA OLMAYACAK OLANLAR:
 *   token          → veritabanındaki SHA-256 hash. Göstermek, doğrulama
 *                    için kullanılan değerin kendisini vermektir.
 *   tokenable_type → iç model yapısı; istemcinin işi değil.
 *   tokenable_id   → kullanıcı zaten kendi oturumlarına bakıyor.
 *
 * Sanctum'un kendi modeli token'ı $hidden ile gizliyor; bu resource
 * ikinci ve asıl savunmadır — modele yarın eklenecek bir alan
 * kendiliğinden dışarı sızmaz.
 *
 * @mixin PersonalAccessToken
 */
class SessionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,

            // Cihaz etiketi: token oluşturulurken verilen ad ('api',
            // 'mobil'...). Gerçek cihaz/tarayıcı tespiti YAPILMIYOR —
            // personal_access_tokens tablosunda user-agent alanı yok ve
            // sırf bunun için şema büyütülmedi (§4, §18).
            'name' => $this->name,

            // "Şu anda kullandığın oturum bu mu?"
            //
            // Karşılaştırma isteğin KENDİ token'ıyla yapılır; bu bilgi
            // yalnızca istek bağlamında anlamlıdır, modelde saklanan bir
            // özellik değildir.
            'current' => $this->isCurrentSession($request),

            'abilities' => $this->abilities,

            'last_used_at' => $this->last_used_at?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    private function isCurrentSession(Request $request): bool
    {
        $currentSession = $request->user()?->currentAccessToken();

        if (! $currentSession instanceof PersonalAccessToken) {
            return false;
        }

        return (int) $currentSession->getKey() === (int) $this->id;
    }
}
