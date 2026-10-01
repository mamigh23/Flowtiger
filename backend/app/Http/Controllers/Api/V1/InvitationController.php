<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Role;
use App\Exceptions\InvitationException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\InvitationAcceptRequest;
use App\Http\Requests\Api\V1\InvitationStoreRequest;
use App\Http\Resources\IncomingInvitationResource;
use App\Http\Resources\InvitationResource;
use App\Models\Invitation;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\InvitationService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Faz 6 — davet akışı.
 *
 * Uçlar İKİ FARKLI DÜNYADA yaşar:
 *
 *   index / store / destroy → tenant dünyası
 *       auth:sanctum + company.context, owner yetkisi
 *
 *   accept                  → tenant DIŞI
 *       ne authentication ne company context zorunlu; davetli çoğu zaman
 *       hiçbir şirketin üyesi değildir, hatta hesabı bile yoktur. Bu ucun
 *       anahtarı token'dır.
 *
 * İş mantığı burada değil InvitationService'tedir; controller yetki
 * kontrolü yapar ve devreder.
 */
class InvitationController extends Controller
{
    use AuthorizesRequests;

    private const DEFAULT_PER_PAGE = 20;

    private const MAX_PER_PAGE = 100;

    public function __construct(
        private readonly CompanyContext $context,
        private readonly InvitationService $invitations,
    ) {}

