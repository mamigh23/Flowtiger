<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\SessionResource;
use App\Services\SessionService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Faz 9 — kullanıcının kendi oturumları.
 *
 * ProfileController ile aynı ilkeye dayanır: hiçbir metot kullanıcı
 * kimliği parametresi almaz. Route'ta {user} yok, gövdede user_id
 * okunmuyor. Üzerinde işlem yapılan kişi DAİMA $request->user()'dır
 * (§15).
 *
 * Bu ucun Policy'si YOKTUR ve olmamalıdır (§15): burada bir yetki sorusu
 * yok. Kullanıcı kendi oturumlarına bakıyor; sahiplik sorgunun kendisine
 * gömülü ($user->tokens()), dolayısıyla yetkilendirilecek bir "başkası"
 * kavramı hiç oluşmuyor.
 *
 * company.context da YOK: oturum yönetimi hiçbir şirkete üye olmayı
 * gerektirmez.
 */
class SessionController extends Controller
{
    public function __construct(
        private readonly SessionService $sessions,
    ) {}

    /**
     * Aktif oturumlar — en yeniden eskiye.
     *
     * Sayfalama yok: oturum sayısı cihaz sayısı kadardır (bkz.
     * SessionService). Yanıt yine de `data` zarfını korur.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        return SessionResource::collection(
            $this->sessions->sessionsFor($request->user())
        );
    }

    /**
     * Tek bir oturumu kapatır.
     *
     * {session} route model binding ile DEĞİL, ham id olarak alınır ve
     * kullanıcının kendi ilişkisi üzerinden çözülür. Binding kullansaydık
     * token tenant'tan/kullanıcıdan bağımsız çözülür, sahiplik ancak
     * SONRADAN kontrol edilirdi — o kontrol bir gün unutulabilirdi.
     * Başkasının id'si burada 404 üretir (§16).
     *
     * Kullanıcı kendi mevcut oturumunu da kapatabilir; yanıt yine 204'tür
     * ve kullanıcıyı oturumda varsayan bir gövde döndürülmez.
     */
    public function destroy(Request $request, string $session): Response
    {
        $user = $request->user();

        $target = $this->sessions->findOwnedOrFail($user, $session);

        $currentSession = $user->currentAccessToken();

        $isCurrent = $currentSession instanceof PersonalAccessToken
            && (int) $currentSession->getKey() === (int) $target->getKey();

        $this->sessions->revoke($user, $target, $isCurrent);

        return response()->noContent();
    }

    /**
     * Mevcut oturum hariç hepsini kapatır.
     *
     * Route sırası ve whereNumber kısıtı sayesinde 'others' asla bir
     * token id'si olarak yorumlanmaz (bkz. routes/api.php).
     */
    public function destroyOthers(Request $request): Response
    {
        $currentSession = $request->user()->currentAccessToken();

        $this->sessions->revokeOthers(
            $request->user(),
            $currentSession instanceof PersonalAccessToken ? $currentSession : null,
        );

        return response()->noContent();
    }
}
