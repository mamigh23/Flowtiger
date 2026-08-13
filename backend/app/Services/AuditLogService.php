<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

/**
 * Audit kaydı yazmanın TEK kapısı.
 *
 * İki metot, iki farklı gerçeklik (§5, §6):
 *
 *   record()          → tenant olayı. Şirket ÇAĞIRANDAN gelir, aktör
 *                       oturumdan. company_id daima doludur.
 *   recordAuthEvent() → kimlik doğrulama olayı. Henüz şirket seçilmemiştir;
 *                       aktör açıkça verilir ve null olabilir.
 *
 * ŞİRKET NEDEN PARAMETRE, CONTEXT'TEN OKUNMUYOR:
 * Audit kaydının company_id'si kanıtlanmış bir olgu olmalı. Context'ten
 * okumak, "o an bellekte ne varsa" demektir; CustomerService gibi bazı
 * yollar ise bilinçli olarak context'siz de çalışır (seeder, konsol).
 * Çağıran hangi şirket için iş yaptığını zaten bilir — onu söylesin.
 *
 * HATA YUTULMAZ:
 * Burada try/catch YOKTUR ve olmamalıdır (§20.25). Audit yazımı
 * başarısız olursa istisna yukarı çıkar ve iş işlemi de başarısız olur.
 * Sessizce yutulan bir audit hatası, iz bırakmadan iş yapılabileceği
 * anlamına gelir — audit sisteminin varlık sebebine aykırıdır.
 */
class AuditLogService
{
    /**
     * Bu parçaları İÇEREN her anahtar audit payload'ından DÜŞÜRÜLÜR (§3).
     *
     * Alt dize eşleşmesi kullanılır: 'password' kuralı 'user_password' ve
     * 'password_confirmation' anahtarlarını da yakalar. Beyaz liste değil
     * kara liste olması bilinçli — payload'lar zaten çağıran tarafından
     * elle seçiliyor; bu katman son savunma hattı.
     *
     * @var list<string>
     */
    private const SENSITIVE_KEY_FRAGMENTS = [
        'password',
        'token',
        'secret',
        'authorization',
        'cookie',
        'session',
        'credential',
        'api_key',
        'apikey',
        'private_key',
        'signature',
        'otp',
    ];

    private const MAX_USER_AGENT_LENGTH = 512;

    /**
     * Tenant olayı kaydeder.
     *
     * @param  array<string, mixed>|null  $oldValues
     * @param  array<string, mixed>|null  $newValues
     * @param  array<string, mixed>  $metadata
     */
    public function record(
        AuditAction $action,
        Company $company,
        ?Model $auditable = null,
        ?array $oldValues = null,
        ?array $newValues = null,
        array $metadata = [],
    ): AuditLog {
        return $this->write(
            action: $action,
            companyId: $company->getKey(),
            actorId: Auth::id(),
            auditable: $auditable,
            oldValues: $oldValues,
            newValues: $newValues,
            metadata: $metadata,
        );
    }

    /**
     * Şirket bağlamı olmayan kimlik doğrulama olayını kaydeder.
     *
     * Aktör AÇIKÇA verilir; Auth::id() kullanılmaz. Başarısız login'de
     * oturum açmış kimse yoktur ama denemenin hedefi bilinebilir; logout'ta
     * ise kullanıcı token iptal edildikten sonra da bilinir olmalıdır.
     *
     * @param  array<string, mixed>  $metadata
     */
    public function recordAuthEvent(
        AuditAction $action,
        ?User $actor = null,
        array $metadata = [],
    ): AuditLog {
        return $this->write(
            action: $action,
            companyId: null,
            actorId: $actor?->getKey(),
            auditable: null,
            oldValues: null,
            newValues: null,
            metadata: $metadata,
        );
    }

    /**
     * E-postayı saklamadan, tekrarlanan denemelerin korele edilebilmesi
     * için tek yönlü özet üretir (§12).
     *
     * Düz metin e-posta audit tablosuna hiç girmez: başarısız login
     * denemeleri sistemde HESABI OLMAYAN kişilerin adreslerini de içerir
     * (yanlış yazım, credential stuffing listeleri). Onları saklamak,
     * saldırganın listesini bizim adımıza arşivlemektir.
     */
    public function hashEmail(string $email): string
    {
        return hash('sha256', Str::lower(trim($email)));
    }

    /**
     * @param  array<string, mixed>|null  $oldValues
     * @param  array<string, mixed>|null  $newValues
     * @param  array<string, mixed>  $metadata
     */
    private function write(
        AuditAction $action,
        ?int $companyId,
        ?int $actorId,
        ?Model $auditable,
        ?array $oldValues,
        ?array $newValues,
        array $metadata,
    ): AuditLog {
        $request = $this->currentRequest();

        $log = new AuditLog();

        $log->company_id = $companyId;
        $log->user_id = $actorId;
        $log->action = $action;

        if ($auditable !== null) {
            // Laravel'in standart polimorfik biçimi (tam sınıf yolu).
            // Global morphMap kurulmadı: Sanctum'un tokenable_type'ını da
            // değiştirirdi (bkz. AppServiceProvider'daki not). Kısa ada
            // çevirme yalnızca API yanıtında, AuditLogResource'ta yapılır.
            $log->auditable_type = $auditable->getMorphClass();
            $log->auditable_id = $auditable->getKey();
        }

        $log->old_values = $this->filterSensitive($oldValues);
        $log->new_values = $this->filterSensitive($newValues);
        $log->metadata = $this->filterSensitive($metadata !== [] ? $metadata : null);

        $log->ip_address = $request?->ip();
        $log->user_agent = $this->normaliseUserAgent($request?->userAgent());

        $log->save();

        return $log;
    }

    /**
     * Hassas anahtarları payload'dan çıkarır — iç içe dizilerde de.
     *
     * Anahtar REDACTED ile işaretlenmez, tamamen DÜŞÜRÜLÜR. İşaretlemek,
     * "burada bir parola alanı vardı" bilgisini saklamak demektir; §3
     * bu konuda mutlak: hiçbir iz kalmasın.
     *
     * @param  array<string, mixed>|null  $values
     * @return array<string, mixed>|null
     */
    private function filterSensitive(?array $values): ?array
    {
        if ($values === null) {
            return null;
        }

        $filtered = [];

        foreach ($values as $key => $value) {
            if ($this->isSensitiveKey((string) $key)) {
                continue;
            }

            $filtered[$key] = is_array($value)
                ? $this->filterSensitive($value)
                : $value;
        }

        return $filtered === [] ? null : $filtered;
    }

    private function isSensitiveKey(string $key): bool
    {
        $normalised = Str::lower($key);

        foreach (self::SENSITIVE_KEY_FRAGMENTS as $fragment) {
            if (str_contains($normalised, $fragment)) {
                return true;
            }
        }

        return false;
    }

    private function normaliseUserAgent(?string $userAgent): ?string
    {
        if ($userAgent === null || trim($userAgent) === '') {
            return null;
        }

        return Str::limit($userAgent, self::MAX_USER_AGENT_LENGTH, '');
    }

    /**
     * Konsol komutlarında ve queue worker'larda gerçek bir istek yoktur;
     * IP ve user agent o durumda null kalır.
     */
    private function currentRequest(): ?Request
    {
        $request = request();

        return $request instanceof Request ? $request : null;
    }
}
