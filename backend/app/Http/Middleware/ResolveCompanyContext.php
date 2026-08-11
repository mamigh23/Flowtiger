<?php

namespace App\Http\Middleware;

use App\Exceptions\ActiveCompanyException;
use App\Services\CompanySelectionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Her istekte aktif şirketi çözümleyip CompanyContext'i kurar.
 *
 * Faz 1'de kurulan tenant isolation makinesinin tetikleyicisi budur:
 *
 *   Authenticated User → Valid Membership → Active Company
 *                      → CompanyContext → Tenant Isolation
 *
 * Bu middleware authentication YAPMAZ; kimliği doğrulanmış bir kullanıcı
 * bulmayı bekler. Bu yüzden zincirde daima `auth:sanctum` gibi bir
 * authentication middleware'inden SONRA çalıştırılmalıdır.
 *
 * Context kurulamazsa istek devam etmez — fail closed (§18).
 * Route'a bağlanması Faz 2.3'te bilinçli olarak yapılacaktır.
 */
class ResolveCompanyContext
{
    public function __construct(
        private readonly CompanySelectionService $companySelection,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user === null) {
            // Authentication bu middleware'in işi değil; ama sessizce geçmek
            // context'siz bir isteğin tenant katmanına ulaşması demek olurdu.
            throw ActiveCompanyException::unauthenticated();
        }

        $this->companySelection->resolveFor($user);

        return $next($request);
    }
}
