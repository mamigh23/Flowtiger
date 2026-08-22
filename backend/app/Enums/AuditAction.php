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

    /*
     * Kimlik ve hesap olayları — kimlik doğrulama gibi ŞİRKETSİZ kaydedilir.
     *
     * Sebep: bir kullanıcı birden fazla şirketin üyesi olabilir. Parola
     * değişikliğini "o an aktif olan" şirkete yazmak keyfi bir seçim
     * olurdu; olayın şirketle hiçbir ilgisi yok, kişinin hesabıyla ilgisi
     * var. Bu kayıtlar şirket audit API'sinde görünmez (§17, Faz 5).
     */
    case ProfileUpdated = 'profile.updated';

    case EmailChanged = 'email.changed';

    case EmailVerificationRequested = 'email.verification_requested';

    case EmailVerified = 'email.verified';

    case PasswordChanged = 'password.changed';

    /*
     * Parola sıfırlama.
     *
     * password.reset.failed BİLİNÇLİ OLARAK YOK (§13 değerlendirmesi):
     * sıfırlama ucu kimlik doğrulaması OLMADAN çalışır ve audit tablosu
     * Faz 5'ten beri kalıcıdır (güncellenemez, silinemez, saklama süresi
     * yoktur). Başarısız denemeleri kaydetmek, tabloyu saldırganın
     * istediği kadar büyütebildiği bir yüzeye çevirirdi. Üstelik geçersiz
     * bir token hangi hesabın hedeflendiğini de söylemez — kayıt neredeyse
     * bilgisiz olurdu. Doğru kontrol audit değil rate limit'tir.
     */
    case PasswordResetRequested = 'password.reset.requested';

    case PasswordResetCompleted = 'password.reset.completed';

    /*
     * Oturum yönetimi.
     *
     * sessions.revoked_all BİLİNÇLİ OLARAK YOK (§10, §12): "hepsini kapat"
     * diye ayrı bir uç açılmadı, çünkü aynı sonuç mevcut iki uçla
     * elde ediliyor (diğerlerini kapat + çıkış yap). Kullanılmayan bir
     * action, audit sorgularında yanıltıcı bir boşluk bırakırdı.
     */
    case SessionRevoked = 'session.revoked';

    case SessionsRevokedOthers = 'sessions.revoked_others';

    // Şirket bağlamı
    case CompanySelected = 'company.selected';

    // Üyelik
    case MemberCreated = 'member.created';

    case MemberUpdated = 'member.updated';

    case MemberRemoved = 'member.removed';

    case MemberRoleChanged = 'member.role_changed';

    /*
     * Davet.
     *
     * invitation.expired BİLİNÇLİ OLARAK YOK (§23): süre dolması bir
     * OLAY değil, zamanın geçmesiyle oluşan bir DURUMDUR. Kimse onu
     * "yapmaz". Kaydetmek için tabloyu tarayan zamanlanmış bir iş
     * gerekirdi ve o iş, audit'e hiçbir yeni bilgi eklemeden gürültü
     * üretirdi: expires_at zaten kayıtta duruyor.
     */
    case InvitationCreated = 'invitation.created';

    case InvitationRevoked = 'invitation.revoked';

    case InvitationAccepted = 'invitation.accepted';

    // Müşteri
    case CustomerCreated = 'customer.created';

    case CustomerUpdated = 'customer.updated';

    case CustomerDeleted = 'customer.deleted';

    /*
     * Mali kimlik (Faz 7 / Adım 2).
     *
     * customer.updated'dan AYRI olmalarının sebebi, ayrı uçlara sahip
     * olmalarıyla aynı: vergi numarası fatura kesiminde yasal olarak
     * bağlayıcıdır. "Bu şirketin vergi numarasını kim değiştirdi?"
     * sorusu, fatura kesildikten sonra tek başına aranabilir olmalı —
     * bir ad düzenlemesinin izleri arasında kaybolmamalı.
     */
    case CompanyBillingUpdated = 'company.billing_updated';

    case CustomerBillingUpdated = 'customer.billing_updated';

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

            // Hesabın kendisine ait olaylar; hiçbir şirkete ait değiller.
            self::ProfileUpdated,
            self::EmailChanged,
            self::EmailVerificationRequested,
            self::EmailVerified,
            self::PasswordChanged,
            self::PasswordResetRequested,
            self::PasswordResetCompleted,
            self::SessionRevoked,
            self::SessionsRevokedOthers,
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
