<?php

namespace App\Http\Resources;

use App\Models\Company;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Şirketin API'ye açılan yüzü — whitelist.
 *
 * Rol yalnızca pivot yüklenmişse döner. company_users.role şu anda bir
 * authorization mekanizması DEĞİLDİR (owner/member yetkileri sonraki fazın
 * konusu); burada sadece bilgilendirme amacıyla taşınır.
 *
 * @mixin Company
 */
class CompanyResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'role' => $this->whenPivotLoaded('company_users', fn () => $this->pivot->role),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
