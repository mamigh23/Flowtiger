<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\PasswordUpdateRequest;
use App\Http\Requests\Api\V1\ProfileUpdateRequest;
use App\Http\Resources\UserResource;
use App\Services\ProfileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Faz 7 — kullanıcının KENDİ hesabı.
 *
 * Bu controller'ın en önemli özelliği yaptığı değil, YAPAMADIĞIDIR:
 * hiçbir metodu bir kullanıcı kimliği parametresi almaz. Ne route'ta
 * {user} vardır, ne gövdede user_id okunur. Üzerinde işlem yapılan
 * kullanıcı DAİMA $request->user()'dır (§12).
 *
 * Bu, Faz 4'ün üye yönetimi ucundan bilinçli olarak ayrıdır:
 *   /members/{user}  → owner BAŞKALARINI yönetir, parolaya dokunamaz
 *   /profile         → kullanıcı KENDİNİ yönetir, rolüne dokunamaz
 *
 * İki yetki birbirinin yerine geçmez. Bir owner'ın üyelerini yönetebiliyor
 * olması, onların hesaplarının sahibi olduğu anlamına gelmez (§11).
 *
 * İş mantığı ProfileService'tedir; burada yalnızca kimlik ve yanıt vardır.
 */
class ProfileController extends Controller
{
    public function __construct(
        private readonly ProfileService $profile,
    ) {}

    /**
     * Kendi profili.
     *
     * /me ile aynı gövdeyi döndürür ve öyle kalmalıdır: iki uç aynı
     * kaynağı temsil eder, farklı şekiller döndürmeleri istemci
     * tarafında iki ayrı model doğururdu. /me kimlik sorgusu, /profile
     * ise profil kaynağının köküdür.
     */
    public function show(Request $request): UserResource
    {
        return UserResource::make($request->user());
    }

    /**
     * Ad ve e-posta günceller.
     *
     * E-posta değiştiğinde doğrulama durumu sıfırlanır; yanıttaki
     * email_verified_at null döner ve istemci kullanıcıyı yeniden
     * doğrulamaya yönlendirebilir.
     */
    public function update(ProfileUpdateRequest $request): UserResource
    {
        $user = $this->profile->updateProfile(
            $request->user(),
            $request->validated('name'),
            $request->validated('email'),
        );

        return UserResource::make($user);
    }

    /**
     * Parolayı değiştirir.
     *
     * Yanıt parolayı ya da yeni bir token'ı İÇERMEZ (§10, §18) — yalnızca
     * kaç oturumun kapatıldığını söyler ki kullanıcı ne olduğunu görsün.
     *
     * Mevcut token korunur, diğerleri iptal edilir. currentAccessToken()
     * bu isteği yapan token'dır; oturum içinden gelmediği (TransientToken)
     * durumda null geçilir ve o zaman tüm token'lar iptal edilir — daha
     * güvenli tarafta kalınır.
     */
    public function updatePassword(PasswordUpdateRequest $request): JsonResponse
    {
        $currentToken = $request->user()->currentAccessToken();

        $revoked = $this->profile->changePassword(
            $request->user(),
            $request->validated('new_password'),
            $currentToken instanceof PersonalAccessToken ? $currentToken : null,
        );

        // Alan adı audit metadata'sıyla aynı tutuldu: aynı sayının iki
        // katmanda iki farklı adla anılması, ileride birini değiştirip
        // diğerini unutmanın davetiyesidir (bkz. ProfileService'teki not).
        return response()->json([
            'data' => [
                'message' => 'Parola güncellendi.',
                'other_logins_revoked' => $revoked,
            ],
        ]);
    }
}
