<?php

namespace App\Http\Resources;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Kullanıcının kendi güvenlik olayı — whitelist.
 *
 * AuditLogResource'tan (Faz 5) AYRI bir sınıftır ve öyle kalmalıdır.
 * İkisi farklı soruları yanıtlar ve farklı kitlelere bakar:
 *
 *   AuditLogResource      → owner, ŞİRKETİNDE ne olduğunu inceler
 *   SecurityEventResource → kullanıcı, KENDİ HESABINDA ne olduğunu görür
 *
 * Bu yüzden burada actor YOKTUR: her satırın aktörü zaten okuyan kişinin
 * kendisidir, tekrar etmek gürültüdür. auditable de yoktur: kimlik
 * olayları bir kayda değil hesabın kendisine aittir.
 *
 * old_values / new_values BİLİNÇLİ OLARAK DIŞARIDA: bu bir güvenlik
 * akışıdır, bir değişiklik günlüğü değil. Kullanıcının burada sorduğu
 * soru "hesabımda ne oldu ve ben miydim?"dir; alan alan farklar
 * incelemek istiyorsa profil geçmişi ayrı bir konudur.
 *
 * metadata olduğu gibi taşınır çünkü AuditLogService onu YAZMADAN ÖNCE
 * temizler: sırlar düşürülür, e-posta özetlenir. Filtrelemeyi burada
 * tekrarlamak, iki yerde yapılan bir güvenlik kontrolünün bir gün
 * yalnızca birinde güncellenmesi demek olurdu (Faz 5'teki aynı karar).
 *
 * @mixin AuditLog
 */
class SecurityEventResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action->value,

            // "Bu işlem beklenmedik bir yerden mi yapıldı?" sorusunun
            // cevabı — güvenlik akışının en işe yarar tek alanı.
            'ip_address' => $this->ip_address,

            'metadata' => $this->metadata,

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
