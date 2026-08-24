<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\PaymentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Bir tahsilat ya da ödeme (Faz 7 / Adım 4).
 *
 * HEDEFİNE DOĞRUDAN BAĞLANMAZ: `finance_entry_id` gibi bir sütun yoktur.
 * Bağlantı PaymentAllocation üzerinden kurulur — böylece hedefsiz avans,
 * bir ödemenin iki hedefe bölünmesi ve bir hedefin iki ödemeyle
 * kapatılması mümkün olur.
 *
 * SİLİNMEZ, İPTAL EDİLİR. İptal edilmiş ödemenin dağıtımları YERİNDE
 * DURUR: "bu para neye sayılmıştı" sorusu iptalden sonra da
 * cevaplanabilmeli. Raporlarda sayılmaması iptal işaretinden gelir,
 * satırların yok olmasından değil.
 */
class Payment extends Model
{
    /** @use HasFactory<PaymentFactory> */
    use BelongsToCompany, HasFactory;

    /**
     * company_id ve iptal alanları bilinçli olarak DIŞARIDA.
     *
     * company_id : tenant sahipliğidir; aktif context'ten gelir (§9).
     * voided_at  : yalnızca iptal ucundan yazılır.
     * void_reason: aynı şekilde.
     *
     * @var list<string>
     */
    protected $fillable = [
        'customer_id',
        'financial_date',
        'amount_minor',
        'currency',
        'method',
        'note',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'financial_date' => 'date',

            // Postgres `bigint`i PDO string döndürebilir; cast olmadan
            // ilk aritmetikte sessizce float'a döner.
            'amount_minor' => 'integer',

            'voided_at' => 'datetime',
        ];
    }

    public function isVoided(): bool
    {
        return $this->voided_at !== null;
    }

    /**
     * Dağıtılmış toplam — SAKLANMAZ, HESAPLANIR (§A5).
     *
     * Tam sayı toplamıdır; hiçbir adımda float'a düşmez.
     */
    public function allocatedMinor(): int
    {
        return (int) $this->allocations->sum('amount_minor');
    }

    /**
     * Henüz bir hedefe sayılmamış tutar.
     */
    public function remainingMinor(): int
    {
        return $this->amount_minor - $this->allocatedMinor();
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class);
    }
}
