<?php

namespace App\Http\Requests\Api\V1;

use App\Enums\Role;
use App\Models\Invitation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Davet oluşturma gövdesinin doğrulanması.
 *
 * E-POSTA ENUMERATION KORUMASI (§11):
 * Burada `unique:users` ya da `exists:users` GİBİ BİR KURAL YOKTUR ve
 * asla eklenmemelidir. Böyle bir kural, 422 yanıtı üzerinden "bu adres
 * FlowTiger'da kayıtlı mı?" sorusunu herkese açık hâle getirirdi. Adres
 * ister kayıtlı olsun ister olmasın, yanıt aynıdır: 201.
 *
 * Aynı sebeple "bu kişi zaten üye" kontrolü de burada YAPILMAZ — o bilgi
 * de sızıntıdır. Kabul anında ele alınır.
 *
 * Yetki kontrolü burada yapılır ki, davet gönderemeyen biri validation
 * hatalarından uç hakkında bilgi toplayamasın (Faz 4'teki karar).
 */
class InvitationStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('create', Invitation::class);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'role' => ['required', Rule::enum(Role::class)],
        ];
    }
}
