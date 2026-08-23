<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\FinanceEntryRequest;
use App\Http\Resources\FinanceEntryResource;
use App\Models\FinanceEntry;
use App\Services\CompanyContext;
use App\Services\FinanceEntryService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Faz 7 / Adım 3 — gelir ve gider kayıtları.
 *
 * Bu controller'da tek bir `where('company_id', ...)` yoktur: tenant
 * filtresi CompanyScope tarafından sorgu kurulurken uygulanır. Elle
 * yazılmış bir filtre, bir gün unutulacak bir filtredir (§3, §8).
 *
 * {financeEntry} route model binding'i de aynı sebeple güvenlidir:
 * binding sorgusu global scope'un altından geçer, başka tenant'ın kaydı
 * bulunamaz ve 404 döner.
 *
 * DELETE UCU YOKTUR VE OLMAYACAK. Finans kaydı fiziksel olarak silinmez;
 * `POST {id}/void` ile iptal edilir. Silinmiş bir gelir kaydı geçmiş bir
 * dönemin toplamını sessizce değiştirirdi.
 */
class FinanceEntryController extends Controller
{
    use AuthorizesRequests;

    private const DEFAULT_PER_PAGE = 15;

    /**
     * Üst sınır olmazsa `?per_page=1000000` tek istekte tüm tenant'ı
     * belleğe çeker — bu bir DoS vektörüdür.
     */
    private const MAX_PER_PAGE = 100;

    public function __construct(
        private readonly CompanyContext $context,
        private readonly FinanceEntryService $entries,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', FinanceEntry::class);

        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $entries = FinanceEntry::query()
            // Müşteri özeti için; N+1 olmadan.
            ->with('customer')
            ->orderByDesc('financial_date')
            // İkincil sıra ZORUNLU: aynı güne yazılmış kayıtlar
            // financial_date'te eşitlenir ve sıralama belirsizleşir.
            // Belirsiz sıralama, sayfalar arasında kayıt tekrarına ya da
            // kayıp kayda yol açar (audit listesindeki aynı gerekçe).
            ->orderByDesc('id')
            ->paginate((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE))
            ->withQueryString();

        return FinanceEntryResource::collection($entries);
    }

    public function store(FinanceEntryRequest $request): FinanceEntryResource
    {
        $this->authorize('create', FinanceEntry::class);

        $entry = $this->entries->create(
            $this->context->getOrFail(),
            $request->validated(),
        );

        return FinanceEntryResource::make($entry->load('customer'));
    }

    public function show(FinanceEntry $financeEntry): FinanceEntryResource
    {
        $this->authorize('view', $financeEntry);

        return FinanceEntryResource::make($financeEntry->load('customer'));
    }

    /**
     * PUT: tam değiştirme, parasal üçlü yeniden hesaplanır.
     *
     * Kısmi güncelleme olsaydı, yalnızca tutarı değiştiren bir istek eski
     * KDV ve brüt değerlerini yerinde bırakır ve kayıt kendi içinde
     * tutarsız hâle gelirdi.
     */
    public function update(FinanceEntryRequest $request, FinanceEntry $financeEntry): FinanceEntryResource
    {
        $this->authorize('update', $financeEntry);

        $entry = $this->entries->update(
            $this->context->getOrFail(),
            $financeEntry,
            $request->validated(),
        );

        return FinanceEntryResource::make($entry->load('customer'));
    }

    /**
     * Kaydı iptal eder.
     *
     * 204 DEĞİL 200 döner ve kaydı geri verir: silme değil durum
     * değişikliğidir, ve istemcinin `voided_at` ile `void_reason`
     * değerlerini görmesi gerekir.
     */
    public function void(Request $request, FinanceEntry $financeEntry): FinanceEntryResource
    {
        $this->authorize('void', $financeEntry);

        $validated = $request->validate([
            'reason' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $entry = $this->entries->void(
            $this->context->getOrFail(),
            $financeEntry,
            $validated['reason'] ?? null,
        );

        return FinanceEntryResource::make($entry->load('customer'));
    }
}
