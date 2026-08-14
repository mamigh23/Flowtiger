<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Auth\MustVerifyEmail;
use Illuminate\Contracts\Auth\MustVerifyEmail as MustVerifyEmailContract;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
/**
 * MustVerifyEmailContract (Faz 7):
 * Laravel'in yerleşik e-posta doğrulama altyapısını açar — hasVerifiedEmail(),
 * markEmailAsVerified(), sendEmailVerificationNotification() ve imzalı
 * doğrulama bağlantısı üreten VerifyEmail bildirimi. Custom bir doğrulama
 * sistemi YAZILMADI; bu arayüz onun yerine geçer.
 *
 * DİKKAT: bu arayüz tek başına hiçbir ucu kapatmaz. 'verified' middleware'i
 * hiçbir route'a bağlanmamıştır ve bağlanmamalıdır — doğrulanmamış bir
 * kullanıcının kendi profilini yönetememesi için bir sebep yok (§5).
 */
class User extends Authenticatable implements MustVerifyEmailContract
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, MustVerifyEmail, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
   protected function casts(): array
{
    return [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
    ];
}

public function companies(): BelongsToMany
{
    return $this->belongsToMany(Company::class, 'company_users')
        ->withPivot('role')
        ->withTimestamps();
}

    /**
     * Kullanıcının o anda üzerinde çalıştığı şirket.
     *
     * DİKKAT: active_company_id bilinçli olarak #[Fillable] listesinde
     * DEĞİLDİR. Aktif şirket yalnızca CompanySelectionService üzerinden,
     * üyelik doğrulandıktan sonra değiştirilebilir (Anayasa §16).
     *
     * Bu ilişkinin varlığı üyeliğin geçerli olduğunu KANITLAMAZ; üyelik her
     * istekte yeniden doğrulanır (bkz. CompanySelectionService::resolveFor).
     */
    public function activeCompany(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'active_company_id');
    }

    /**
     * Kullanıcı bu şirketin üyesi mi?
     *
     * Tenant isolation'ın en alt seviyedeki doğrulaması. Hem CompanyContext
     * hem CustomerPolicy buraya dayanır, bu yüzden pivot tablosunu her zaman
     * veritabanından sorgular — bellekteki bir ilişkiye güvenmez.
     */
    public function isMemberOf(Company|int $company): bool
    {
        $companyId = $company instanceof Company ? $company->getKey() : $company;

        if ($companyId === null) {
            return false;
        }

        return $this->companies()->whereKey($companyId)->exists();
    }
}
