<?php

namespace App\Http\Resources;

use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Görevin API'ye açılan yüzü — whitelist.
 *
 * `is_completed` SAKLANMAZ, HER OKUMADA TÜRETİLİR. Bir sütun olarak
 * tutulsaydı `completed_at` ile ikisi arasında bir gün mutlaka çelişki
 * doğardı. İstemci de onu yeniden hesaplamaz — yanıtta hazır gelir.
 *
 * KİŞİ VE MÜŞTERİ ÖZET OLARAK DÖNER. Görev listesi, kullanıcı ya da
 * müşteri verisini dolaylı yoldan dışarı veren bir uç hâline gelmemeli;
 * AuditLogResource'un `actor` özetiyle aynı karar. Kullanıcının e-postası,
 * rolü ve aktif şirketi burada YOKTUR.
 *
 * SAAT H:i OLARAK DÖNER. Veritabanı "09:00:00" saklar; saniye bir randevu
 * saatinde anlam taşımaz ve iki farklı biçimin dolaşımda olması
 * karşılaştırmayı bozar.
 *
 * @mixin Task
 */
class TaskResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,

            'title' => $this->title,
            'note' => $this->note,

            // Takvim günü: saat taşımaz.
            'scheduled_date' => $this->scheduled_date?->format('Y-m-d'),

            'scheduled_time' => $this->timeOfDay(),

            'completed_at' => $this->completed_at?->toIso8601String(),
            'is_completed' => $this->isCompleted(),

            'customer' => $this->customerSummary(),
            'created_by' => $this->userSummary($this->creator),
            'assigned_to' => $this->userSummary($this->assignee),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /**
     * "09:00:00" → "09:00"
     *
     * Carbon'a çevrilmiyor: bu alan bir gün içindeki saattir, bir zaman
     * noktası değil. Carbon'a çevirmek saatin yanına bugünün tarihini
     * iliştirir ve gerçekte olmayan bir "an" üretirdi.
     */
    private function timeOfDay(): ?string
    {
        if ($this->scheduled_time === null) {
            return null;
        }

        return substr((string) $this->scheduled_time, 0, 5);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function customerSummary(): ?array
    {
        $customer = $this->customer;

        if ($customer === null) {
            return null;
        }

        return [
            'id' => $customer->id,
            // Kullanıcıya gösterilen numara customer_no'dur, id değil.
            'customer_no' => $customer->customer_no,
            'name' => $customer->name,
        ];
    }

    /**
     * Kişi ÖZETİ — id ve ad. E-posta ve rol BİLİNÇLİ OLARAK YOK.
     *
     * @return array<string, mixed>|null
     */
    private function userSummary(mixed $user): ?array
    {
        if ($user === null) {
            return null;
        }

        return [
            'id' => $user->id,
            'name' => $user->name,
        ];
    }
}
