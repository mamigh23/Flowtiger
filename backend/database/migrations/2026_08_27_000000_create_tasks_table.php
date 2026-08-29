<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Task/Planning v1 — günün işleri.
 *
 * PLANLANAN GÜN BİR TAKVİM GÜNÜDÜR, TAMAMLANMA BİR ANDIR.
 * `scheduled_date` DATE, `completed_at` TIMESTAMP. İkisini aynı tipte
 * saklamak saat dilimi sınırında görevin bir gün kaymasına yol açardı —
 * `financial_date` için verilen kararla aynı (§A8).
 *
 * SAAT AYRI VE OPSİYONEL BİR SÜTUNDUR. Tarihle birleştirilseydi, saati
 * olmayan bir görev için uydurma bir saat (00:00) yazmak gerekirdi ve o
 * saat listede gerçek bir randevu gibi görünürdü.
 *
 * DURUM SÜTUNU YOKTUR. `is_completed` diye bir alan bulunmaz; durum
 * `completed_at`ten türetilir. İki kaynaktan türeyen bir gerçek er ya da
 * geç ikiye ayrılır — InvitationStatus ve `voided_at` ile aynı karar.
 *
 * GÖREV SİLİNEBİLİR, VOID EDİLMEZ. Finans kaydı iptal ediliyor çünkü
 * silinmesi geçmiş bir dönemin toplamını sessizce değiştirir. Yapılacak
 * bir işin böyle bir özelliği yok; yanlış yazılmış bir görevi kalıcı
 * olarak taşımak kullanıcıya hizmet etmez.
 *
 * v1 KAPSAMI DIŞINDA: `priority`, `recurrence_rule`, `source`,
 * `parent_task_id`. "İleride lazım olur" diye eklenen bir sütun,
 * kullanılmadığı sürece yalnızca her sorguyu ve her formu bir tık daha
 * karmaşık yapar (§3.6 YAGNI).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('company_id')
                ->constrained('companies')
                ->cascadeOnDelete();

            $table->string('title', 200);
            $table->text('note')->nullable();

            // Takvim günü — saat taşımaz.
            $table->date('scheduled_date');

            // Saatsiz görev meşrudur: her iş bir randevu değildir.
            $table->time('scheduled_time')->nullable();

            /*
             * Tamamlanma ANI. Sunucu yazar; istemci bir işin ne zaman
             * bitirildiğini seçemez.
             */
            $table->timestamp('completed_at')->nullable();

            /*
             * "Bunu kim planladı?" sorusu cevapsız kalamaz.
             *
             * restrictOnDelete — cascade DEĞİL: kullanıcı silinince
             * görevlerinin yok olması, ekibin gününü habersiz boşaltırdı.
             * nullOnDelete de değil: sütun NOT NULL, çünkü sahipsiz bir
             * görev listenin kime ait olduğunu belirsizleştirir.
             */
            $table->foreignId('created_by')
                ->constrained('users')
                ->restrictOnDelete();

            /*
             * Atama OPSİYONELDİR: bir iş kimseye atanmadan da planlanabilir.
             *
             * nullOnDelete: atanan kişi silinince iş ortadan kalkmaz,
             * yalnızca sahipsiz kalır ve yeniden atanabilir.
             */
            $table->foreignId('assigned_to')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            /*
             * Müşteri OPSİYONELDİR ve nullOnDelete'tir: "Ahmet'i ara"
             * görevi, Ahmet kayıttan çıkarılsa bile hâlâ yapılacak bir
             * iştir.
             */
            $table->foreignId('customer_id')
                ->nullable()
                ->constrained('customers')
                ->nullOnDelete();

            $table->timestamps();

            // Liste ve /today sorgusunun eriştiği sütunlar.
            $table->index(['company_id', 'scheduled_date', 'id']);

            // "Bana atanan işler" sorgusu için.
            $table->index(['company_id', 'assigned_to']);
        });

        /*
         * BAŞLIK BOŞLUKTAN İBARET OLAMAZ.
         *
         * FormRequest bunu zaten yakalıyor (TrimStrings + required). Kısıt
         * burada da duruyor çünkü başlıksız bir görev listede görünmez bir
         * satır olur: kullanıcı onu ne okuyabilir ne de silebilir.
         * Uygulama katmanı bir gün yanlış yazsa bile veritabanı bozuk
         * satırı kabul etmemeli (company_users.role CHECK'iyle aynı
         * yaklaşım).
         */
        DB::statement("
            ALTER TABLE tasks
            ADD CONSTRAINT tasks_title_not_blank_check
            CHECK (char_length(btrim(title)) > 0)
        ");
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
