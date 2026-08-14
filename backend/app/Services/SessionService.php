<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Kullanıcının kendi oturumları.
 *
 * "Oturum" burada bir Sanctum personal access token'ıdır. Yeni bir
 * oturum sistemi KURULMADI (§3): Faz 2.1'den beri kimlikleri taşıyan
 * yapı zaten budur ve ikinci bir kavram eklemek, iki ayrı gerçek
 * kaynağı yaratırdı.
 *
 * SAHİPLİK SORGUYA GÖMÜLÜDÜR, KONTROLE DEĞİL.
 * Hiçbir metot "bu token bu kullanıcıya ait mi?" diye SONRADAN kontrol
 * etmez; sorgu daima $user->tokens() ilişkisinden başlar. Böylece
 * başkasının token'ına ulaşmak, unutulabilecek bir if'e değil,
 * sorgunun yapısına takılır (Faz 4'teki MembershipService deseni).
 */
class SessionService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /**
     * Kullanıcının aktif oturumları — en yeniden eskiye.
     *
     * Sayfalama YOK ve bilinçli: bir kullanıcının oturum sayısı doğası
     * gereği küçüktür (cihaz sayısı kadar). Sayfalanmış bir "cihazlarım"
     * listesi, çözdüğünden fazla karmaşıklık getirirdi.
     *
     * @return Collection<int, PersonalAccessToken>
     */
    public function sessionsFor(User $user): Collection
    {
        return $user->tokens()
            ->orderByDesc('created_at')
            // Aynı saniyede üretilmiş token'larda sıralamayı
            // belirsizlikten kurtarır.
            ->orderByDesc('id')
            ->get();
    }

    /**
     * Kullanıcıya AİT token'ı getirir; ait değilse 404.
     *
     * Sorgu $user->tokens() üzerinden gittiği için başka bir kullanıcının
     * token id'si buraya girdiğinde sonuç boştur — "yetkin yok" değil,
     * "böyle bir şey yok". 403 dönmek o id'de bir token'ın VAR OLDUĞUNU
     * doğrular ve id taramasıyla sistemdeki oturumlar sayılabilirdi
     * (§16). Faz 3/4/6 ile aynı karar.
     *
     * @throws \Illuminate\Database\Eloquent\ModelNotFoundException<PersonalAccessToken>
     */
    public function findOwnedOrFail(User $user, int|string $tokenId): PersonalAccessToken
    {
        return $user->tokens()->whereKey($tokenId)->firstOrFail();
    }

    /**
     * Tek bir oturumu kapatır.
     *
     * Kullanıcının KENDİ mevcut oturumunu kapatmasına izin verilir:
     * POST /auth/logout zaten aynı işi yapıyor ve listedeki "bu cihazı
     * kapat" eylemini yasaklamak tutarsız olurdu. Yanıt 204'tür —
     * kullanıcıyı hâlâ oturumda varsayan bir gövde döndürülmez.
     */
    public function revoke(User $user, PersonalAccessToken $session, bool $isCurrent): void
    {
        DB::transaction(function () use ($user, $session, $isCurrent): void {
            // Token adı kullanıcının kendi verdiği cihaz etiketidir
            // (sır değil). Token'ın KENDİSİ ya da hash'i audit'e ASLA
            // girmez (§12, §24).
            $deviceName = (string) $session->name;

            $session->delete();

            $this->audit->recordAuthEvent(
                action: AuditAction::SessionRevoked,
                actor: $user,
                metadata: [
                    'device_name' => $deviceName,
                    // Anahtar adlarında 'token'/'session' kelimelerinden
                    // kaçınılıyor: AuditLogService'in sır filtresi alt
                    // dize eşleşmesi yapar ve böyle bir anahtarı sessizce
                    // düşürürdü (Faz 7.1'de yaşandı).
                    'was_current_device' => $isCurrent,
                ],
            );
        });
    }

    /**
     * Mevcut oturum HARİÇ tüm oturumları kapatır.
     *
     * "Şüpheli bir şey oldu, her yerden çıkış yap ama beni atma"
     * eyleminin karşılığıdır. Parola değiştirmedeki davranışla aynıdır
     * (Faz 7) ve sıfırlamadakinden (hepsi iptal, Faz 8) bilinçli olarak
     * farklıdır.
     *
     * @return int kapatılan oturum sayısı
     */
    public function revokeOthers(User $user, ?PersonalAccessToken $currentSession): int
    {
        return DB::transaction(function () use ($user, $currentSession): int {
            $revoked = $user->tokens()
                ->when(
                    $currentSession !== null,
                    fn ($query) => $query->whereKeyNot($currentSession->getKey()),
                )
                ->delete();

            $this->audit->recordAuthEvent(
                action: AuditAction::SessionsRevokedOthers,
                actor: $user,
                metadata: ['other_logins_revoked' => $revoked],
            );

            return $revoked;
        });
    }
}
