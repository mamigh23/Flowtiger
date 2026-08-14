<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\SecurityEventResource;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Faz 9 — kullanıcının kendi güvenlik olayları.
 *
 * ŞİRKET AUDIT UCUNDAN TAMAMEN AYRIDIR:
 *
 *   GET /audit-logs            → owner, ŞİRKETİN kayıtlarını okur.
 *                                auth + company.context + owner rolü.
 *   GET /profile/security-events → kullanıcı, KENDİ hesabının kayıtlarını
 *                                okur. Yalnızca auth; rol ve şirket
 *                                bağımsız.
 *
 * Roller burada hiç sorulmaz (§13): bir member'ın kendi parola
 * değişikliğini görebilmesi için owner olması gerekmez. Kendi hesabının
 * güvenliği, şirketteki konumundan bağımsız bir haktır.
 *
 * Erişim AuditLog::securityEventsFor() üzerinden gider; o metot tenant
 * scope'unu kaldırırken yerine iki ayrılamaz kısıt koyar (user_id eşleşmesi
 * + company_id IS NULL). Şirkete ait bir satırın buradan çıkması
 * matematiksel olarak imkânsızdır — ayrıntılı gerekçe modelde.
 */
class SecurityEventController extends Controller
{
    private const DEFAULT_PER_PAGE = 20;

    private const MAX_PER_PAGE = 100;

    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $events = AuditLog::securityEventsFor($request->user())
            ->orderByDesc('created_at')
            // Aynı saniyedeki kayıtlarda sıralamayı belirsizlikten
            // kurtarır; belirsiz sıralama sayfalar arasında tekrar ya da
            // kayıp kayda yol açar (Faz 5'teki audit listesiyle aynı).
            ->orderByDesc('id')
            ->paginate((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE))
            ->withQueryString();

        return SecurityEventResource::collection($events);
    }
}
