<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ForgotPasswordRequest;
use App\Http\Requests\Api\V1\ResetPasswordRequest;
use App\Services\PasswordResetService;
use Illuminate\Http\JsonResponse;

/**
 * Faz 8 — parola sıfırlama.
 *
 * İKİ UÇ DA HERKESE AÇIKTIR ve öyle olmak zorundadır: parolasını unutmuş
 * bir kullanıcı tanım gereği giriş yapamaz. Kimlik, sıfırlama token'ının
 * kendisiyle kanıtlanır.
 *
 * Bu, controller'ın en kritik sorumluluğunu doğurur: YANITIN HER ZAMAN
 * AYNI OLMASI. Kimliği doğrulanmamış bir çağıran, yanıttaki en küçük
 * farktan bile bir hesabın var olup olmadığını çıkarabilir.
 */
class PasswordResetController extends Controller
{
    /**
     * Adresin kayıtlı olup olmadığından BAĞIMSIZ, tek yanıt.
     *
     * Metin bilinçli olarak koşulludur ("varsa"): kullanıcıya yalan
     * söylemeden, hiçbir şey de doğrulamadan durumu anlatır.
     */
    private const NEUTRAL_MESSAGE = 'Bu adrese ait bir hesap varsa, parola sıfırlama bağlantısı gönderildi.';

    public function __construct(
        private readonly PasswordResetService $passwordReset,
    ) {}

    /**
     * Sıfırlama bağlantısı ister.
     *
     * ENUMERATION KORUMASI (§6) üç katmanlıdır:
     *
     *   1. Yanıt      — kayıtlı ve kayıtsız adres için BİRE BİR aynı
     *                   gövde ve aynı 200.
     *   2. Servis     — sendResetLink() hiçbir şey döndürmez; sonucu
     *                   bilmeyen bir controller yanıtı ona göre
     *                   şekillendiremez.
     *   3. Zamanlama  — Laravel'in broker'ı Timebox içinde çalışır;
     *                   kullanıcı bulunamadığında bile yanıt aynı sürede
     *                   döner. Yanıt SÜRESİ de bilgi sızdırmaz.
     *
     * Broker'ın kendi throttle'ına (aynı adrese 60 saniyede bir bağlantı)
     * takılan istek de aynı 200'ü alır — aksi halde "bu adrese az önce
     * bağlantı gitti" bilgisi sızardı.
     */
    public function sendResetLink(ForgotPasswordRequest $request): JsonResponse
    {
        $this->passwordReset->sendResetLink($request->validated('email'));

        return response()->json([
            'data' => [
                'message' => self::NEUTRAL_MESSAGE,
                'code' => 'password_reset_link_requested',
            ],
        ]);
    }

    /**
     * Token ile yeni parola belirler.
     *
     * BAŞARISIZLIK NEDENİ AYRIŞTIRILMAZ. Geçersiz token, süresi dolmuş
     * token, kullanılmış token ve yanlış e-posta/token eşleşmesi —
     * hepsi AYNI 422'yi ve aynı kodu alır.
     *
     * Ayrıştırmak cazip olurdu ("süreniz doldu, yenisini isteyin") ama
     * her ayrım bir bilgi sızıntısıdır: "süresi dolmuş" yanıtı, o
     * e-posta için bir zamanlar token üretildiğini — yani hesabın var
     * olduğunu — doğrular. Kullanıcı deneyimi kaybı, frontend'in "sorun
     * yaşadıysanız yeni bağlantı isteyin" yönlendirmesiyle telafi edilir.
     */
    public function reset(ResetPasswordRequest $request): JsonResponse
    {
        $succeeded = $this->passwordReset->reset(
            $request->validated('email'),
            $request->validated('token'),
            $request->validated('password'),
        );

        if (! $succeeded) {
            return response()->json([
                'message' => 'Parola sıfırlama bağlantısı geçersiz ya da süresi dolmuş.',
                'code' => 'invalid_password_reset_token',
            ], 422);
        }

        return response()->json([
            'data' => [
                'message' => 'Parolanız güncellendi. Tüm oturumlar kapatıldı, yeniden giriş yapın.',
                'code' => 'password_reset_completed',
            ],
        ]);
    }
}
