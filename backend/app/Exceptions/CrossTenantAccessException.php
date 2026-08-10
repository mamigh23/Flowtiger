<?php

namespace App\Exceptions;

use App\Models\Company;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;

/**
 * Bir tenant sınırının aşılmaya çalışıldığı her durumda fırlatılır.
 *
 * AuthorizationException'dan türetilmiştir: Laravel bunu HTTP katmanında
 * otomatik olarak 403 Forbidden'a çevirir. Böylece Faz 2'de API açıldığında
 * ayrı bir dönüşüm katmanı gerekmeyecek.
 */
class CrossTenantAccessException extends AuthorizationException
{
    /**
     * Kullanıcı, üyesi olmadığı bir şirkete girmeye çalıştı.
     */
    public static function forCompanyEntry(User $user, Company $company): self
    {
        return new self(
            "Kullanıcı #{$user->getKey()} , Company #{$company->getKey()} şirketinin üyesi değil. ".
            'Company context atanmadı.'
        );
    }

    /**
     * Aktif şirketten farklı bir şirkete yazma girişimi.
     */
    public static function forWrite(string $model, ?int $activeCompanyId, ?int $targetCompanyId): self
    {
        return new self(
            "Aktif şirket #{$activeCompanyId} iken [{$model}] kaydı #{$targetCompanyId} şirketine yazılamaz."
        );
    }

    /**
     * Mevcut bir kaydın başka bir şirkete taşınma girişimi.
     */
    public static function forTransfer(string $model, ?int $from, ?int $to): self
    {
        return new self(
            "[{$model}] kaydı bir şirketten diğerine taşınamaz (#{$from} → #{$to}). ".
            'Tenant sahipliği değiştirilemez.'
        );
    }
}
