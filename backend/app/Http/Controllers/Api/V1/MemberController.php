<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\MemberStoreRequest;
use App\Http\Requests\Api\V1\MemberUpdateRequest;
use App\Http\Requests\Api\V1\RoleUpdateRequest;
use App\Http\Resources\MemberResource;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\MembershipService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Faz 4 — şirket üyeliği yönetimi.
 *
 * Bu controller'ın iş mantığı YOKTUR (§13). Üyelik kuralları —
 * son owner koruması, rol değişimi, üyelik kaldırma — MembershipService'te
 * ve transaction/kilit altındadır. Buradaki her metot üç adımdan ibarettir:
 *
 *   1. YETKİ    → authorize(), rolü olmayan 403 alır
 *   2. SINIR    → findMemberOrFail(), başka tenant'ın kullanıcısı 404 alır
 *   3. İŞ       → servise devret
 *
 * ADIMLARIN SIRASI ÖNEMLİDİR. Yetki önce gelir: aksi halde üye yönetme
 * yetkisi olmayan biri, 404/403 farkından bir kullanıcının kendi
 * şirketinde olup olmadığını öğrenebilirdi. Yetkisi olmayan için her
 * yanıt 403'tür; 404'ü yalnızca gerçekten üye yönetebilen biri görür.
 *
 * {user} route model binding'i tenant'tan bağımsız çözer ve öyle kalmalıdır:
 * User global tenant scope'a SOKULMAZ (§15, §22). Tenant sınırı 2. adımda,
 * açıkça çizilir.
 */
class MemberController extends Controller
{
    use AuthorizesRequests;

    private const DEFAULT_PER_PAGE = 15;

    private const MAX_PER_PAGE = 100;

    public function __construct(
        private readonly CompanyContext $context,
        private readonly MembershipService $memberships,
    ) {}

    /**
     * Aktif şirketin üyeleri — sayfalanmış.
     *
     * Sorgu pivot ilişkisi üzerinden gider, bu yüzden başka şirketin
     * üyesinin listeye girmesi mümkün değildir: filtre sonradan eklenen
     * bir where değil, ilişkinin kendisidir.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', User::class);

        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $members = $this->memberships
            ->membersOf($this->context->getOrFail())
            ->orderBy('users.name')
            ->paginate((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE))
            ->withQueryString();

        return MemberResource::collection($members);
    }

    /**
     * Şirkete yeni üye ekler.
     *
     * Şirket istek gövdesinden DEĞİL aktif context'ten gelir (§22).
     * Rol de mass assignment ile değil, doğrulanmış enum olarak geçer.
     */
    public function store(MemberStoreRequest $request): JsonResponse
    {
        $this->authorize('create', User::class);

        $member = $this->memberships->create(
            $this->context->getOrFail(),
            $request->validated('name'),
            $request->validated('email'),
            $request->validated('password'),
            Role::from($request->validated('role')),
        );

        return MemberResource::make($member)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(User $user): MemberResource
    {
        $this->authorize('view', $user);

        return MemberResource::make(
            $this->memberships->findMemberOrFail($this->context->getOrFail(), $user)
        );
    }

    /**
     * Üyenin adını ve e-postasını günceller.
     *
     * Rol buradan DEĞİŞTİRİLEMEZ: User modelinde role diye bir sütun yok,
     * rol pivot'ta yaşıyor ve MemberUpdateRequest onu kural listesine hiç
     * almıyor. Rol değişimi ayrı uçtan, ayrı yetkiyle yapılır (§10).
     */
    public function update(MemberUpdateRequest $request, User $user): MemberResource
    {
        $this->authorize('update', $user);

        $member = $this->memberships->findMemberOrFail($this->context->getOrFail(), $user);

        $member->fill([
            'name' => $request->validated('name'),
            'email' => $request->validated('email'),
        ])->save();

        return MemberResource::make($member);
    }

    /**
     * Üyenin rolünü değiştirir.
     *
     * PATCH: kaydın tamamı değil tek bir özniteliği değişiyor. Son owner'ın
     * member'a düşürülmesi serviste, kilit altında engellenir ve 422 döner.
     */
    public function updateRole(RoleUpdateRequest $request, User $user): MemberResource
    {
        $this->authorize('changeRole', $user);

        $member = $this->memberships->changeRole(
            $this->context->getOrFail(),
            $user,
            Role::from($request->validated('role')),
        );

        return MemberResource::make($member);
    }

    /**
     * Üyeliği kaldırır — kullanıcı kaydını SİLMEZ (§12).
     *
     * Owner'ın kendini çıkarması policy'de, son owner'ın çıkarılması
     * serviste engellenir. İkisi ayrı katmandadır çünkü ilki bir yetki
     * kuralı, ikincisi veritabanı durumuna bağlı bir sistem kuralıdır.
     */
    public function destroy(User $user): Response
    {
        $this->authorize('delete', $user);

        $this->memberships->remove($this->context->getOrFail(), $user);

        return response()->noContent();
    }
}
