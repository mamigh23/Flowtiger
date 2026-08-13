<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Davet kabul gövdesinin doğrulanması.
 *
 * TOKEN GÖVDEDE, URL'DE DEĞİL (§14).
 * URL'ler her yerde loglanır: web sunucusu erişim logları, ters proxy'ler,
 * APM araçları, tarayıcı geçmişi, Referer başlığı. Gövde varsayılan
 * olarak hiçbirine düşmez. Tek kullanımlık bir sır için bu fark
 * belirleyicidir.
 *
 * KOŞULLU ALANLAR:
 * name ve password YALNIZCA giriş yapmamış davetliler içindir — o kişi
 * için bu istek aynı zamanda kayıt formudur.
 *
 * Giriş yapmış kullanıcı için ikisi de PROHIBITED. Bu, §17'nin
 * "mevcut password DEĞİŞTİRİLMEMELİ" kuralının şemaya yazılmış hâlidir:
 * alan kabul edilmiyorsa, yanlışlıkla da olsa işlenemez. Sessizce yok
 * saymak yerine 422 dönmek, istemci geliştiricisine niyetin yanlış
 * olduğunu söyler.
 *
 * Kimlik 'sanctum' guard'ından okunur: bu uçta auth:sanctum middleware'i
 * YOKTUR (hesabı olmayan davetli de gelebilmeli), dolayısıyla varsayılan
 * guard Bearer token'ı görmez.
 */
class InvitationAcceptRequest extends FormRequest
{
    /**
     * Yetki kontrolü yok: bu ucun anahtarı token'ın kendisidir ve
     * doğrulaması InvitationService'te yapılır (§21).
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $isAuthenticated = $this->user('sanctum') !== null;

        return [
            'token' => ['required', 'string'],

            'name' => [
                Rule::requiredIf(! $isAuthenticated),
                Rule::prohibitedIf($isAuthenticated),
                'string',
                'max:255',
            ],

            'password' => [
                Rule::requiredIf(! $isAuthenticated),
                Rule::prohibitedIf($isAuthenticated),
                'string',
                'min:8',
                'max:255',
            ],
        ];
    }
}
