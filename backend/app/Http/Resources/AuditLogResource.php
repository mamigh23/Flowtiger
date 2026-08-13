<?php

namespace App\Http\Resources;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

/**
 * Audit kaydının API'ye açılan yüzü — whitelist.
 *
 * Aktör TAM kullanıcı kaydı olarak değil, ÖZET olarak döner: id ve ad.
 * Audit listesi, kullanıcı verisini dolaylı yoldan dışarı sızdıran bir uç
 * hâline gelmemeli — e-posta, aktif şirket, doğrulama durumu gibi alanlar
 * burada işi yoktur. Kullanıcı ayrıntısı gerekiyorsa /members ucu var ve
 * kendi yetki kontrolüne sahip.
 *
 * old_values / new_values doğrudan taşınır çünkü AuditLogService onları
 * yazmadan ÖNCE hassas anahtarlardan temizler (§3, §13). Filtreleme
 * burada tekrarlanmaz: iki yerde yapılan bir güvenlik kontrolü, bir gün
 * yalnızca bir yerde güncellenir.
 *
 * @mixin AuditLog
 */
class AuditLogResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action->value,

            'actor' => $this->when($this->user_id !== null, fn (): ?array => $this->actorSummary()),

            'auditable' => $this->when(
                $this->auditable_type !== null,
                fn (): array => [
                    // Sınıf yolu DEĞİL kısa ad: 'customer', 'user'.
                    // İç sınıf yapısı API'ye sızmaz. Kısaltma yalnızca
                    // burada yapılır; veritabanı Laravel'in standart
                    // polimorfik biçimini korur (bkz. AppServiceProvider'daki
                    // morphMap notu).
                    'type' => Str::snake(class_basename((string) $this->auditable_type)),
                    'id' => (int) $this->auditable_id,
                ],
            ),

            'old_values' => $this->old_values,
            'new_values' => $this->new_values,
            'metadata' => $this->metadata,

            // IP, "bu işlem beklenmedik bir yerden mi yapıldı" sorusunun
            // cevabıdır ve audit'in asıl işlerinden biridir. User agent
            // ise gürültülü ve düşük değerli; saklanıyor ama yanıta
            // konmuyor — gerekirse ileride ayrı bir ayrıntı ucundan.
            'ip_address' => $this->ip_address,

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function actorSummary(): ?array
    {
        if ($this->user === null) {
            return null;
        }

        return [
            'id' => $this->user->id,
            'name' => $this->user->name,
        ];
    }
}
