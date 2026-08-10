<?php

namespace App\Models\Scopes;

use App\Exceptions\TenantContextMissingException;
use App\Services\CompanyContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Tenant'a ait her sorguya aktif şirket filtresini ekler.
 *
 * Bu, "her sorguya elle company_id yazmayı unutursak veri sızar" riskini
 * ortadan kaldırır (FlowTiger Anayasası §3, §8).
 *
 * Context yoksa sorgu BOŞ SONUÇ DÖNMEZ, exception fırlatır. Boş sonuç
 * dönmek güvenlik hatasını "kayıt yok" gibi göstererek gizlerdi.
 */
class CompanyScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $context = app(CompanyContext::class);

        if (! $context->has()) {
            throw TenantContextMissingException::forModel($model::class);
        }

        $builder->where($model->qualifyColumn('company_id'), $context->id());
    }
}
