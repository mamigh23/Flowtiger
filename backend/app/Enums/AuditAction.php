<?php

namespace App\Enums;

/**
 * Audit log'a yazılabilecek olayların KAPALI listesi.
 *
 * Neden enum: aksi halde 'customer.updated' stringi controller'lara,
 * servislere ve testlere dağılır; birinde 'customer.update' yazıldığı gün
 * o olay sessizce ayrı bir action'a dönüşür ve hiçbir sorguda görünmez.
 * Audit'in tek işi güvenilir olmaktır; sessizce kaybolan kayıt, hiç
 * olmayan kayıttan daha kötüdür.
 *
 * NEDEN VERİTABANI CHECK KISITI YOK (Faz 4'teki role'den farklı):
 * role KULLANICI GİRDİSİNDEN gelir — bir istek gövdesi 'superadmin'
 * yazabilir, bu yüzden veritabanı da savunma yapmalıdır. action ise
 * yalnızca koddan gelir; hiçbir istek onu belirleyemez. Buna karşılık her
 * yeni özellik yeni bir action ekler ve CHECK kısıtı her seferinde
 * ALTER TABLE demek olurdu. Kısıtın maliyeti faydasını aşıyor.
 *
 * İsimlendirme: "kaynak.eylem" (nokta ayraçlı), geçmiş zaman. Olay
 * OLMUŞ bir şeydir; 'customer.create' değil 'customer.created'.
 */
enum AuditAction: string
{
    // Kimlik doğrulama — company context OLMADAN gerçekleşir (§5)
    case LoginSucceeded = 'login.success';

    case LoginFailed = 'login.failed';

    case LoggedOut = 'logout';

    // Şirket bağlamı
    case CompanySelected = 'company.selected';

    // Üyelik
    case MemberCreated = 'member.created';

    case MemberUpdated = 'member.updated';

    case MemberRemoved = 'member.removed';

    case MemberRoleChanged = 'member.role_changed';

    // Müşteri
    case CustomerCreated = 'customer.created';

    case CustomerUpdated = 'customer.updated';

    case CustomerDeleted = 'customer.deleted';

    /**
     * Bu olay tenant'a mı ait?
     *
     * false dönen olaylar company_id olmadan kaydedilir ve kullanıcıya açık
     * audit API'sinde GÖRÜNMEZ (§17). Kimlik doğrulama olayları henüz bir
     * şirket seçilmemişken gerçekleşir; onları rastgele bir şirkete
     * yazmak, audit kaydını yalan söyler hale getirir.
     */
    public function belongsToTenant(): bool
    {
        return ! in_array($this, [
            self::LoginSucceeded,
            self::LoginFailed,
            self::LoggedOut,
        ], true);
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $action): string => $action->value, self::cases());
    }
}
