<?php

namespace App\Http\Requests\Api\V1;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Yeni şirket üyesi gövdesinin doğrulanması.
 *
 * YETKİ NEDEN BURADA:
 * FormRequest doğrulaması controller gövdesinden ÖNCE çalışır. Yetki
 * kontrolü yalnızca controller'da olsaydı, üye yönetemeyen bir kullanıcı
 * 403 yerine 422 alır ve yanıttan hangi alanların beklendiğini öğrenirdi.
 * Yetkisiz istek hiçbir şey öğrenmemeli. Controller'daki authorize()
 * çağrısı yine de duruyor — savunma derinliği (§21).
 */
class MemberStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('create', User::class);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],

            // unique: bu uç yalnızca YENİ kullanıcı oluşturur. Zaten kayıtlı
            // bir e-posta 422 döner; mevcut kullanıcıyı şirkete bağlamak
            // invitation sisteminin işidir ve bu fazın dışındadır (§24).
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],

            // min:8 — parola User modelindeki 'hashed' cast'i ile yazılır,
            // düz metin veritabanına hiç ulaşmaz.
            'password' => ['required', 'string', 'min:8', 'max:255'],

            // Geçerli rol kümesi Role enum'ından gelir; burada elle yazılmış
            // bir string listesi olsaydı enum'a rol eklendiğinde burası
            // sessizce eskirdi.
            'role' => ['required', Rule::enum(Role::class)],
        ];
    }
}
