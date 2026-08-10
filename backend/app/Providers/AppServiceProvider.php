<?php

namespace App\Providers;

use App\Services\CompanyContext;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // singleton DEĞİL, scoped.
        //
        // singleton, uzun ömürlü süreçlerde (queue worker, Octane) aynı
        // CompanyContext örneğinin istekler/job'lar arasında yaşamasına yol
        // açar; bir isteğin şirketi diğerine sızabilir. scoped binding,
        // Laravel'in her istek/job sonunda çağırdığı forgetScopedInstances()
        // ile örneği sıfırlar.
        $this->app->scoped(CompanyContext::class, function (): CompanyContext {
            return new CompanyContext();
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
