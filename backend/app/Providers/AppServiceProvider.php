<?php

namespace App\Providers;

use App\Models\User;
use App\Policies\CompanyMemberPolicy;
use App\Services\CompanyContext;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Auth\CanResetPassword;
use Illuminate\Foundation\Events\DiagnosingHealth;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use RuntimeException;
use Throwable;

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
        $this->configurePasswordPolicy();
        $this->configurePasswordResetLink();
        $this->configureHealthCheck();
    }

    /**
     * /up ucunu gerçek bir HAZIRLIK (readiness) kontrolüne çevirir.
     *
     * Laravel'in health route'u varsayılan olarak yalnızca "PHP ayakta mı"
     * sorusunu yanıtlar; veritabanı çökmüş olsa bile 200 döner ve yük
     * dengeleyici trafiği ölü bir örneğe göndermeye devam eder.
     * DiagnosingHealth olayına bağlanmak, Laravel'in bunun için sunduğu
     * standart yoldur (§13) — ayrı bir health sistemi kurulmadı.
     *
     * İSTİSNA MESAJI NEDEN SANİTİZE EDİLİYOR:
     * PDO'nun bağlantı hataları host, veritabanı adı ve KULLANICI ADI
     * içerir ("...password authentication failed for user 'flowtiger_app'").
     * Laravel'in health route'u yakaladığı istisnanın mesajını yanıta
     * koyar; ham hâliyle bırakılsaydı /up, kimlik doğrulaması olmadan
     * veritabanı kimlik bilgilerini sızdıran bir uca dönüşürdü.
     *
     * Ayrıntılı hata log'a gider (report), dışarıya yalnızca nötr bir
     * etiket çıkar.
     */
    private function configureHealthCheck(): void
    {
        Event::listen(DiagnosingHealth::class, function (): void {
            try {
                DB::connection()->getPdo();
            } catch (Throwable $exception) {
                report($exception);

                throw new RuntimeException('database_unavailable');
            }
        });
    }

    /**
     * Parolanın TEK politikası (§11).
     *
     * Hem profil üzerinden parola değiştirme hem parola sıfırlama bu
     * kuraldan beslenir. İki yerde ayrı ayrı 'min:8' yazılsaydı, kural
     * bir gün birinde güncellenir diğerinde unutulurdu.
     *
     * Laravel'in yerleşik kural nesnesi kullanılıyor; ileride
     * ->mixedCase(), ->numbers() ya da sızmış parola veritabanına bakan
     * ->uncompromised() eklemek TEK satırlık bir değişiklik olacak ve
     * tüm parola uçlarında aynı anda geçerli olacak.
     *
     * Not: davet kabulü ve owner'ın üye oluşturması (Faz 4/6) hâlâ kendi
     * 'min:8' kurallarını taşıyor. Onları da buraya bağlamak doğru olur
     * ama bu fazın kapsamı §11 ile parola DEĞİŞTİRME akışlarıyla sınırlı.
     */
    /**
     * E-posta + IP tabanlı throttle anahtarı.
     *
     * Üç uç da (login, forgot, reset) aynı anahtarlamayı kullanır:
     *   - yalnızca IP: aynı ofisten çalışan masum kullanıcılar birbirini
     *     kilitler,
     *   - yalnızca e-posta: bir saldırgan istediği hesabı kilitleyerek
     *     hizmet dışı bırakabilir.
     *
     * Bu closure VALIDATION'DAN ÖNCE çalışır: gövde henüz doğrulanmamıştır
     * ve email bir dizi ya da null olabilir.
     *
     * Anahtar RateLimiter tarafından md5'lenerek cache'e yazılır; e-posta
     * ham hâliyle saklanmaz. Limiter adları da anahtara karıştığı için üç
     * uç birbirinin sayacını tüketmez.
     */
    private function emailThrottleKey(Request $request): string
    {
        $input = $request->input('email');
        $email = is_string($input) ? Str::lower($input) : '';

        return Str::transliterate($email).'|'.$request->ip();
    }

    private function configurePasswordPolicy(): void
    {
        PasswordRule::defaults(fn (): PasswordRule => PasswordRule::min(8));
    }

    /**
     * Sıfırlama bağlantısının nereye işaret edeceği.
     *
     * Laravel'in varsayılan davranışı 'password.reset' adlı bir ROUTE
     * arar; bu bir API projesinde yoktur ve olmamalıdır — kullanıcı
     * formu frontend'de doldurur, API yalnızca token'ı alır. Route
     * bulunamazsa mail gönderimi exception ile patlardı.
     *
     * Bu yüzden bağlantı config'deki şablondan üretilir. Frontend
     * geldiğinde değişecek tek şey o config satırıdır.
     *
     * Token yalnızca bu bağlantının içinde yaşar: veritabanında hash'i
     * durur, audit'e hiç girmez, hiçbir yanıtta dönmez.
     */
    private function configurePasswordResetLink(): void
    {
        ResetPassword::createUrlUsing(function (CanResetPassword $notifiable, string $token): string {
            return str_replace(
                ['{token}', '{email}'],
                [$token, urlencode($notifiable->getEmailForPasswordReset())],
                (string) config('flowtiger.password_reset.url'),
            );
        });
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
            return Limit::perMinute(5)->by($this->emailThrottleKey($request));
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

        /*
         * Parola sıfırlama uçları (Faz 8).
         *
         * İkisi de kimlik doğrulaması olmadan çalışır:
         *
         *   forgot → mail gönderim yüzeyi. Sınır olmasaydı bir saldırgan
         *            başkasının gelen kutusunu doldurabilir ve mail
         *            sağlayıcımızın itibarını yakabilirdi.
         *   reset  → token TAHMİN ETME yüzeyi. Token 256 bit olduğu için
         *            kaba kuvvet pratikte imkânsız; sınır otomatik
         *            taramayı keser.
         *
         * ANAHTAR ENUMERATION AÇMAZ: gönderilen e-posta kayıtlı olsun ya
         * da olmasın aynı biçimde anahtarlanır, dolayısıyla 429 yanıtı da
         * hesabın varlığı hakkında hiçbir şey söylemez.
         */
        RateLimiter::for('password-forgot', function (Request $request): Limit {
            return Limit::perMinute(5)->by($this->emailThrottleKey($request));
        });

        RateLimiter::for('password-reset', function (Request $request): Limit {
            return Limit::perMinute(5)->by($this->emailThrottleKey($request));
        });
    }
}
