<?php

namespace App\Models\Concerns;

use App\Exceptions\CrossTenantAccessException;
use App\Models\Scopes\CompanyScope;
use App\Services\CompanyContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Bir şirkete ait (tenant-scoped) modellerin ortak davranışı.
 *
 * Üç garanti sağlar:
 *   1. OKUMA  — her sorgu aktif şirkete filtrelenir (CompanyScope).
 *   2. YAZMA  — company_id boşsa aktif şirketten doldurulur.
 *   3. SINIR  — aktif şirket dışına yazma ve kayıt taşıma engellenir.
 *
 * Modelin `company_id` sütununa sahip olması beklenir.
 */
trait BelongsToCompany
{
    public static function bootBelongsToCompany(): void
    {
        static::addGlobalScope(new CompanyScope());

        static::saving(function (Model $model): void {
            self::guardTenantBoundary($model);
        });
    }

    /**
     * Tenant scope'unu bilinçli olarak devre dışı bırakır.
     *
     * Yalnızca sistem seviyesi işlemler içindir: seeder, migration yardımcıları,
     * bakım komutları. Kullanıcı isteğinden doğan hiçbir kod yolu bunu
     * çağırmamalıdır.
     *
     * $reason zorunludur: bypass'ın gerekçesi kodun içinde yazılı kalsın ve
     * `grep withoutTenantScope` denetimi anlamlı olsun diye.
     */
    public static function withoutTenantScope(string $reason): Builder
    {
        return static::query()->withoutGlobalScope(CompanyScope::class);
    }

    /**
     * Yazma işlemlerinde tenant sınırını korur.
     */
    private static function guardTenantBoundary(Model $model): void
    {
        // 1) Mevcut bir kaydın sahipliği asla değiştirilemez — context olsun
        //    ya da olmasın. Tenant sahipliği taşınabilir bir özellik değildir.
        if ($model->exists && $model->isDirty('company_id')) {
            throw CrossTenantAccessException::forTransfer(
                $model::class,
                (int) $model->getOriginal('company_id'),
                $model->company_id !== null ? (int) $model->company_id : null,
            );
        }

        $context = app(CompanyContext::class);

        if (! $context->has()) {
            // Sistem seviyesi işlem (seeder, konsol). company_id çağıran
            // tarafından açıkça verilmiş olmalıdır; veritabanındaki NOT NULL
            // kısıtı bunu ayrıca zorlar.
            return;
        }

        // 2) company_id verilmemişse aktif şirketten doldurulur.
        if ($model->company_id === null) {
            $model->company_id = $context->id();

            return;
        }

        // 3) Aktif şirket dışına yazma girişimi reddedilir.
        if ((int) $model->company_id !== $context->id()) {
            throw CrossTenantAccessException::forWrite(
                $model::class,
                $context->id(),
                (int) $model->company_id,
            );
        }
    }
}
