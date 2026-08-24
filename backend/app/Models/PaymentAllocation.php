<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\PaymentAllocationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Bir ödemenin hangi kayda ne kadar sayıldığı (Faz 7 / Adım 4).
 *
 * HEDEF POLİMORFİK DEĞİL: `finance_entry_id` adlandırılmış bir FK'dır.
 * Morph olsaydı hedefe FK konamaz ve silinmiş bir hedef, "ne kadarı
 * tahsil edildi" hesabını sessizce bozardı.
 *
 * Invoice geldiğinde ikinci bir nullable FK (`invoice_id`) eklenecek ve
 * veritabanı kısıtı "tam olarak biri dolu" hâline gelecek. Bu sınıfın
 * yapısı o genişlemeyle çelişmiyor — hedef okuma tek bir metotta
 * toplandı.
 *
 * KENDİ BAŞINA BİR VARLIK DEĞİLDİR: ödemenin bir özelliğidir, yalnızca
 * ödemeyle birlikte yazılır ve yalnızca ödemenin izinde görünür. Bu
 * yüzden kendi audit olayı YOKTUR.
 */
class PaymentAllocation extends Model
{
    /** @use HasFactory<PaymentAllocationFactory> */
    use BelongsToCompany, HasFactory;

    /**
     * company_id ve payment_id bilinçli olarak DIŞARIDA: ikisi de
     * sistemin kurduğu bağlardır, gövdeden gelmezler.
     *
     * @var list<string>
     */
    protected $fillable = [
        'finance_entry_id',
        'amount_minor',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'amount_minor' => 'integer',
        ];
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function financeEntry(): BelongsTo
    {
        return $this->belongsTo(FinanceEntry::class);
    }
}
