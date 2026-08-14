<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ProfileService;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Faz 7 — e-posta doğrulama.
 *
 * İKİ UÇ, İKİ FARKLI KİMLİK MODELİ:
 *
 *   send()   → auth:sanctum. Kullanıcı KENDİ adresi için bağlantı ister.
 *              Başkasının adresini hedefleyen bir parametre YOKTUR; böyle
 *              bir uç, "bu adres sistemde kayıtlı mı?" sorusunu herkese
 *              açık hâle getirirdi (§21).
 *
 *   verify() → auth YOK, imza VAR. Bağlantı mail istemcisinden tıklanır;
 *              orada Bearer token yoktur. Kanıt imzadan gelir:
 *              temporarySignedRoute (süreli) + sha1(email) eşleşmesi.
 *
 * Doğrulama için veritabanında SAKLANAN BİR TOKEN YOKTUR. Bağlantının
 * geçerliliği tamamen kriptografik imzadan doğar; çalınacak, sızacak ya
 * da hash'lenmesi gereken bir kayıt hiç oluşmaz.
 */
class EmailVerificationController extends Controller
{
    public function __construct(
        private readonly ProfileService $profile,
    ) {}

    /**
     * Doğrulama bağlantısını gönderir.
     *
     * Zaten doğrulanmış hesap için mail gönderilmez; yanıt yine 200'dür
     * ve durumu makine-okunur bir kodla bildirir. Hata dönmek yanlış
     * olurdu: istenen sonuç (adres doğrulanmış olsun) zaten sağlanmış
     * durumda.
     */
    public function send(Request $request): JsonResponse
    {
        $sent = $this->profile->sendVerificationLink($request->user());

        return response()->json([
            'data' => [
                'message' => $sent
                    ? 'Doğrulama bağlantısı e-posta adresinize gönderildi.'
                    : 'E-posta adresiniz zaten doğrulanmış.',
                'code' => $sent ? 'verification_link_sent' : 'already_verified',
            ],
        ]);
    }

    /**
     * İmzalı bağlantıyı doğrular.
     *
     * ÜÇ BAĞIMSIZ KONTROL — üçü de geçilmeden hiçbir şey değişmez:
     *
     *   1. İmza     → 'signed' middleware'i. Süresi dolmuş ya da
     *                  kurcalanmış bağlantı buraya hiç ulaşmaz (403).
     *   2. Kullanıcı → id gerçek bir kullanıcıya işaret etmeli (404).
     *   3. Hash      → sha1(kullanıcının GÜNCEL e-postası) ile eşleşmeli.
     *
     * Üçüncüsü kritik: kullanıcı adresini değiştirdiğinde hash değişir ve
     * ESKİ ADRESE gönderilmiş tüm bağlantılar ölür. Aksi halde, artık
     * kullanılmayan bir adrese gitmiş eski bir mail, yeni adresi
     * doğrulayabilirdi.
     *
     * Karşılaştırma hash_equals ile yapılır (zamanlama saldırısına kapalı).
     *
     * Yanıtta KULLANICI VERİSİ DÖNMEZ: bu uç kimlik doğrulaması olmadan
     * çalışır; bağlantıya sahip olan herkese ad/e-posta göstermek
     * gereksiz bir sızıntı olurdu.
     */
    public function verify(Request $request, string $id, string $hash): JsonResponse
    {
        $user = User::query()->find($id);

        if ($user === null) {
            return response()->json([
                'message' => 'Doğrulama bağlantısı geçersiz.',
                'code' => 'invalid_verification_link',
            ], 404);
        }

        if (! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return response()->json([
                'message' => 'Doğrulama bağlantısı geçersiz.',
                'code' => 'invalid_verification_link',
            ], 403);
        }

        $verified = $this->profile->markVerified($user);

        if ($verified) {
            // Laravel'in yerleşik olayı: dinleyici eklemek isteyen
            // gelecekteki kod için standart giriş noktası.
            event(new Verified($user));
        }

        return response()->json([
            'data' => [
                'message' => $verified
                    ? 'E-posta adresiniz doğrulandı.'
                    : 'E-posta adresiniz zaten doğrulanmıştı.',
                'code' => $verified ? 'email_verified' : 'already_verified',
            ],
        ]);
    }
}
