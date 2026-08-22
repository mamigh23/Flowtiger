<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\CompanyBillingRequest;
use App\Http\Resources\CompanyBillingResource;
use App\Http\Resources\CompanyResource;
use App\Models\Company;
use App\Services\CompanyBillingService;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Faz 2.3 — şirket listeleme ve aktif şirket seçimi.
 *
 * Bu iki uç company.context middleware'inin ARKASINDA DEĞİLDİR ve bu
 * bilinçli bir tasarım kararıdır: kullanıcı henüz bir şirket seçmemişken de
 * hangi şirketlerde olduğunu görebilmeli ve seçim yapabilmelidir. Aksi halde
 * "context kurmak için şirket seç, şirket seçmek için context lazım" kısır
 * döngüsü oluşur ve çok şirketli kullanıcı sisteme hiç giremez.
 *
 * Güvenlik bu yüzden zayıflamaz: listeleme kullanıcının KENDİ üyelikleri
 * üzerinden gider, seçim ise CompanySelectionService'in üyelik kontrolüne
 * tabidir.
 */
class CompanyController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private readonly CompanySelectionService $companySelection,
        private readonly CompanyBillingService $companyBilling,
    ) {}

    /**
     * Kullanıcının üyesi OLDUĞU şirketler.
     *
     * Sorgu bilinçli olarak Company::all() değil, $user->companies()
     * üzerinden gider: filtre pivot tablosunun kendisidir, sonradan
     * eklenmiş bir where koşulu değil.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();

        $companies = $user->companies()
            ->orderBy('companies.name')
            ->get();

        return CompanyResource::collection($companies)->additional([
            'meta' => [
                // İstemcinin "hangisi aktif?" sorusuna cevabı. Seçim
                // yapılmamışsa null — ve bu bir hata değil, normal bir
                // durumdur (0 ya da 2+ şirket hâli).
                'active_company_id' => $user->active_company_id !== null
                    ? (int) $user->active_company_id
                    : null,
            ],
        ]);
    }

    /**
     * Aktif şirketi değiştirir.
     *
     * Üyelik kontrolü BURADA yapılmaz; CompanySelectionService'in işidir ve
     * orada kalmalıdır. Kontrolü controller'a kopyalamak, ileride iki yerden
     * birinin unutulması demektir.
     *
     * Üye olunmayan bir şirket için servis CrossTenantAccessException
     * fırlatır; AuthorizationException'dan türediği için Laravel bunu
     * otomatik 403'e çevirir (Faz 1'de bu bilinçli olarak tasarlanmıştı).
     *
     * Route model binding, üye olunmayan şirketi de çözer — ve çözmelidir:
     * 404 dönmek "böyle bir şirket var mı?" sorusunu yanıtlardı. Yetki
     * kararı 403 ile verilir.
     */
    public function select(Request $request, Company $company): CompanyResource
    {
        $selected = $this->companySelection->select($request->user(), $company);

        return CompanyResource::make($selected);
    }

    /**
     * Şirketin mali kimliğini günceller (Faz 7 / Adım 2).
     *
     * PATCH'TİR: gövde kaydın tamamını değil, DEĞİŞTİRİLECEK ALANLARI
     * tanımlar. Yalnızca vergi dairesini düzeltmek isteyen bir istek,
     * göndermediği vergi numarasını silmemelidir.
     *
     * OWNER-ONLY. Yetki sorusu AKTİF ŞİRKETE değil, route'tan çözülen
     * ŞİRKETE sorulur — bu uç bilinçli olarak company.context'in
     * dışındadır ve kullanıcı henüz şirket seçmemiş olabilir.
     *
     * Üye olmayan kullanıcı da 403 alır, 404 değil: 404 dönmek "böyle
     * bir şirket var mı?" sorusunu yanıtlardı (select ucundaki kararla
     * aynı).
     *
     * Yanıt CompanyResource DEĞİL CompanyBillingResource'tur: liste
     * ucunun şekli web ve Flutter tarafından kullanılıyor ve oraya mali
     * kimlik alanı eklemek gereksiz bir kırılma olurdu.
     */
    public function updateBilling(CompanyBillingRequest $request, Company $company): CompanyBillingResource
    {
        $this->authorize('updateBilling', $company);

        return CompanyBillingResource::make(
            $this->companyBilling->update($company, $request->validated())
        );
    }
}
