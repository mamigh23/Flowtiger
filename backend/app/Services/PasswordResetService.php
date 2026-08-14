<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

/**
 * Parola sıfırlama — Laravel'in yerleşik password broker'ı üzerinden.
 *
 * ÖZEL BİR TOKEN SİSTEMİ YAZILMADI (§3, §4) ve yazılmamalı. Laravel'in
 * broker'ı zaten şunları sağlıyor:
 *
 *   - token: hash_hmac('sha256', Str::random(40), APP_KEY) — kriptografik
 *   - veritabanında yalnızca bcrypt HASH'i saklanır, düz metin asla
 *   - süre sınırı config/auth.php'deki passwords.users.expire'dan
 *   - tek kullanımlık: başarılı sıfırlamadan sonra kayıt silinir
 *   - Timebox: hem sendResetLink hem reset sabit süreli çalışır, yani
 *     "bu e-posta kayıtlı mı?" sorusu YANIT SÜRESİNDEN de okunamaz
 *
 * Bu servisin işi broker'ı sarmalamak değil, ona FlowTiger'ın üç kuralını
 * eklemektir: e-posta normalizasyonu, audit ve oturum iptali.
 */
class PasswordResetService
{
    public function __construct(
        private readonly ProfileService $profile,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * Sıfırlama bağlantısı gönderir.
     *
     * DÖNÜŞ DEĞERİ YOK — ve bu bilinçlidir (§6). Çağıran taraf, adresin
     * kayıtlı olup olmadığını ÖĞRENEMEMELİ ki yanıtı ona göre
     * şekillendirme ihtimali hiç doğmasın. Bilgi burada bilerek
     * tüketilir; controller elinde yalnızca "istek işlendi" bilgisiyle
     * kalır.
     *
     * Audit yalnızca gerçekten bağlantı üretildiğinde yazılır:
     *   - bilinmeyen adres  → hiçbir kayıt (aksi halde kimliği doğrulanmamış
     *     bir uç, audit tablosunu istediği kadar büyütebilirdi)
     *   - broker throttle'ı → hiçbir kayıt (yeni token üretilmedi)
     */
    public function sendResetLink(string $email): void
    {
        $normalisedEmail = InvitationService::normaliseEmail($email);

        $status = Password::sendResetLink(['email' => $normalisedEmail]);

        if ($status !== Password::RESET_LINK_SENT) {
            return;
        }

        $user = User::query()->where('email', $normalisedEmail)->first();

        if ($user === null) {
            return;
        }

        $this->audit->recordAuthEvent(
            action: AuditAction::PasswordResetRequested,
            actor: $user,
            metadata: ['email_hash' => $this->audit->hashEmail($normalisedEmail)],
        );
    }

    /**
     * Token ile yeni parola belirler.
     *
     * TÜM OTURUMLAR KAPATILIR (§12) — profil üzerinden parola
     * değiştirmekten farkı budur:
     *
     *   profil değişimi → kullanıcı zaten içeride, kimliği kanıtlı;
     *                     mevcut oturumu korunur, diğerleri düşer
     *   sıfırlama       → hesabın güvenliği YENİDEN KURULUYOR; eski
     *                     oturumlardan biri saldırganın elinde olabilir,
     *                     hiçbiri yaşamamalı
     *
     * changePassword'e currentToken olarak null geçmek "hiçbirini koru"
     * demektir; parola yazma, oturum iptali ve audit orada tek bir
     * transaction içinde yapılır.
     *
     * Broker çağrısının TAMAMI ayrıca bir transaction'a alınır: aksi
     * halde parola değişip token silme adımı başarısız olsaydı, kullanılmış
     * bir sıfırlama bağlantısı hâlâ geçerli kalırdı (§15).
     *
     * @return bool sıfırlama gerçekleşti mi
     */
    public function reset(
        string $email,
        #[\SensitiveParameter] string $token,
        #[\SensitiveParameter] string $password,
    ): bool {
        $normalisedEmail = InvitationService::normaliseEmail($email);

        $status = DB::transaction(function () use ($normalisedEmail, $token, $password): string {
            return Password::reset(
                [
                    'email' => $normalisedEmail,
                    'token' => $token,
                    'password' => $password,
                ],
                function (User $user, string $plainPassword): void {
                    $this->profile->changePassword(
                        user: $user,
                        newPassword: $plainPassword,
                        // null = "korunacak oturum yok" → hepsi iptal.
                        currentToken: null,
                        action: AuditAction::PasswordResetCompleted,
                    );

                    // remember_token da tazelenir: bu API oturumları
                    // Sanctum ile taşıyor, ama ileride session tabanlı bir
                    // giriş eklenirse eski "beni hatırla" çerezleri
                    // sıfırlamadan sağ çıkmamalı.
                    $user->setRememberToken(Str::random(60));
                    $user->save();

                    // E-POSTA DOĞRULAMASINA DOKUNULMAZ (§16):
                    // sıfırlama token'ını kullanabilmek, adresin
                    // doğrulanmış olduğu anlamına gelmez. Doğrulanmış bir
                    // hesap doğrulanmış kalır, doğrulanmamış olan da öyle.
                },
            );
        });

        return $status === Password::PASSWORD_RESET;
    }
}
