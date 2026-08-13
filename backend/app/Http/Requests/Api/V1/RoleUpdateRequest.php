<?php

namespace App\Http\Requests\Api\V1;

use App\Enums\Role;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Rol değişikliği gövdesinin doğrulanması.
 *
 * Tek alanlı bir istek için ayrı bir FormRequest fazla görünebilir; değil.
 * Rol değişimi sistemdeki en tehlikeli tek alanlı işlemdir — bir üyeye
 * owner vermek, şirketin tüm kontrolünü devretmektir. Ayrı sınıf, ayrı
 * yetki kontrolü ve ayrı uç, bu işlemin kazara başka bir güncellemenin
 * içine karışmasını imkânsız kılar (§11).
 *
 * Geçersiz rol 422 döner; enum dışında hiçbir değer kabul edilmez.
 */
class RoleUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('changeRole', $this->route('user'));
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'role' => ['required', Rule::enum(Role::class)],
        ];
    }
}
