<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\PaymentRequest;
use App\Http\Resources\PaymentResource;
use App\Models\Payment;
use App\Services\CompanyContext;
use App\Services\PaymentService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Faz 7 / Adım 4 — ödemeler ve tahsilat dağıtımı.
 *
 * Bu controller'da tek bir `where('company_id', ...)` yoktur: tenant
 * filtresi CompanyScope tarafından uygulanır. Elle yazılmış bir filtre,
 * bir gün unutulacak bir filtredir (§3, §8).
 *
 * DELETE UCU YOKTUR VE OLMAYACAK — FinanceEntry ile aynı karar. Ödeme
 * `POST {id}/void` ile iptal edilir; dağıtımları yerinde kalır.
 */
class PaymentController extends Controller
{
    use AuthorizesRequests;

    private const DEFAULT_PER_PAGE = 15;

    /**
     * Üst sınır olmazsa `?per_page=1000000` tek istekte tüm tenant'ı
     * belleğe çeker — bu bir DoS vektörüdür.
     */
    private const MAX_PER_PAGE = 100;

    /** Yanıtın ihtiyaç duyduğu ilişkiler; N+1 olmadan. */
    private const RELATIONS = ['customer', 'allocations.financeEntry'];

    public function __construct(
        private readonly CompanyContext $context,
        private readonly PaymentService $payments,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Payment::class);

        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $payments = Payment::query()
            ->with(self::RELATIONS)
            ->orderByDesc('financial_date')
            // İkincil sıra ZORUNLU: aynı güne yazılmış ödemeler
            // financial_date'te eşitlenir ve sıralama belirsizleşir.
            // Belirsiz sıralama sayfalar arasında kayıt tekrarına ya da
            // kayıp kayda yol açar.
            ->orderByDesc('id')
            ->paginate((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE))
            ->withQueryString();

        return PaymentResource::collection($payments);
    }

    public function store(PaymentRequest $request): PaymentResource
    {
        $this->authorize('create', Payment::class);

        $payment = $this->payments->create(
            $this->context->getOrFail(),
            $request->validated(),
        );

        return PaymentResource::make($payment->load(self::RELATIONS));
    }

    public function show(Payment $payment): PaymentResource
    {
        $this->authorize('view', $payment);

        return PaymentResource::make($payment->load(self::RELATIONS));
    }

    /**
     * PUT: tam değiştirme. Dağıtım listesi eskisinin TAMAMEN yerine
     * geçer — kısmi olsaydı "dağıtımı sil" ile "dağıtıma dokunma" ayrımı
     * anlatılamazdı.
     */
    public function update(PaymentRequest $request, Payment $payment): PaymentResource
    {
        $this->authorize('update', $payment);

        $updated = $this->payments->update(
            $this->context->getOrFail(),
            $payment,
            $request->validated(),
        );

        return PaymentResource::make($updated->load(self::RELATIONS));
    }

    /**
     * Ödemeyi iptal eder.
     *
     * 204 DEĞİL 200 döner ve kaydı geri verir: silme değil durum
     * değişikliğidir, ve istemcinin `voided_at` ile dağıtımların yerinde
     * durduğunu görmesi gerekir.
     */
    public function void(Request $request, Payment $payment): PaymentResource
    {
        $this->authorize('void', $payment);

        $validated = $request->validate([
            'reason' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $voided = $this->payments->void(
            $this->context->getOrFail(),
            $payment,
            $validated['reason'] ?? null,
        );

        return PaymentResource::make($voided->load(self::RELATIONS));
    }
}
