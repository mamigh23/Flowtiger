<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CompanyResource;
use App\Models\Company;
use App\Services\CompanySelectionService;
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
    public function __construct(
        private readonly CompanySelectionService $companySelection,
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
}
