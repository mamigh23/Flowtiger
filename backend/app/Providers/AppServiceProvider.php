<?php

namespace App\Providers;

use App\Models\User;
use App\Policies\CompanyMemberPolicy;
use App\Services\CompanyContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
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
        $this->registerPolicies();
    }

    /*
     * NOT — Relation::morphMap BİLİNÇLİ OLARAK KULLANILMADI.
     *
     * audit_logs.auditable_type'a 'App\Models\Customer' yerine 'customer'
     * yazdırmak cazipti. Ancak morphMap GLOBAL'dir ve Laravel'deki TÜM
     * polimorfik ilişkileri etkiler — Sanctum'un
     * personal_access_tokens.tokenable_type sütunu dahil. Haritayı
     * kurmak, Faz 2.1'den beri çalışan token şemasını sessizce
     * değiştirir ve SanctumTokenTest'in doğruladığı sözleşmeyi kırardı.
     *
     * Audit tablosunun okunabilirliği için ödenecek bedel değil.
     * Kısaltma yalnızca API yanıtında, AuditLogResource içinde yapılır;
     * veritabanı Laravel'in standart davranışını korur ve morphTo
     * ilişkisi sorunsuz çözülür.
     */

    /**
     * İsimlendirmeyle otomatik keşfedilemeyen policy kayıtları.
     *
     * CompanyMemberPolicy, adı gereği App\Policies\UserPolicy olmadığı için
     * açıkça bağlanır. Bu bilinçli bir tercih: "UserPolicy" adı, uygulamanın
     * HER yerindeki User yetkilendirmesinin şirket üyeliği kuralına tabi
     * olduğunu ima ederdi. Oysa bu policy'nin sorduğu tek soru şudur:
     * "isteği yapan, AKTİF ŞİRKETİN üyelerini yönetebilir mi?"
     *
     * CustomerPolicy kaydedilmez ve kaydedilmemelidir — o, Laravel'in
     * Model↔Policy isim eşleşmesiyle Faz 1'den beri otomatik bulunuyor.
     */
    private function registerPolicies(): void
    {
        Gate::policy(User::class, CompanyMemberPolicy::class);
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

        /*
         * Davet kabul ucu kimlik doğrulaması olmadan çalışır ve tek
         * korunması gereken şey token'dır. 256 bitlik bir token'ı kaba
         * kuvvetle bulmak pratikte imkânsızdır; bu sınır asıl olarak
         * otomatik tarama gürültüsünü ve süresi dolmuş token'ların
         * tekrar tekrar denenmesini keser.
         *
         * Anahtar yalnızca IP: token'a göre sınırlamak, saldırganın her
         * denemede farklı token kullanması nedeniyle işe yaramazdı.
         */
        RateLimiter::for('invitation-accept', function (Request $request): Limit {
            return Limit::perMinute(10)->by((string) $request->ip());
        });

        /*
         * Doğrulama maili isteme (Faz 7).
         *
         * Kimliği doğrulanmış kullanıcı yalnızca KENDİ adresine mail
         * ister; burada bir e-posta sayım (enumeration) yüzeyi yoktur.
         * Sınırın amacı farklı: "gönder" düğmesine defalarca basan bir
         * kullanıcının kendi gelen kutusunu doldurmasını ve mail
         * sağlayıcısında itibar kaybı yaratmasını önlemek.
         *
         * Anahtar kullanıcı kimliğidir; IP'ye göre sınırlamak, aynı
         * ofisten çalışan meslektaşları birbirine bağlardı.
         */
        RateLimiter::for('verification-notification', function (Request $request): Limit {
            return Limit::perMinute(6)->by((string) ($request->user()?->getKey() ?? $request->ip()));
        });

        /*
         * Doğrulama bağlantısının kendisi (Faz 7).
         *
         * Kimlik doğrulaması olmadan çalışır, bu yüzden anahtar IP'dir.
         * İmza tahmin edilemez olduğu için kaba kuvvet zaten anlamsız;
         * sınır, otomatik tarama gürültüsünü keser.
         */
        RateLimiter::for('email-verification', function (Request $request): Limit {
            return Limit::perMinute(10)->by((string) $request->ip());
        });

        /*
         * Parola değiştirme (Faz 7).
         *
         * `current_password` kuralı yüzünden bu uç, oturumu ele geçirmiş
         * ama parolayı bilmeyen bir saldırgan için parola DENEME yüzeyine
         * dönüşür. Sınır bu denemeleri keser.
         */
        RateLimiter::for('password-change', function (Request $request): Limit {
            return Limit::perMinute(6)->by((string) ($request->user()?->getKey() ?? $request->ip()));
        });
    }
}
