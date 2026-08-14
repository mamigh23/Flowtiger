<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Kullanıcının KENDİ hesabı üzerindeki işlemleri.
 *
 * Bu servisin hiçbir metodu "hangi kullanıcı" sorusunu sormaz — kullanıcıyı
 * çağıran verir ve çağıran onu daima $request->user()'dan alır. İstek
 * gövdesinden gelen bir user_id buraya ULAŞAMAZ (§12).
 *
 * MembershipService ile karıştırılmamalı: orası bir owner'ın BAŞKALARININ
 * üyeliğini yönettiği yerdir ve parolaya asla dokunmaz. Bu ikisinin ayrı
 * kalması Faz 4/6 güvenlik modelinin taşıyıcı duvarıdır (§11): şirket
 * yönetimi yetkisi, hesap sahipliği yetkisi DEĞİLDİR.
 */
class ProfileService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /**
     * Ad ve e-posta günceller.
     *
     * E-POSTA DEĞİŞİRSE DOĞRULAMA SIFIRLANIR (§8). Eski adresin
     * doğrulanmış olması yeni adres hakkında hiçbir şey söylemez; aksi
     * halde kullanıcı, sahibi olmadığı bir adresi "doğrulanmış" olarak
     * gösterebilirdi.
     *
     * Aynı adres yeniden gönderilirse doğrulama BOZULMAZ: kullanıcı
     * yalnızca adını değiştirdiği için doğrulanmış durumunu kaybetmemeli.
     *
     * Değişiklik ve audit tek transaction'dadır (§17): e-posta değişip
     * iz kaybolursa, "bu hesabın adresi ne zaman ve neye değişti" sorusu
     * cevapsız kalır — hesap ele geçirme incelemesinin ilk sorusu budur.
     */
    public function updateProfile(User $user, string $name, string $email): User
    {
        $normalisedEmail = InvitationService::normaliseEmail($email);

        return DB::transaction(function () use ($user, $name, $normalisedEmail): User {
            $previousName = $user->name;
            $previousEmail = $user->email;

            $emailChanged = $normalisedEmail !== InvitationService::normaliseEmail($previousEmail);

            $user->fill([
                'name' => $name,
                'email' => $normalisedEmail,
            ]);

            if ($emailChanged) {
                // markEmailAsUnverified() yerine doğrudan atama: o metot
                // kendi save()'ini yapar ve aynı isteği iki yazmaya böler.
                // Alan fillable DEĞİLDİR; sistem tarafından atanır.
                $user->email_verified_at = null;
            }

            $user->save();

            $this->audit->recordAuthEvent(
                action: AuditAction::ProfileUpdated,
                actor: $user,
                oldValues: ['name' => $previousName, 'email' => $previousEmail],
                newValues: ['name' => $user->name, 'email' => $user->email],
            );

            if ($emailChanged) {
                // Ayrı bir olay olarak da kaydedilir: e-posta değişimi bir
                // profil güncellemesinden fazlasıdır — hesabın kurtarma
                // adresi değişmiştir ve güvenlik incelemesinde tek başına
                // aranabilir olmalıdır.
                $this->audit->recordAuthEvent(
                    action: AuditAction::EmailChanged,
                    actor: $user,
                    metadata: ['verification_reset' => true],
                    oldValues: ['email' => $previousEmail],
                    newValues: ['email' => $user->email],
                );
            }

            return $user;
        });
    }

    /**
     * Parolayı değiştirir ve DİĞER oturumları kapatır.
     *
     * TOKEN POLİTİKASI (§14):
     * Çalınmış bir token, parola değiştirildikten sonra yaşamaya devam
     * ederse parola değiştirmenin güvenlik değeri büyük ölçüde kaybolur —
     * saldırgan hâlâ içeridedir. Bu yüzden diğer tüm token'lar iptal
     * edilir.
     *
     * Mevcut token KORUNUR: parolasını değiştiren kullanıcıyı sistemden
     * atmak, doğru davranışı cezalandırmak olurdu.
     *
     * Eski parola doğrulaması burada YAPILMAZ; PasswordUpdateRequest'teki
     * Laravel'in `current_password` kuralı bunu isteğin doğrulama
     * aşamasında yapar ve yanlış parolayı controller'a hiç ulaştırmaz.
     */
    public function changePassword(
        User $user,
        #[\SensitiveParameter] string $newPassword,
        ?PersonalAccessToken $currentToken = null,
    ): int {
        return DB::transaction(function () use ($user, $newPassword, $currentToken): int {
            // 'hashed' cast'i devrede: düz metin parola veritabanına
            // hiçbir koşulda yazılmaz.
            $user->password = $newPassword;
            $user->save();

            $revoked = $user->tokens()
                ->when(
                    $currentToken !== null,
                    fn ($query) => $query->whereKeyNot($currentToken->getKey()),
                )
                ->delete();

            // Parola audit'e GİRMEZ — ne eskisi, ne yenisi, ne hash'i.
            // Kaydedilen tek şey olayın kendisi ve kaç oturumun
            // kapatıldığıdır; ikincisi "hesabım ele geçirilmiş miydi"
            // sorusunu araştıran kullanıcı için anlamlı bir sinyaldir.
            //
            // ANAHTAR ADI DİKKATLE SEÇİLDİ: AuditLogService'in sır filtresi
            // ALT DİZE eşleşmesi yapar ve kara listesinde hem 'token' hem
            // 'session' vardır. 'revoked_other_tokens' ya da
            // 'revoked_other_sessions' gibi bir ad, sır sanılıp sessizce
            // düşürülür ve bu sayı audit'e hiç yazılmazdı.
            $this->audit->recordAuthEvent(
                action: AuditAction::PasswordChanged,
                actor: $user,
                metadata: ['other_logins_revoked' => $revoked],
            );

            return $revoked;
        });
    }

    /**
     * Doğrulama bağlantısını gönderir.
     *
     * Zaten doğrulanmış hesap için mail GÖNDERİLMEZ ve iz bırakılmaz:
     * tekrar tekrar çağrılabilen bir uç, gereksiz mail üretmemelidir.
     *
     * @return bool bildirim gönderildi mi
     */
    public function sendVerificationLink(User $user): bool
    {
        if ($user->hasVerifiedEmail()) {
            return false;
        }

        // Laravel'in yerleşik VerifyEmail bildirimi: imzalı ve süreli bir
        // bağlantı üretir. Token diye bir şey saklanmaz — bağlantının
        // geçerliliği imzadan gelir, veritabanında hiçbir iz bırakmaz.
        $user->sendEmailVerificationNotification();

        $this->audit->recordAuthEvent(
            action: AuditAction::EmailVerificationRequested,
            actor: $user,
        );

        return true;
    }

    /**
     * E-postayı doğrulanmış olarak işaretler.
     *
     * Zaten doğrulanmışsa hiçbir şey yapmaz ve ikinci bir audit kaydı
     * bırakmaz: aynı bağlantıya iki kez tıklamak bir olay değildir.
     *
     * @return bool bu çağrıda doğrulandı mı
     */
    public function markVerified(User $user): bool
    {
        if ($user->hasVerifiedEmail()) {
            return false;
        }

        return DB::transaction(function () use ($user): bool {
            $user->markEmailAsVerified();

            $this->audit->recordAuthEvent(
                action: AuditAction::EmailVerified,
                actor: $user,
            );

            return true;
        });
    }
}
