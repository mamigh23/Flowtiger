<?php

namespace App\Providers;

use App\Services\CompanyContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

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
        $this->configureLoginRateLimiter();
    }

    /**
     * Login ucunun brute-force sınırı.
     *
     * Anahtar e-posta + IP birleşimidir:
     *   - yalnızca IP: aynı ofisten/NAT arkasından çalışan masum
     *     kullanıcılar birbirini kilitler,
     *   - yalnızca e-posta: bir saldırgan istediği hesabı kilitleyerek
     *     hizmet dışı bırakabilir (account lockout DoS).
     *
     * Anahtar RateLimiter tarafından hash'lenerek cache'e yazılır; e-posta
     * ham hâliyle saklanmaz. Parola bu hesaba hiç girmez.
     */
    private function configureLoginRateLimiter(): void
    {
        RateLimiter::for('login', function (Request $request): Limit {
            // Bu closure VALIDATION'DAN ÖNCE çalışır: gövde henüz
            // doğrulanmamıştır ve email bir dizi ya da null olabilir.
            // Doğrudan (string) cast'i "Array to string conversion"
            // uyarısı üretirdi.
            $input = $request->input('email');
            $email = is_string($input) ? Str::lower($input) : '';

            return Limit::perMinute(5)->by(Str::transliterate($email).'|'.$request->ip());
        });
    }
}
