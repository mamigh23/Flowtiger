<?php

namespace App\Models;

use App\Enums\FinanceDirection;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\FinanceEntryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Bir gelir ya da gider kaydı (Faz 7 / Adım 3).
 *
 * TEK TABLO, İKİ YÖN: `direction` gelir ile gideri ayırır. Alanların
 * neredeyse tamamı ortak ve her rapor ikisini birlikte istiyor.
 *
 * FİZİKSEL OLARAK SİLİNMEZ. `voided_at` işaretlenir; kayıt yerinde durur.
 * Silinmiş bir gelir kaydı geçmiş bir dönemin toplamını sessizce
 * değiştirirdi.
 */
class FinanceEntry extends Model
{
    /** @use HasFactory<FinanceEntryFactory> */
    use BelongsToCompany, HasFactory;

    /**
     * HESAPLANAN VE SAHİPLİK ALANLARI BİLİNÇLİ OLARAK DIŞARIDA.
     *
     * company_id  : tenant sahipliğidir; aktif context'ten gelir (§9).
     * net_minor   : amount_minor + amount_basis'ten türetilir.
     * vat_minor   : VatCalculator üretir.
     * gross_minor : VatCalculator üretir.
     * voided_at   : yalnızca iptal ucundan yazılır.
     * void_reason : aynı şekilde.
     *
     * Hesaplanan alanlar fillable olsaydı, gövdesine `gross_minor` koyan
     * bir istek belgenin toplamını uydurabilirdi (playbook §10.2).
     *
     * @var list<string>
     */
    protected $fillable = [
        'customer_id',
        'direction',
        'financial_date',
        'category',
        'note',
        'amount_basis',
        'vat_rate_bp',
        'currency',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'direction' => FinanceDirection::class,
            'financial_date' => 'date',

            // Postgres `bigint`i PDO string döndürebilir; cast olmadan
            // ilk aritmetikte sessizce float'a döner.
            'net_minor' => 'integer',
            'vat_minor' => 'integer',
            'gross_minor' => 'integer',
            'vat_rate_bp' => 'integer',

            'voided_at' => 'datetime',
        ];
    }

    /**
     * Kayıt iptal edilmiş mi?
     *
     * Durum SAKLANMAZ, damgadan OKUNUR — InvitationStatus'taki kararla
     * aynı ilke: iki kaynaktan türeyen bir gerçek, er ya da geç ikiye
     * ayrılır.
     */
    public function isVoided(): bool
    {
        return $this->voided_at !== null;
    }

    /**
     * Bu kayıt KDV özetine girer mi?
     *
     * Sıfır oran GİRER (KDV'lidir, oranı sıfırdır).
     * Null oran GİRMEZ (kayıt KDV bilgisi taşımıyor).
     */
    public function isVatApplicable(): bool
    {
        return $this->vat_rate_bp !== null;
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
