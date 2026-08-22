<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Müşterinin fatura kimliği — KISMİ güncelleme gövdesi.
 *
 * UÇ PATCH'TİR. CompanyBillingRequest ile aynı üç hâl geçerlidir:
 *   alan yok → dokunma · alan null → temizle · alan "  " → temizle
 *
 * `name` VE `phone` BURADA TANINMAZ ve tanınmamalıdır. İkisi de mevcut
 * PUT /customers/{customer} ucunun konusudur. Burada da tanınsalardı iki
 * uç aynı alanı yazabilir hâle gelir ve "hangisi kazandı?" sorusu
 * doğardı — rol değişiminin PUT /members/{user} gövdesinden ayrı
 * tutulmasıyla aynı gerekçe.
 */
class CustomerBillingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $normalised = [];

        foreach (self::TRIMMED_FIELDS as $field) {
            if (! $this->has($field) || ! is_string($this->input($field))) {
                continue;
            }

            $trimmed = trim($this->input($field));

            $normalised[$field] = match (true) {
                $trimmed === '' => null,
                $field === 'country' => strtoupper($trimmed),
                default => $trimmed,
            };
        }

        if ($normalised !== []) {
            $this->merge($normalised);
        }
    }

    private const TRIMMED_FIELDS = [
        'billing_email',
        'tax_number',
        'tax_office',
        'billing_address',
        'country',
    ];

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            // Faturanın gideceği adres. Kullanıcının giriş e-postasıyla
            // aynı olmak zorunda değildir; müşterinin sistemde hesabı da
            // yoktur. Bu yüzden users tablosuna karşı unique DEĞİLDİR.
            'billing_email' => ['sometimes', 'nullable', 'string', 'email', 'max:255'],

            'tax_number' => ['sometimes', 'nullable', 'string', 'max:32'],
            'tax_office' => ['sometimes', 'nullable', 'string', 'max:255'],
            'billing_address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'country' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
        ];
    }
}