    /**
     * Aktif şirketin davetleri — sayfalanmış, en yeniden eskiye.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Invitation::class);

        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $invitations = $this->invitations
            ->invitationsFor($this->context->getOrFail())
            ->orderByDesc('created_at')
            // Aynı saniyede oluşturulmuş kayıtlarda sıralamayı
            // belirsizlikten kurtarır (Faz 5'teki audit listesiyle aynı).
            ->orderByDesc('id')
            ->paginate((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE))
            ->withQueryString();

        return InvitationResource::collection($invitations);
    }

    /**
     * Yeni davet.
     *
     * Yanıt, davet edilen adres sistemde kayıtlı olsun ya da olmasın
     * AYNIDIR (§11). Plaintext token yanıtta DÖNMEZ — yalnızca gönderilen
     * mail'de yaşar (§4).
     */
    public function store(InvitationStoreRequest $request): JsonResponse
    {
        $this->authorize('create', Invitation::class);

        $invitation = $this->invitations->create(
            $this->context->getOrFail(),
            $request->validated('email'),
            Role::from($request->validated('role')),
            $request->user(),
        );

        return InvitationResource::make($invitation)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * Daveti iptal eder.
     */
    public function destroy(Request $request, Invitation $invitation): Response
    {
        $this->authorize('delete', $invitation);

        $this->invitations->revoke(
            $this->context->getOrFail(),
            $invitation,
            $request->user(),
        );

        return response()->noContent();
    }

    /**
     * Daveti kabul eder.
     *
     * Kimlik 'sanctum' guard'ından AÇIKÇA okunur: bu route'ta
     * auth:sanctum middleware'i yoktur (olsaydı hesabı olmayan davetli
     * hiç giremezdi), dolayısıyla varsayılan guard Bearer token'ı
     * çözmez. Giriş yapmış biri varsa kimliği doğrulanır; yoksa yeni
     * hesap açılır.
     *
     * 201 — yeni hesap oluşturuldu
     * 200 — mevcut hesap şirkete katıldı
     */
    public function accept(InvitationAcceptRequest $request): JsonResponse
    {
        $authenticated = $request->user('sanctum');

        $invitation = $this->invitations->accept(
            $request->validated('token'),
            $authenticated,
            $request->validated('name'),
            $request->validated('password'),
        );

        return InvitationResource::make($invitation)
            ->response()
            ->setStatusCode($authenticated === null
                ? Response::HTTP_CREATED
                : Response::HTTP_OK);
    }

    /**
     * OTURUMDAKİ KULLANICIYA GELEN davetler (uygulama içi ekran).
     *
     * TENANT DIŞI: aktif şirket GEREKMEZ ve istenmez. Aktif şirketi
     * olmayan — hatta hiçbir şirkete üye olmayan — bir kullanıcı da kendi
     * davetlerini görebilmelidir; davet ekranının varlık sebebi tam olarak
     * budur.
     *
     * KİMLİK YALNIZCA OTURUMDAN. İstek gövdesinden ya da sorgu
     * parametresinden `email`, `user_id` veya `company_id` OKUNMAZ; öyle
     * bir parametre kabul etmek, "başkasının davetlerini listeleme" için
     * bir kapı açardı. Tek dış parametre sayfalamadır.
     *
     * DOĞRULAMA KAPISI VERİDEN ÖNCE: aşağıdaki kontrol, davet sorgusu
     * ÇALIŞTIRILMADAN önce yapılır. Sıra önemlidir — sorgu önce çalışsa
     * ve hata sonra dönseydi, 403 yanıtının zamanlaması ya da bir hata
     * ayıklama kaydı, doğrulanmamış bir kullanıcıya hakkı olmayan
     * bilgiyi sızdırabilirdi.
     */
    public function incoming(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();

        $this->ensureEmailVerified($user);

        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $invitations = $this->invitations
            ->incomingFor($user)
            // Şirket adı yanıtta gömülü gelir; ilişki burada yüklenmezse
            // her satır için ayrı bir sorgu çalışırdı (N+1).
            ->with('company')
            ->orderByDesc('created_at')
            // Aynı saniyedeki kayıtlarda sıralamayı belirsizlikten
            // kurtarır; belirsiz sıralama sayfalar arasında tekrar ya da
            // kayıp kayda yol açar (owner listesiyle aynı desen).
            ->orderByDesc('id')
            ->paginate((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE))
            ->withQueryString();

        return IncomingInvitationResource::collection($invitations);
    }

    /**
     * Daveti OTURUMDAKİ KULLANICI adına kabul eder — uygulama içi yol.
     *
     * TOKEN ALINMAZ. Kaynak, kullanıcının kendi e-postasına ait davetlerle
     * sınırlı bir sorgudan gelir (bkz. InvitationService::findIncomingOrFail);
     * başkasının daveti ile hiç var olmayan davet AYNI 404'ü verir ve
     * yanıt, davetin durumunu ya da şirketini açıklamaz.
     *
     * `{invitation}` ROUTE MODEL BINDING'E BIRAKILMAZ — ham id alınır.
     * Binding, var olmayan bir id'de Laravel'in kendi
     * `ModelNotFoundException` gövdesini üretirdi; o gövde bu ucun
     * `invitation_not_found` gövdesinden farklı olduğu için iki durum
     * yanıt şeklinden AYIRT EDİLEBİLİR hâle gelirdi. Sınırın tek
     * sahibi servistir.
     *
     * AKTİF ŞİRKET DEĞİŞTİRİLMEZ: bu uç yalnızca üyeliği ekler. Hangi
     * şirkette çalışılacağı kullanıcının kararıdır ve mevcut
     * `POST /companies/{id}/select` akışıyla verilir.
     *
     * Durum kodu her zaman 200'dür: kullanıcı zaten oturumdadır ve bu
     * yolda YENİ hesap açılmaz (201 yalnızca token yolundaki misafir
     * dalına aittir).
     */
    public function acceptForUser(Request $request, int $invitation): JsonResponse
    {
        $user = $request->user();

        $this->ensureEmailVerified($user);

        $accepted = $this->invitations->acceptIncoming($user, $invitation);

        return IncomingInvitationResource::make($accepted)
            ->response()
            ->setStatusCode(Response::HTTP_OK);
    }

    /**
     * E-posta doğrulama kapısı — YALNIZCA uygulama içi uçlarda.
     *
     * Davet e-postasındaki bağlantıyla gelen akışta bu kapı YOKTUR ve
     * olmamalıdır: davetle yeni hesap açan kişinin `email_verified_at`
     * değeri henüz null'dır, orada uygulansaydı davet sistemi hiç
     * çalışmazdı (bkz. InvitationService::accept).
     *
     * @throws InvitationException
     */
    private function ensureEmailVerified(?User $user): void
    {
        // `auth:sanctum` zaten zorunlu; yine de savunma derinliği: kimlik
        // çözülemezse hiçbir davet verisi okunmaz.
        if ($user === null || ! $user->hasVerifiedEmail()) {
            throw InvitationException::emailVerificationRequired();
        }
    }
}
