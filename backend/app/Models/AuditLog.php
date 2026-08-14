<?php

namespace App\Models;

use App\Enums\AuditAction;
use App\Models\Scopes\CompanyScope;
use Database\Factories\AuditLogFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use LogicException;

/**
 * Değişmez bir olay kaydı.
 *
 * TENANT SCOPE — NEDEN BelongsToCompany DEĞİL de sadece CompanyScope:
 *
 * BelongsToCompany üç şey yapar: okuma filtresi, yazarken company_id'yi
 * AKTİF CONTEXT'TEN doldurma, ve context dışına yazmayı engelleme.
 * Audit için yalnızca BİRİNCİSİ doğrudur.
 *
 * Otomatik doldurma burada tehlikelidir: bir failed-login kaydı, o sırada
 * bellekte kalmış bir company context yüzünden rastgele bir şirkete
 * yazılabilirdi. Audit kaydının company_id'si ÇIKARSANAN değil KANITLANAN
 * bir olgu olmalıdır — bu yüzden AuditLogService onu her zaman açıkça,
 * çağıranın verdiği Company'den yazar.
 *
 * Okuma filtresi ise aynen geçerlidir: aktif şirketin dışındaki hiçbir
 * kayıt sorguya giremez ve context yoksa sorgu fail-closed patlar.
 * company_id'si NULL olan sistem kayıtları (login/logout) bu filtreye
 * takılır ve kullanıcıya açık API'de hiç görünmez — istenen davranış (§17).
 *
 * DEĞİŞMEZLİK:
 * Audit kaydı güncellenemez ve silinemez. Bir audit satırını
 * değiştirebilen sistem, audit tutmuyor demektir. Model seviyesindeki bu
 * bekçi, "hızlıca şu kaydı düzeltelim" refleksine karşı ilk savunmadır.
 */
class AuditLog extends Model
{
    /** @use HasFactory<AuditLogFactory> */
    use HasFactory;

    /**
     * Audit kaydı güncellenmez; updated_at sütunu da yoktur.
     */
    public const UPDATED_AT = null;

    /**
     * Mass assignment burada güvenlidir: AuditLog HİÇBİR istek gövdesinden
     * oluşturulmaz. Tek yazan AuditLogService'tir ve o da her alanı
     * doğrulanmış kaynaklardan doldurur. Fillable listesi, factory'nin
     * çalışabilmesi ve yazılabilir alanların görünür olması içindir.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'user_id',
        'action',
        'auditable_type',
        'auditable_id',
        'old_values',
        'new_values',
        'metadata',
        'ip_address',
        'user_agent',
        'created_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'action' => AuditAction::class,
            'old_values' => 'array',
            'new_values' => 'array',
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Yalnızca OKUMA filtresi. Yazma tarafı bilinçli olarak serbest;
        // company_id'yi servis açıkça yazar (bkz. sınıf docblock'u).
        static::addGlobalScope(new CompanyScope());

        static::updating(function (): void {
            throw new LogicException(
                'Audit kaydı değiştirilemez. Bir audit satırını düzeltebilen sistem audit tutmuyordur.'
            );
        });

        static::deleting(function (): void {
            throw new LogicException(
                'Audit kaydı silinemez. Saklama politikası (retention) ayrı bir karardır ve '.
                'uygulama kodundan değil, açık bir bakım sürecinden geçmelidir.'
            );
        });
    }

    /**
     * Kullanıcının KENDİ güvenlik olayları (Faz 9).
     *
     * Bu, global tenant scope'un bilinçli olarak kaldırıldığı TEK yerdir
     * ve öyle kalmalıdır. Gerekçesi:
     *
     * Kimlik olayları (login, parola değişimi, oturum kapatma...) hiçbir
     * şirkete ait DEĞİLDİR; company_id'leri NULL'dır. CompanyScope onları
     * ya "aktif şirkete eşit değil" diye eler ya da context yokken
     * fail-closed patlar. Yani bu sorgu için scope yalnızca gereksiz
     * değil, ANLAMSIZDIR — hiçbir zaman doğru sonucu veremez.
     *
     * Scope'un kaldırılması güvenliği ZAYIFLATMAZ, çünkü yerine iki
     * kısıt AYNI zincirde, ayrılamaz biçimde konur:
     *
     *   user_id = $user        → başkasının olayı dönemez
     *   company_id IS NULL     → hiçbir tenant kaydı dönemez
     *
     * İkincisi kritik: şirkete ait bir audit satırının bu sorgudan
     * çıkması matematiksel olarak imkânsızdır. Tenant izolasyonu
     * gevşetilmedi, farklı bir eksende yeniden kuruldu.
     *
     * Bu yüzden metot MODELDE duruyor: tehlikeli çağrı tek ve
     * denetlenebilir bir yerde kalsın, controller'lara dağılmasın.
     *
     * @return Builder<AuditLog>
     */
    public static function securityEventsFor(User $user): Builder
    {
        return static::query()
            ->withoutGlobalScope(CompanyScope::class)
            ->where('user_id', $user->getKey())
            ->whereNull('company_id');
    }

    /**
     * Olayı gerçekleştiren kullanıcı. Kimlik doğrulanmamış olaylarda null.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * Olayın konusu olan kayıt (Customer, User...). Kimlik doğrulama gibi
     * bir kayda bağlı olmayan olaylarda null.
     */
    public function auditable(): MorphTo
    {
        return $this->morphTo();
    }
}
