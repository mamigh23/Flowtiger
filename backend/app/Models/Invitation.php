<?php

namespace App\Models;

use App\Enums\InvitationStatus;
use App\Enums\Role;
use Database\Factories\InvitationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Bir şirkete katılım daveti.
 *
 * NEDEN GLOBAL TENANT SCOPE YOK:
 *
 * Davet, tenant sınırının İKİ TARAFINDA birden yaşar. Liste ve iptal
 * uçları aktif şirket bağlamındadır; ama KABUL uçu, henüz hiçbir şirkete
 * üye olmayan — çoğu zaman hiç hesabı bile olmayan — bir kişi tarafından,
 * company context OLMADAN çağrılır. CompanyScope o isteği fail-closed
 * reddederdi ve davet sistemi hiç çalışmazdı.
 *
 * Bu yüzden Faz 4'te User için verilen kararın aynısı uygulanır: model
 * global scope'a SOKULMAZ, tenant sınırı servis katmanında açıkça çizilir
 * (InvitationService::findForCompanyOrFail → 404). Böylece
 * withoutTenantScope() gibi bir kaçış kapısına da hiç ihtiyaç olmaz —
 * §31'in yasağı yapısal olarak sağlanır.
 *
 * Modele ait TÜM sorgular InvitationService üzerinden geçmelidir; şirket
 * filtresi orada, tek bir yerde yaşar.
 */
class Invitation extends Model
{
    /** @use HasFactory<InvitationFactory> */
    use HasFactory;

    /**
     * token_hash bilinçli olarak fillable DEĞİLDİR: token üretimi
     * sistemin işidir ve yalnızca InvitationService tarafından, açık
     * atama ile yazılır. Aynı gerekçe Faz 1'de Customer::$customer_no
     * için de geçerliydi.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'invited_by',
        'email',
        'role',
        'expires_at',
        'accepted_at',
        'revoked_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => Role::class,
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    /**
     * Davetin o anki durumu — saklanmaz, zaman damgalarından hesaplanır.
     */
    public function status(): InvitationStatus
    {
        return InvitationStatus::for($this);
    }

    public function isUsable(): bool
    {
        return $this->status()->isUsable();
    }
}
