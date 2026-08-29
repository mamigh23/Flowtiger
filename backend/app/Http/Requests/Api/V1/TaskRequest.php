<?php

namespace App\Http\Requests\Api\V1;

use App\Services\CompanyContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Görev gövdesi — oluşturma ve güncelleme için AYNI kurallar.
 *
 * UÇ PUT'TUR, PATCH DEĞİL: gövde görevin TAM hâlini taşır. Kısmi
 * güncelleme "saati sil" ile "saate dokunma" ayrımını anlatamazdı.
 *
 * SUNUCUNUN YAZDIĞI ALANLAR `prohibited`:
 *   company_id   → tenant sahipliği aktif context'ten gelir (§9)
 *   created_by   → oturumdaki kullanıcı; başkasının adına görev eklenemez
 *   completed_at → yalnızca complete ucundan, sunucu saatiyle
 *   is_completed → saklanan bir alan değil, türetilen bir sonuç
 *
 * Sessizce yok saymak yerine 422: kullanıcı gönderdiği değerin
 * uygulandığını sanmamalı (FinanceEntryRequest'teki kararla aynı).
 *
 * TENANT SINIRI DOĞRULAMADA ÇİZİLİR. Hem müşteri hem atanan kişi aktif
 * şirkete ait olmalı; olmayan bir id 422 alır. 404 dönmek ucun kendisini
 * bulunamaz gösterirdi, 403 ise o kaydın VAR OLDUĞUNU doğrulardı.
 */
class TaskRequest extends FormRequest
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
            /*
             * Boşluktan ibaret başlık `required` ile elenir: TrimStrings
             * global middleware'i "   " değerini "" yapar. Veritabanındaki
             * CHECK kısıtı bunun ikinci savunması.
             */
            'title' => ['required', 'string', 'max:200'],

            'note' => ['nullable', 'string', 'max:1000'],

            // Takvim günü; saat taşımaz (§A8).
            'scheduled_date' => ['required', 'date_format:Y-m-d'],

            /*
             * `present` + `nullable`: alan gövdede BULUNMALI ama boş
             * olabilir. PUT tam değiştirme olduğu için "gönderilmedi" ile
             * "saati kaldır" ayrımı gövdenin şekline bırakılamaz.
             *
             * Biçim H:i — saniye kabul edilmez. Bir randevu saatinde
             * saniyenin anlamı yok ve iki farklı biçimin dolaşımda olması
             * karşılaştırmayı bozar.
             */
            'scheduled_time' => ['present', 'nullable', 'date_format:H:i'],

            'customer_id' => ['nullable', 'integer', Rule::exists('customers', 'id')->where(
                fn ($query) => $query->where('company_id', $companyId)
            )],

            /*
             * Atanan kişi ŞİRKETİN ÜYESİ olmalı.
             *
             * Aksi hâlde bir görev, o şirketi hiç görmeyen birine
             * atanabilir ve kimse onu tamamlayamazdı. Üyelik pivot
             * tablodan doğrulanır — kullanıcı tablosundan değil.
             */
            'assigned_to' => ['nullable', 'integer', Rule::exists('company_users', 'user_id')->where(
                fn ($query) => $query->where('company_id', $companyId)
            )],

            // Sunucunun yazdığı alanlar dayatılamaz.
            'company_id' => ['prohibited'],
            'created_by' => ['prohibited'],
            'completed_at' => ['prohibited'],
            'is_completed' => ['prohibited'],
        ];
    }
}
