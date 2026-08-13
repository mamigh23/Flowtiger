<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Exceptions\ActiveCompanyException;
use App\Exceptions\CrossTenantAccessException;
use App\Models\Company;
use App\Models\User;

/**
 * Kullanıcının aktif şirketini seçer ve çözümler.
 *
 * Seçme (select) ve çözümleme (resolve) aynı serviste tutuldu: ikisi de tek
 * bir soruyu yanıtlıyor — "bu kullanıcı şu an hangi şirkette çalışıyor?".
 * Ayrı bir resolver sınıfı, yirmi satır için ikinci bir soyutlama katmanı
 * anlamına gelirdi (YAGNI, Anayasa §11).
 *
 * Aktif şirketi değiştirmenin TEK meşru yolu bu servistir. active_company_id
 * bilinçli olarak mass-assignable değildir (§16).
 */
class CompanySelectionService
{
    public function __construct(
        private readonly CompanyContext $context,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * Kullanıcının aktif şirketini belirtilen şirket olarak ayarlar.
     *
     * Üyelik doğrulanamazsa hiçbir yan etki oluşmaz: veritabanına yazılmaz,
     * mevcut context'e dokunulmaz (§11).
     *
     * @throws CrossTenantAccessException
     */
    public function select(User $user, Company $company): Company
    {
        if (! $user->isMemberOf($company)) {
            throw CrossTenantAccessException::forCompanyEntry($user, $company);
        }

        // Mass assignment yolu bilinçli olarak kullanılmıyor: bu alan
        // yalnızca burada, doğrulama sonrası, açıkça atanır.
        $user->active_company_id = $company->getKey();
        $user->save();

        $this->context->setForUser($user, $company);

        // Audit, üyelik doğrulandıktan ve seçim GERÇEKLEŞTİKTEN sonra
        // yazılır. Reddedilen bir seçim yukarıda exception ile döner ve
        // hiçbir iz bırakmaz — audit yalnızca olan biteni kaydeder,
        // denenen ve reddedileni değil (Faz 5 §11).
        $this->audit->record(
            action: AuditAction::CompanySelected,
            company: $company,
            auditable: $company,
        );

        return $company;
    }

    /**
     * Seçim belirsiz değilse kullanıcı adına otomatik seçer.
     *
     * Kurallar (§5):
     *   - Zaten geçerli bir aktif şirket varsa ona dokunulmaz.
     *   - 0 şirket → seçim yok, tenant erişimi yok.
     *   - 1 şirket → otomatik seçilir.
     *   - 2+ şirket → kullanıcı açıkça seçene kadar seçim yapılmaz.
     */
    public function selectAutomatically(User $user): ?Company
    {
        if ($user->active_company_id !== null) {
            $current = $user->companies()->whereKey($user->active_company_id)->first();

            if ($current !== null) {
                return $this->select($user, $current);
            }
        }

        // İki kayıt yeterli: "tam olarak bir tane mi?" sorusunun cevabı için
        // kullanıcının tüm şirketlerini çekmeye gerek yok.
        $candidates = $user->companies()->take(2)->get();

        if ($candidates->count() !== 1) {
            return null;
        }

        return $this->select($user, $candidates->first());
    }

    /**
     * Kullanıcının kayıtlı aktif şirketini doğrulayıp context'i kurar.
     *
     * Middleware'in kullandığı yol. Yalnızca active_company_id dolu olması
     * yeterli değildir: üyeliğin HÂLÂ geçerli olduğu her istekte yeniden
     * doğrulanır (§6). Üyelik sonradan kaldırılmışsa bayat bir aktif şirket
     * erişim vermez.
     *
     * @throws ActiveCompanyException
     */
    public function resolveFor(User $user): Company
    {
        $companyId = $user->active_company_id;

        if ($companyId === null) {
            throw ActiveCompanyException::notSelected($user);
        }

        // Tek sorgu hem şirketi yükler hem üyeliği kanıtlar: pivot üzerinden
        // gitmeyen bir kayıt zaten dönmez.
        $company = $user->companies()->whereKey($companyId)->first();

        if ($company === null) {
            throw ActiveCompanyException::membershipNoLongerValid($user, (int) $companyId);
        }

        $this->context->setForUser($user, $company);

        return $company;
    }
}
