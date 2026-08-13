<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\InvitationAcceptRequest;
use App\Http\Requests\Api\V1\InvitationStoreRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Invitation;
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
}
