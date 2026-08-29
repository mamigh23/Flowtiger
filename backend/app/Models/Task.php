<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\TaskFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Günün işleri (Task/Planning v1).
 *
 * GÖREVLER ŞİRKET GENELİDİR. Finans owner'a özeldir çünkü şirketin mali
 * görünümüdür; yapılacak iş listesi ise operasyonel çalışmadır. İkinci bir
 * "yalnızca kendi görevlerim" izolasyon katmanı YOK — `assigned_to`
 * filtresi aynı işi yapıyor ve tenant sınırı zaten CompanyScope'ta.
 *
 * DURUM SAKLANMAZ, TÜRETİLİR: `completed_at` null ise açık, doluysa
 * tamamlanmış. Bir `is_completed` sütunu ikinci bir kaynak olurdu ve iki
 * kaynaktan türeyen bir gerçek er ya da geç ikiye ayrılır
 * (InvitationStatus ve `voided_at` ile aynı karar).
 */
class Task extends Model
{
    /** @use HasFactory<TaskFactory> */
    use BelongsToCompany, HasFactory;

    /**
     * SUNUCUNUN YAZDIĞI ALANLAR DIŞARIDA.
     *
     * company_id  : tenant sahipliğidir, aktif context'ten gelir (§9)
     * created_by  : oturumdaki kullanıcıdır; başkasının adına görev
     *               eklenemez
     * completed_at: yalnızca complete/reopen ucundan, sunucu saatiyle
     *               yazılır — istemci bir işin NE ZAMAN bitirildiğini
     *               seçemez
     *
     * @var list<string>
     */
    protected $fillable = [
        'title',
        'note',
        'scheduled_date',
        'scheduled_time',
        'assigned_to',
        'customer_id',
    ];

    /**
     * `scheduled_time` BİLİNÇLİ OLARAK CAST EDİLMEZ.
     *
     * Postgres TIME sütunu "09:00:00" döndürür. Onu Carbon'a çevirmek,
     * saatin yanına bugünün tarihini iliştirir ve ortaya gerçekte olmayan
     * bir "an" çıkar — oysa bu alan bir gün içindeki saattir, bir zaman
     * noktası değil. Biçimlendirme Resource'un işi.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'scheduled_date' => 'date',
            'completed_at' => 'datetime',
        ];
    }

    /** Durum tek kaynaktan okunur. */
    public function isCompleted(): bool
    {
        return $this->completed_at !== null;
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }
}
