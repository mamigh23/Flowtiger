<?php

namespace App\Http\Requests\Api\V1;

use App\Enums\Currency;
use App\Enums\FinanceDirection;
use App\Models\Customer;
use App\Services\CompanyContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Finans kaydı gövdesi — oluşturma ve güncelleme için AYNI kurallar.
 *
 * UÇ PUT'TUR, PATCH DEĞİL. Parasal alanlar birbirine bağlıdır: yalnızca
 * tutarı değiştiren kısmi bir istek, eski KDV ve brüt değerlerini yerinde
 * bırakır ve kaydı kendi içinde tutarsız yapardı. Gövde kaydın TAM hâlini
 * taşır; üçlü her seferinde yeniden hesaplanır.
 *
 * Mali kimlik uçlarındaki karar bunun TERSİYDİ (PATCH) — çünkü orada
 * alanlar birbirinden bağımsızdı. Kural "hep PATCH" ya da "hep PUT" değil;
 * alanlar birbirine bağlıysa birlikte yazılır.
 *
 * İSTEMCİ TUTARI, SUNUCU HESABI VERİR:
 *   amount_minor + amount_basis  → istemci
 *   net/vat/gross                → VatCalculator
 *
 * HESAPLANAN ALANLAR `prohibited`:
 * net_minor, vat_minor, gross_minor gönderilirse 422 döner — sessizce
 * yok sayılmaz. Aradaki fark önemli: sessiz yok sayma, kullanıcının
 * "gönderdiğim değer uygulandı" sanmasına ve yanlış bir toplamı fark
 * etmeden kabul etmesine yol açar.
 *
 * ProfileUpdateRequest'te bilinçli olarak TERS karar verilmişti
 * (`prohibited` yok, çünkü 422 "hangi alan adları tanınıyor" bilgisini
 * sızdırırdı). O gerekçe burada geçmiyor: finans alan adları bir güvenlik
 * ad uzayı değil ve sessiz yok sayma burada doğrudan bir hesap hatasına
 * dönüşüyor.
 */
class FinanceEntryRequest extends FormRequest
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
        return [
            'direction' => ['required', Rule::in(FinanceDirection::values())],

            // Takvim günü; saat taşımaz (§A8).
            'financial_date' => ['required', 'date_format:Y-m-d'],

            'amount_basis' => ['required', Rule::in(['net', 'gross'])],

            // TAM SAYI KURUŞ. Ondalık gönderilmesi bir birim
            // karışıklığıdır ve sessizce yuvarlanmamalıdır.
            'amount_minor' => ['required', 'integer', 'min:0'],

            // null → kayıt KDV bilgisi taşımıyor
            // 0    → KDV var, oranı sıfır
            'vat_rate_bp' => ['present', 'nullable', 'integer', 'min:0'],

            'currency' => ['required', 'string', Rule::in([Currency::mvpDefault()->value])],

            'customer_id' => ['nullable', 'integer', Rule::exists('customers', 'id')->where(
                // TENANT SINIRI DOĞRULAMADA ÇİZİLİR.
                // Aktif şirkete ait olmayan bir müşteri id'si 422 alır.
                // 404 dönmek ucun kendisini bulunamaz gösterirdi; 403 ise
                // o müşterinin VAR OLDUĞUNU doğrulardı.
                fn ($query) => $query->where('company_id', app(CompanyContext::class)->id())
            )],

            'category' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:1000'],

            // Sunucunun hesapladığı alanlar dayatılamaz.
            'net_minor' => ['prohibited'],
            'vat_minor' => ['prohibited'],
            'gross_minor' => ['prohibited'],

            // Tenant sahipliği gövdeden gelemez (Anayasa §9).
            'company_id' => ['prohibited'],

            // İptal kendi ucundan yapılır.
            'voided_at' => ['prohibited'],
            'void_reason' => ['prohibited'],
        ];
    }

    /**
     * Doğrulanmış müşteri; verilmemişse null.
     *
     * Model'e yazmadan önce tipli okunur — controller'ın array indekslemesi
     * ile uğraşmaması için.
     */
    public function customer(): ?Customer
    {
        $id = $this->validated('customer_id');

        return $id === null ? null : Customer::query()->find($id);
    }
}
