<?php

namespace App\Enums;

use App\Models\Invitation;

/**
 * Bir davetin durumu — SAKLANMAZ, HESAPLANIR.
 *
 * Neden ayrı bir status sütunu yok (§5): iki kaynaktan türeyen bir gerçek,
 * er ya da geç ikiye ayrılır. accepted_at dolu ama status hâlâ 'pending'
 * olan bir satır, hangisine inanılacağı belirsiz bir kayıttır. Zaman
 * damgaları tek gerçek kaynaktır; durum onlardan okunur.
 *
 * ÖNCELİK SIRASI (yukarıdan aşağıya, ilk eşleşen kazanır):
 *
 *   1. accepted_at dolu  → Accepted
 *   2. revoked_at dolu   → Revoked
 *   3. expires_at geçmiş → Expired
 *   4. aksi halde        → Pending
 *
 * Accepted en üstte çünkü terminal ve geri alınamaz: davet işini yapmıştır.
 * Kabul edilmiş bir davetin süresi sonradan dolsa bile "expired" demek,
 * gerçekleşmiş bir olayı gizlemek olurdu.
 */
enum InvitationStatus: string
{
    case Pending = 'pending';

    case Accepted = 'accepted';

    case Revoked = 'revoked';

    case Expired = 'expired';

    public static function for(Invitation $invitation): self
    {
        if ($invitation->accepted_at !== null) {
            return self::Accepted;
        }

        if ($invitation->revoked_at !== null) {
            return self::Revoked;
        }

        if ($invitation->expires_at !== null && $invitation->expires_at->isPast()) {
            return self::Expired;
        }

        return self::Pending;
    }

    /**
     * Bu davet kullanılabilir mi?
     *
     * Tek doğru cevap Pending'dir. "Kabul edilebilir mi?" sorusunun
     * kod içinde tekrar tekrar üç ayrı koşulla sorulmasını engeller.
     */
    public function isUsable(): bool
    {
        return $this === self::Pending;
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $status): string => $status->value, self::cases());
    }
}
