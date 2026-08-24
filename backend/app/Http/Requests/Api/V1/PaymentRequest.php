<?php

namespace App\Http\Requests\Api\V1;

use App\Enums\Currency;
use App\Services\CompanyContext;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Ödeme gövdesi — oluşturma ve güncelleme için AYNI kurallar.
 *
 * UÇ PUT'TUR: gövde ödemenin TAM hâlini taşır ve dağıtım listesi
 * eskisinin TAMAMEN yerine geçer. Kısmi olsaydı "dağıtımı sil" ile
 * "dağıtıma dokunma" ayrımı anlatılamazdı.
 *
 * DAĞITIMLAR AYRI BİR UÇTAN YÖNETİLMEZ: "toplam dağıtım ödemeyi aşamaz"
 * kuralı iki isteğe yayılsaydı, arada geçersiz bir ara durum oluşurdu.
 *
 * TENANT SINIRI DOĞRULAMADA ÇİZİLİR. Hem müşteri hem de her dağıtım
 * hedefi aktif şirkete ait olmalı; olmayan bir id 422 alır. 404 dönmek
 * ucun kendisini bulunamaz gösterirdi, 403 ise o kaydın VAR OLDUĞUNU
 * doğrulardı.
 *
 * TOPLAM KONTROLÜ BURADA DA VAR, SERVİSTE DE. Buradaki, kullanıcıya
 * anlaşılır bir 422 vermek için; servistekiyse eşzamanlılığa karşı
 * gerçek güvence (transaction + satır kilidi). İkisi aynı kuralı iki
 * farklı amaçla uygular.
 */
class PaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $companyId = app(CompanyContext::class)->id();

        return [
            'financial_date' => ['required', 'date_format:Y-m-d'],

            // TAM SAYI KURUŞ. Ondalık bir birim karışıklığıdır ve
            // sessizce yuvarlanmamalıdır.
            'amount_minor' => ['required', 'integer', 'min:0'],

            'currency' => ['required', 'string', Rule::in([Currency::mvpDefault()->value])],

            'method' => ['nullable', 'string', 'max:50'],
            'note' => ['nullable', 'string', 'max:1000'],

            'customer_id' => ['nullable', 'integer', Rule::exists('customers', 'id')->where(
                fn ($query) => $query->where('company_id', $companyId)
            )],

            'allocations' => ['sometimes', 'array'],
            'allocations.*.amount_minor' => ['required', 'integer', 'min:1'],

            // Hedef aktif şirketin finans kaydı olmalı.
            'allocations.*.finance_entry_id' => [
                'required',
                'integer',
                Rule::exists('finance_entries', 'id')->where(
                    fn ($query) => $query->where('company_id', $companyId)
                ),
            ],

            // Türetilen alanlar dayatılamaz (§A5). Sessizce yok saymak
            // kullanıcının "gönderdiğim değer uygulandı" sanmasına yol
            // açardı — FinanceEntry'deki kararla aynı.
            'allocated_minor' => ['prohibited'],
            'remaining_minor' => ['prohibited'],

            // Tenant sahipliği gövdeden gelemez (§9).
            'company_id' => ['prohibited'],

            // İptal kendi ucundan yapılır.
            'voided_at' => ['prohibited'],
            'void_reason' => ['prohibited'],
        ];
    }

    /**
     * DEĞİŞMEZ KURAL: dağıtım toplamı ödeme tutarını aşamaz.
     *
     * Aşabilseydi olmayan para dağıtılmış olurdu ve "ne kadarı tahsil
     * edildi" hesabı gerçeğin üstünde bir sonuç verirdi.
     *
     * Hata `allocations` alanına yazılır, tek tek satırlara değil: kural
     * satırların TOPLAMINA aittir ve hangi satırın "fazla" olduğu
     * söylenemez.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $amount = (int) $this->input('amount_minor');
            $allocated = $this->allocatedTotal();

            if ($allocated > $amount) {
                $validator->errors()->add(
                    'allocations',
                    'Dağıtım toplamı ödeme tutarını aşamaz.'
                );
            }
        });
    }

    /**
     * Gövdedeki dağıtımların toplamı — tam sayı aritmetiği.
     */
    public function allocatedTotal(): int
    {
        $total = 0;

        foreach ((array) $this->input('allocations', []) as $allocation) {
            $total += (int) ($allocation['amount_minor'] ?? 0);
        }

        return $total;
    }
}
