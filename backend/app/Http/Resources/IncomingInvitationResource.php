<?php

namespace App\Http\Resources;

use App\Models\Invitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Kullanıcıya GELEN davetin yüzü — InvitationResource'dan AYRI.
 *
 * İki kaynak aynı modeli okur ama iki FARKLI soruya cevap verir:
 *
 *   InvitationResource          → owner "kimi davet ettim?" (şirket
 *                                 perspektifi; e-posta maskeli gelir)
 *   IncomingInvitationResource  → kullanıcı "beni nereye davet ettiler?"
 *                                 (kişi perspektifi; şirket adı görünür)
 *
 * Ayrı tutulmaları bilinçlidir: tek bir kaynağa iki perspektifi sığdırmak,
 * bir alanın hangi uçta görünmesi gerektiğini koşullara bağlardı — ve bir
 * gün şirket perspektifine ait bir alan kazara kişi yanıtına sızardı.
 *
 * KİMLİK ALANI (`email`) BURADA YOK. Davet zaten oturumdaki kullanıcının
 * KENDİ adresine ait; adresi geri yansıtmak yeni bir bilgi taşımaz, ama
 * yanıtı bir başkasının eline geçtiğinde (ör. bir ekran görüntüsü ya da
 * paylaşılan bir sekme) gereksiz bir sızıntı olurdu.
 *
 * TOKEN BURADA YOK VE OLMAYACAK (§4, §8): ne plaintext (zaten hiçbir
 * yerde saklanmıyor) ne de `token_hash`. Hash'i göstermek de anlamsız bir
 * sızıntı olurdu: doğrulamada kullanılan değerin kendisidir.
 *
 * @mixin Invitation
 */
class IncomingInvitationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,

            /*
              Şirket ÖZET olarak gömülür (id + name), tam kayıt değil.

              DAVET EDEN KİŞİ (`invited_by`) BİLİNÇLİ OLARAK YOK: davetin
              kime ait olduğunu bilmek kullanıcının kararını değiştirmez,
              ama kişi adı bir kez yanıta girerse şirket üyelerinin
              adlarını davet edilmemiş kişilere gösteren bir yüzeye
              dönüşür.
            */
            'company' => [
                'id' => $this->company?->id,
                'name' => $this->company?->name,
            ],

            'role' => $this->role->value,

            // Saklanmayan, hesaplanan alan (bkz. InvitationStatus).
            'status' => $this->status()->value,

            'expires_at' => $this->expires_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
