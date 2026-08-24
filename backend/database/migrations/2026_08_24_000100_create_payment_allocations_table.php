<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Faz 7 / Adım 4 — bir ödemenin hangi kayda sayıldığı.
 *
 * HEDEF POLİMORFİK DEĞİL, ADLANDIRILMIŞ NULLABLE FK.
 *
 * AuditLog'da morph kullanılıyor ama orası APPEND-ONLY bir izdir ve
 * silinmiş kayıtlara bilerek atıfta bulunur — dangling referans orada bir
 * özelliktir. Tahsilat dağıtımı ise CANLI mali veridir: hedefi silinmiş
 * bir dağıtım "ne kadarı tahsil edildi" hesabını sessizce bozardı ve
 * veritabanı bunu engelleyemezdi (morph sütunlarına FK konamaz).
 *
 * Ayrıca AuditLogResource sınıf yolunu bilinçli olarak kısaltıyor ki iç
 * sınıf yapısı API'ye sızmasın; morph tipi tam tersine sınıf adını
 * veritabanına yazardı.
 *
 * INVOICE HENÜZ YOK — `invoice_id` sütunu BURADA AÇILMAZ; olmayan bir
 * tabloya FK verilemez. Invoice geldiğinde:
 *   1. `invoice_id` nullable FK eklenir,
 *   2. aşağıdaki `payment_allocations_target_check` DÜŞÜRÜLÜP yerine
 *      "tam olarak biri dolu" kısıtı konur.
 * Mevcut satırların anlamı değişmez; hepsi zaten finance_entry_id ile
 * etiketli.
 *
 * TOPLAM DAĞITIM ÖDEMEYİ AŞAMAZ kuralı BURADA DEĞİL, serviste
 * uygulanır: satırlar arası bir toplam CHECK ile ifade edilemez. Servis
 * bunu transaction + satır kilidi ile yapar (CustomerService'in
 * customer_no üretimindeki desen).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_allocations', function (Blueprint $table): void {
            $table->id();

            /*
             * TENANT ANAHTARI BURADA DA TAŞINIR.
             *
             * payment üzerinden çıkarılabilir olmasına rağmen ayrıca
             * saklanır: CompanyScope her tabloya KENDİ sütunundan bakar ve
             * dağıtım sorgusu bir join'e bağımlı kalmamalıdır. customers
             * ve finance_entries de aynı sebeple kendi company_id'lerini
             * taşıyor.
             */
            $table->foreignId('company_id')
                ->constrained('companies')
                ->cascadeOnDelete();

            $table->foreignId('payment_id')
                ->constrained('payments')
                ->cascadeOnDelete();

            /*
             * restrictOnDelete — nullOnDelete DEĞİL.
             *
             * Hedefi boşalmış bir dağıtım, "bu para neye sayıldı?"
             * sorusunu cevapsız bırakırdı. Finans kaydı zaten silinmiyor
             * (iptal ediliyor), dolayısıyla bu kısıt normal akışta hiç
             * devreye girmez — yanlışlıkla açılan bir silme yolunu
             * kapatır.
             */
            $table->foreignId('finance_entry_id')
                ->nullable()
                ->constrained('finance_entries')
                ->restrictOnDelete();

            $table->bigInteger('amount_minor');

            $table->timestamps();

            $table->index(['company_id', 'payment_id']);
            $table->index('finance_entry_id');
        });

        /*
         * Sıfır ya da eksi tutarlı dağıtım anlamsızdır: "bu ödemenin
         * hiçbir kısmı şuraya sayıldı" diye bir kayıt yoktur.
         */
        DB::statement('
            ALTER TABLE payment_allocations
            ADD CONSTRAINT payment_allocations_amount_positive_check
            CHECK (amount_minor > 0)
        ');

        /*
         * HER DAĞITIMIN BİR HEDEFİ OLMALI.
         *
         * Bugün tek hedef türü var, bu yüzden kısıt basit. Invoice
         * geldiğinde bu kısıt DÜŞÜRÜLÜP yerine "tam olarak biri dolu"
         * hâline getirilecek — adı o yüzden hedef türüne değil, hedefin
         * KENDİSİNE atıfta bulunuyor.
         */
        DB::statement('
            ALTER TABLE payment_allocations
            ADD CONSTRAINT payment_allocations_target_check
            CHECK (finance_entry_id IS NOT NULL)
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_allocations');
    }
};
