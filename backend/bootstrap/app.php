<?php

use App\Exceptions\ActiveCompanyException;
use App\Exceptions\FinanceEntryException;
use App\Exceptions\InvitationException;
use App\Exceptions\LastOwnerException;
use App\Exceptions\PaymentException;
use App\Exceptions\RegistrationException;
use App\Exceptions\TaskException;
use App\Exceptions\TenantContextMissingException;
use App\Http\Middleware\ResolveCompanyContext;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        apiPrefix: 'api/v1',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /*
         * company.context YALNIZCA bir alias'tır — global middleware DEĞİL.
         *
         * append() kullanılsaydı her istek aktif şirket ister, login ve
         * şirket listeleme uçları kilitlenirdi: kullanıcı şirket seçemeden
         * context kuramaz, context kuramadan şirket seçemezdi.
         *
         * Tenant uçları bu alias'ı route seviyesinde, auth:sanctum'dan
         * SONRA kullanır (bkz. routes/api.php).
         */
        $middleware->alias([
            'company.context' => ResolveCompanyContext::class,
        ]);

        /*
         * SIRALAMA GARANTİSİ — Faz 3'ün en kritik tek satırı.
         *
         * SORUN:
         * Laravel, bir route'un middleware'lerini yazıldıkları sıraya göre
         * DEĞİL, priority listesine göre çalıştırır (SortedMiddleware).
         * SubstituteBindings bu listede vardır, ResolveCompanyContext ise
         * yoktu. Sonuç:
         *
         *   auth:sanctum → SubstituteBindings → company.context
         *
         * Yani {customer} route model binding'i, aktif şirket HENÜZ
         * KURULMAMIŞKEN çalışırdı. Binding sorgusu CompanyScope'un altından
         * geçtiği için context bulamaz, TenantContextMissingException
         * fırlatır ve HER show/update/delete isteği 403 dönerdi.
         *
         * ÇÖZÜM:
         * ResolveCompanyContext'i priority listesinde SubstituteBindings'in
         * hemen ÖNÜNE koymak. Böylece gerçek sıra:
         *
         *   auth:sanctum → company.context → SubstituteBindings → controller
         *
         * NEDEN BU ÇÖZÜM, "controller'da elle findOrFail" DEĞİL:
         * Bu projenin tenant güvenliği "doğru şeyi otomatik yap" ilkesine
         * dayanır (CompanyScope'un varlık sebebi budur). Binding'den vazgeçip
         * her controller'da elle sorgu yazmak, gelecekteki her tenant modeli
         * için unutulabilecek bir adım eklerdi. Bu satır ise bir kez yazılır
         * ve tüm tenant modelleri için geçerlidir.
         *
         * Bu, GLOBAL MIDDLEWARE EKLEMEK DEĞİLDİR: priority listesi yalnızca
         * bir route'ta ZATEN BULUNAN middleware'lerin sırasını belirler.
         * company.context taşımayan uçlar bundan etkilenmez.
         */
        $middleware->prependToPriorityList(
            before: SubstituteBindings::class,
            prepend: ResolveCompanyContext::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        /*
         * Faz 1/2.2'nin tenant exception'ları RuntimeException'dan türer;
         * HTTP karşılıkları bilinçli olarak o fazlarda atanmamıştı ("API
         * katmanı kurulduğunda orada dönüştürülecek"). Dönüşüm burada,
         * exception sınıflarına dokunmadan yapılır.
         *
         * Neden 500 değil 403: bunlar uygulama hatası değil, REDDEDİLMİŞ
         * ERİŞİMDİR. 500 dönmek hem yanıltıcı olurdu hem de bir güvenlik
         * kararını "sunucu çöktü" gibi gösterirdi.
         *
         * Neden 404 değil 403: kaynağın varlığını gizlemek burada bir şey
         * kazandırmaz — kullanıcı zaten kendi aktif şirketini sorguluyor.
         *
         * Yanıtta exception mesajı DÖNDÜRÜLMEZ: mesajlar kullanıcı ve
         * şirket ID'leri içerir (bkz. ActiveCompanyException). İstemciye
         * makine-okunur bir kod ve nötr bir açıklama gider; ayrıntı logda
         * kalır.
         */
        $exceptions->render(function (ActiveCompanyException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => 'Aktif şirket bulunamadı ya da doğrulanamadı. Erişim reddedildi.',
                'code' => 'company_context_unavailable',
            ], 403);
        });

        /*
         * Tenant'a ait bir sorgu, aktif şirket olmadan çalıştırıldı.
         * CompanyScope fail-closed davranıp exception fırlatır; HTTP
         * karşılığı da kapalı olmalıdır.
         */
        $exceptions->render(function (TenantContextMissingException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => 'Aktif şirket bağlamı yok. Erişim reddedildi.',
                'code' => 'tenant_context_missing',
            ], 403);
        });

        /*
         * "Bir şirket asla ownersız kalamaz" kuralının ihlali.
         *
         * Neden 403 değil 422: isteği yapan kullanıcının yetkisi TAMDIR —
         * owner olmasaydı policy zaten reddederdi. Reddedilen şey kişi
         * değil, sistemi tutarsız bırakacak SONUÇ. 422 "isteğin biçimi
         * doğru ama içeriği kabul edilemez" demektir; burada kastedilen
         * tam olarak budur.
         *
         * Neden 409 değil: §21'de tanımlı status kümesinin dışına
         * çıkmamak için. Ayrım makine-okunur kodla yapılır.
         */
        $exceptions->render(function (LastOwnerException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => 'Bu işlem şirketi owner\'sız bırakırdı. '.
                    'Önce başka bir üyeye owner rolü verin.',
                'code' => 'company_requires_an_owner',
            ], 422);
        });

        /*
         * Davet akışının reddedilme sebepleri.
         *
         * Durum ve kod exception'ın kendisinde taşınır; burada tek bir
         * callback hepsini karşılar. Alternatif — her sebep için ayrı
         * exception sınıfı ve ayrı callback — aynı bilgiyi iki dosyaya
         * bölerdi.
         *
         * Mesaj istemciye GÖNDERİLİR — çünkü InvitationException'ın
         * mesajları bu amaçla, kullanıcıya gösterilmeye uygun yazılmıştır:
         * token, e-posta, kullanıcı ya da şirket kimliği içermezler.
         * Buraya yeni bir sebep eklenirken aynı kural geçerlidir.
         */
        $exceptions->render(function (InvitationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->errorCode,
            ], $e->status);
        });

        /*
         * Finans kaydının durum kuralları (Faz 7 / Adım 3).
         *
         * InvitationException ile aynı desen: durum ve kod exception'ın
         * kendisinde taşınır, tek callback hepsini karşılar.
         *
         * Bunlar YETKİ hatası DEĞİLDİR — isteği yapanın yetkisi tamdır,
         * policy zaten geçmiştir. Kaydın DURUMU işleme izin vermiyor
         * (iptal edilmiş kayıt değiştirilemez, iptal ikinci kez
         * yapılamaz). Bu yüzden 403 değil 422.
         *
         * Mesajlar istemciye gönderilir: kullanıcıya gösterilmeye uygun
         * yazılmışlardır ve hiçbir kimlik ya da iç ayrıntı içermezler.
         */
        $exceptions->render(function (FinanceEntryException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->errorCode,
            ], $e->status);
        });

        /*
         * Ödemenin durum kuralları (Faz 7 / Adım 4).
         *
         * FinanceEntryException ile aynı desen ve aynı gerekçe: yetki
         * hatası değil, kaydın durumu işleme izin vermiyor → 422 + kod.
         */
        $exceptions->render(function (PaymentException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->errorCode,
            ], $e->status);
        });

        /*
         * Görevin durum kuralları (Task/Planning v1).
         *
         * FinanceEntryException ve PaymentException ile aynı desen ve aynı
         * gerekçe: yetki hatası değil, kaydın durumu işleme izin vermiyor
         * (zaten tamamlanmış bir görev yeniden tamamlanamaz, zaten açık
         * olan yeniden açılamaz) → 403 değil 422 + makine-okunur kod.
         */
        $exceptions->render(function (TaskException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->errorCode,
            ], $e->status);
        });

        /*
         * Self-servis kaydın reddedilme sebepleri (P0-01).
         *
         * FinanceEntryException/PaymentException/TaskException ile aynı
         * desen: durum ve makine-okunur kod exception'ın kendisinde
         * taşınır, tek callback hepsini karşılar.
         *
         * TEK SEBEP şu an: e-posta, form doğrulamasını GEÇTİKTEN SONRA ama
         * transaction commit olmadan önce başka bir istek tarafından
         * alınmış (register/invitation-accept yarışı). Bu YETKİ hatası
         * DEĞİLDİR, isteğin BİÇİMİ de bozuk değildir — içerik artık geçersiz
         * hale gelmiştir; bu yüzden 403 ya da 400 değil 422 kullanılır.
         *
         * Mesaj istemciye gönderilir: RegistrationException'ın mesajları bu
         * amaçla yazılmıştır, token/e-posta/kullanıcı kimliği içermezler.
         */
        $exceptions->render(function (RegistrationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->errorCode,
            ], $e->status);
        });

        /*
         * NOT: CrossTenantAccessException için render callback'i YOKTUR ve
         * olmamalıdır. AuthorizationException'dan türediği için Laravel onu
         * prepareException() aşamasında — render callback'lerinden ÖNCE —
         * 403'e çevirir; buraya yazılacak bir callback hiç çalışmazdı.
         * Faz 1 bu davranışa bilinçli olarak yaslanmıştı.
         */
    })->create();
