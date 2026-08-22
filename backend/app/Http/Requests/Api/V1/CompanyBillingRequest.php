<?php

namespace App\Http\Requests\Api\V1;

use App\Enums\Currency;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Şirketin mali kimliği — KISMİ güncelleme gövdesi.
 *
 * UÇ PATCH'TİR, PUT DEĞİL. Gövde kaydın tamamını değil, DEĞİŞTİRİLECEK
 * ALANLARI tanımlar. Bu yüzden her kural `sometimes` ile başlar:
 * gönderilmeyen alan doğrulanmaz, `validated()` içine girmez ve servis
 * ona hiç dokunmaz.
 *
 * Bu ayrım Customer'daki PUT ucunun tersidir ve bilinçlidir: orada
 * "gönderilmeyen phone null olarak yazılır" çünkü gövde kaydın tam
 * hâlini tanımlar. Burada yalnızca vergi dairesini düzeltmek isteyen bir
 * istek, göndermediği vergi numarasını silmemelidir.
 *
 * ÜÇ AYRI NİYET, ÜÇ AYRI GÖVDE HÂLİ:
 *   alan yok        → dokunma
 *   alan null       → temizle
 *   alan "  "       → temizle (null'a normalize edilir)
 *
 * `name` BURADA TANINMAZ. Şirket adı mali kimlik değildir; tanınsaydı
 * "yalnızca mali kimlik" sözü ilk günden bozulurdu.
 */
class CompanyBillingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Boş dize null'a normalize edilir.
     *
     * "" ve null ikisi de "değer yok" demektir; ikisini birden saklamak
     * yokluğun iki temsilini yaratır ve her sorgu ikisini de kontrol
     * etmek zorunda kalır. Normalizasyon deseni depoda zaten var
     * (ProfileUpdateRequest e-postayı doğrulamadan ÖNCE normalize eder).
     *
     * Sıra kritik: normalize edilmeden doğrulansaydı "  " değeri
     * `string` kuralını geçer ve veritabanına boşluk olarak yazılırdı.
     */
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
                // Ülke kodu daima büyük harf: 'tr' ile 'TR' aynı ülkedir
                // ve iki farklı temsille saklanmamalıdır.
                $field === 'country' => strtoupper($trimmed),
                default => $trimmed,
            };
        }

        if ($normalised !== []) {
            $this->merge($normalised);
        }
    }

    /**
     * Baştaki/sondaki boşluğu temizlenen alanlar.
     *
     * timezone ve default_currency BURADA YOK: ikisi de NOT NULL'dur ve
     * boş dize gönderilmesi bir temizleme niyeti değil, hatadır —
     * doğrulamaya takılıp 422 dönmelidir.
     */
    private const TRIMMED_FIELDS = [
        'legal_name',
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
            'legal_name' => ['sometimes', 'nullable', 'string', 'max:255'],

            // VKN 10 hane, TCKN 11 hane; sütun 32 karaktere kadar
            // taşıyabiliyor. Uzunluk/format doğrulaması FATURA KESİMİNDE
            // yapılacak iş kuralıdır — burada kimlik henüz taslak
            // hâlindedir ve yarım girilmiş olabilir.
            'tax_number' => ['sometimes', 'nullable', 'string', 'max:32'],

            'tax_office' => ['sometimes', 'nullable', 'string', 'max:255'],
            'billing_address' => ['sometimes', 'nullable', 'string', 'max:1000'],

            // ISO 3166-1 alpha-2.
            'country' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],

            // NOT NULL sütunlar: temizlenemezler, yalnızca değiştirilebilirler.
            'timezone' => ['sometimes', 'string', 'timezone'],

            // MVP YALNIZCA TRY (Finance Foundation §A2). Currency enum'ı
            // ikinci bir üye taşısa da kalıcı katmanda tek para birimi
            // vardır; çoklu para birimi ayrı bir karardır.
            'default_currency' => [
                'sometimes',
                'string',
                Rule::in([Currency::mvpDefault()->value]),
            ],
        ];
    }
}
