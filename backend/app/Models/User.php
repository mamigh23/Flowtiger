<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
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
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

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
