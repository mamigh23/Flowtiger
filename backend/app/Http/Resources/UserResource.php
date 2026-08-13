<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Kullanıcının API'ye açılan yüzü.
 *
 * Bilinçli olarak bir WHITELIST'tir: modele yeni bir sütun eklendiğinde
 * (parola sıfırlama token'ı, iki faktör secret'ı, fatura bilgisi...) o alan
 * kendiliğinden dışarı sızmaz — buraya elle eklenmediği sürece görünmez.
 *
 * User modelindeki #[Hidden(['password','remember_token'])] ikinci bir
 * savunma katmanıdır; bu resource ilkidir (Anayasa §21, savunma derinliği).
 *
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'email_verified_at' => $this->email_verified_at?->toIso8601String(),

            // Salt okunur: istemci hangi şirkette olduğunu bilmeli, ama bu
            // alan yalnızca CompanySelectionService üzerinden değişir (§16).
            'active_company_id' => $this->active_company_id !== null
                ? (int) $this->active_company_id
                : null,

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
