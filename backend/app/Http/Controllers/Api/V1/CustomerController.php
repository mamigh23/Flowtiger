<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\CustomerStoreRequest;
use App\Http\Requests\Api\V1\CustomerUpdateRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Services\CompanyContext;
use App\Services\CustomerService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Faz 3 — ilk gerçek tenant ucu.
 *
 * Bu controller'da TEK BİR yerde bile `where('company_id', ...)` yazmadığına
 * dikkat: tenant filtresi Faz 1'de kurulan CompanyScope tarafından, sorgu
 * kurulurken otomatik uygulanır. Elle yazılmış bir filtre, bir gün
 * unutulacak bir filtredir (Anayasa §3, §8).
 *
 * Aynı sebeple {customer} route model binding'i de güvenlidir: binding
 * sorgusu global scope'un ALTINDAN geçer, başka tenant'ın müşterisi
 * bulunamaz ve 404 döner. Bunun çalışması için company.context'in
 * SubstituteBindings'ten ÖNCE koşması gerekir — bu sıralama
 * bootstrap/app.php'de middleware priority listesiyle garanti altına
 * alınmıştır.
 *
 * Üç bağımsız savunma katmanı üst üste durur (§21):
 *   1. company.context   — aktif şirket ve üyelik doğrulanmadan geçilmez
 *   2. CompanyScope      — sorgular aktif şirkete filtrelenir
 *   3. CustomerPolicy    — kayıt gerçekten aktif şirkete mi ait?
 *
 * Üçü de aynı anda yanlış olmadıkça veri sızmaz.
 */
class CustomerController extends Controller
{
    use AuthorizesRequests;

    /**
     * Sayfa boyutu verilmezse kullanılan değer.
     */
    private const DEFAULT_PER_PAGE = 15;

    /**
     * İstemcinin talep edebileceği en büyük sayfa boyutu.
     *
     * Üst sınır olmazsa `?per_page=1000000` tek istekte tüm tenant'ı
     * belleğe çeker — bu bir DoS vektörüdür.
     */
    private const MAX_PER_PAGE = 100;

    public function __construct(
        private readonly CompanyContext $context,
        private readonly CustomerService $customers,
    ) {}

    /**
     * Aktif şirketin müşterileri — sayfalanmış.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Customer::class);

        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $customers = Customer::query()
            // id değil customer_no: kullanıcı için anlamlı olan sıra budur
            // ve şirket içinde artar (§7).
            ->orderBy('customer_no')
            // (int) cast: query string değerleri her zaman string gelir,
            // 'integer' kuralı doğrular ama tipi DÖNÜŞTÜRMEZ.
            ->paginate((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE))
            ->withQueryString();

        return CustomerResource::collection($customers);
    }

    /**
     * Yeni müşteri.
     *
     * customer_no üretimi CustomerService'e bırakılır: transaction + şirket
     * satır kilidi + UNIQUE kısıtı üçlüsü Faz 0'dan beri oradadır ve
     * controller'a kopyalanmamalıdır (§7).
     *
     * Şirket, istek gövdesinden DEĞİL aktif context'ten gelir. getOrFail()
     * kullanılır: context yoksa sessizce devam etmek yerine patlar
     * (fail closed, §21). Pratikte company.context middleware'i buraya
     * context'siz gelinmesini zaten engeller.
     */
    public function store(CustomerStoreRequest $request): JsonResponse
    {
        $this->authorize('create', Customer::class);

        $customer = $this->customers->create(
            $this->context->getOrFail(),
            $request->validated('name'),
            $request->validated('phone'),
        );

        return CustomerResource::make($customer)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * Tek müşteri.
     *
     * Başka tenant'ın müşterisi buraya HİÇ ULAŞAMAZ: binding sorgusu boş
     * döner ve Laravel 404 fırlatır. 403 yerine 404 dönmek bilinçlidir —
     * "bu id'de bir müşteri var ama senin değil" bilgisi bile sızıntıdır.
     */
    public function show(Customer $customer): CustomerResource
    {
        $this->authorize('view', $customer);

        return CustomerResource::make($customer);
    }

    /**
     * Müşteriyi günceller (PUT: tam değiştirme).
     *
     * fill() yalnızca $fillable alanlarını (name, phone) yazar; gövdeye
     * konan company_id ya da customer_no buraya hiç ulaşmaz. Ulaşsaydı bile
     * BelongsToCompany kaydın başka şirkete taşınmasını engellerdi.
     */
    public function update(CustomerUpdateRequest $request, Customer $customer): CustomerResource
    {
        $this->authorize('update', $customer);

        $customer->fill([
            'name' => $request->validated('name'),
            // PUT semantiği: gönderilmeyen alan temizlenir, korunmaz.
            'phone' => $request->validated('phone'),
        ])->save();

        return CustomerResource::make($customer);
    }

    /**
     * Müşteriyi siler.
     *
     * Soft delete BİLİNÇLİ olarak kullanılmadı: customers tablosunda
     * deleted_at sütunu yok ve migration'a dokunmak bu fazın kapsamı
     * dışında. Gerekirse ayrı bir faz olarak ele alınmalı.
     */
    public function destroy(Customer $customer): Response
    {
        $this->authorize('delete', $customer);

        $customer->delete();

        return response()->noContent();
    }
}
