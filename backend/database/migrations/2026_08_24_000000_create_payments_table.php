<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Faz 7 / Adım 4 — ödeme ve tahsilat.
 *
 * ÖDEME HEDEFİNE DOĞRUDAN BAĞLANMAZ. Bu tabloda `finance_entry_id` ya da
 * `invoice_id` YOKTUR ve olmayacak. Doğrudan bir FK üç şeyi imkânsız
 * kılardı:
 *   - hedefsiz (avans) tahsilat
 *   - bir ödemenin iki hedefe bölünmesi
 *   - bir hedefin iki ödemeyle kapatılması
 * Bağlantı `payment_allocations` ara tablosunda kurulur.
 *
 * `allocated_minor` ve `remaining_minor` SÜTUN DEĞİLDİR (§A5). Dağıtım
 * satırlarından hesaplanırlar. Saklanan bir "kalan" sütunu, dağıtım
 * değiştiğinde güncellenmesi unutulan ilk şey olur ve kaynağıyla
 * çelişirdi.
 *
 * SİLME YOK, İPTAL VAR — FinanceEntry ile aynı karar.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('company_id')
                ->constrained('companies')
                ->cascadeOnDelete();

            /*
             * Müşteri OPSİYONELDİR: kaynağı henüz belirlenmemiş bir banka
             * girişi de kaydedilebilmeli.
             *
             * nullOnDelete — cascade DEĞİL: müşterisi silinen bir tahsilat
             * hâlâ gerçekleşmiş bir para hareketidir ve dönem
             * toplamından düşmemelidir.
             */
            $table->foreignId('customer_id')
                ->nullable()
                ->constrained('customers')
                ->nullOnDelete();

            // Muhasebe tarihi bir TAKVİM GÜNÜDÜR, bir an değil (§A8).
            $table->date('financial_date');

            $table->bigInteger('amount_minor');
            $table->char('currency', 3);

            // MVP'de serbest metin — `category` ile aynı gerekçe: ödeme
            // yöntemi taksonomisi uydurulmaz. Komisyon/kesinti fazı
            // geldiğinde enum'a çevrilmesi gerekebilir.
            $table->string('method', 50)->nullable();

            $table->text('note')->nullable();

            $table->timestamp('voided_at')->nullable();
            $table->string('void_reason', 255)->nullable();

            $table->timestamps();

            // Liste sorgusunun sırası: financial_date DESC, id DESC.
            $table->index(['company_id', 'financial_date', 'id']);
        });

        // MVP yalnızca TRY (§A2).
        DB::statement("
            ALTER TABLE payments
            ADD CONSTRAINT payments_currency_check
            CHECK (currency = 'TRY')
        ");

        /*
         * Tutar EKSİ OLAMAZ.
         *
         * Money negatifi TİP olarak kabul eder, bu ALAN etmez (§A1).
         * Eksi bir tahsilat aslında bir iadedir ve kendi kaydını hak
         * eder; aynı sütun iki farklı anlam taşımamalı.
         */
        DB::statement('
            ALTER TABLE payments
            ADD CONSTRAINT payments_amount_non_negative_check
            CHECK (amount_minor >= 0)
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
