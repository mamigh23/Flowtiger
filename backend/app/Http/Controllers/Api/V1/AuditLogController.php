<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditLogResource;
use App\Models\AuditLog;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Faz 5 — audit geçmişinin okunması.
 *
 * SALT OKUNUR ve öyle kalacak. store/update/destroy metotları yoktur:
 * audit kaydı yalnızca domain işlemlerinin yan etkisi olarak, servis
 * katmanından doğar. API üzerinden audit yazılabilseydi, iz uydurmak
 * mümkün olurdu.
 *
 * Tenant filtresi burada YAZILMAZ — AuditLog modelindeki CompanyScope
 * her sorguya aktif şirket koşulunu ekler ve context yoksa fail-closed
 * patlar. Elle yazılmış bir where, bir gün unutulacak bir where'dir.
 * company_id'si NULL olan sistem kayıtları (login/logout) bu filtreye
 * takılır ve burada hiç görünmez (§17).
 */
class AuditLogController extends Controller
{
    use AuthorizesRequests;

    /**
     * §15: varsayılan 20, tavan 100.
     */
    private const DEFAULT_PER_PAGE = 20;

    private const MAX_PER_PAGE = 100;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', AuditLog::class);

        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $logs = AuditLog::query()
            // Aktör özeti için; N+1 olmadan.
            ->with('user')
            ->orderByDesc('created_at')
            // İkincil sıra ZORUNLU: aynı saniyede yazılmış kayıtlar
            // created_at'te eşitlenir ve sıralama belirsizleşir. Belirsiz
            // sıralama, sayfalar arasında kayıt tekrarına ya da kayıp
            // kayda yol açar.
            ->orderByDesc('id')
            ->paginate((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE))
            ->withQueryString();

        return AuditLogResource::collection($logs);
    }
}
