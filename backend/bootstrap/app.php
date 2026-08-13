<?php

use App\Exceptions\ActiveCompanyException;
use App\Exceptions\TenantContextMissingException;
use App\Http\Middleware\ResolveCompanyContext;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

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
         * NOT: CrossTenantAccessException için render callback'i YOKTUR ve
         * olmamalıdır. AuthorizationException'dan türediği için Laravel onu
         * prepareException() aşamasında — render callback'lerinden ÖNCE —
         * 403'e çevirir; buraya yazılacak bir callback hiç çalışmazdı.
         * Faz 1 bu davranışa bilinçli olarak yaslanmıştı.
         */
    })->create();
