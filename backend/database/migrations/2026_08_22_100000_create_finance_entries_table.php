<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Faz 7 / Adım 3 — finans kaydı.
 *
 * PARASAL ALANLAR `bigint` MINOR UNIT'TİR ve adları `*_minor` ile biter
 * (Finance Foundation §A1). `numeric`/`decimal` bir sütun buraya girerse
 * PHP tarafında string olarak okunur ve üzerindeki her aritmetik sessizce
 * float'a düşer.
 *
 * BÜTÜNLÜK KURALLARI VERİTABANINDA DA DURUR. Uygulama katmanı tek savunma
 * olmamalı — company_users.role için CHECK kısıtı eklenirken verilen
 * kararla aynı. Uygulama bir gün yanlış yazsa bile bozuk satır kabul
 * edilmez:
 *
 *   direction ∈ {in, out}
 *   currency  = 'TRY'            (MVP; §A2)
 *   net_minor   >= 0             (yön `direction`'da taşınır, tutarda değil)
 *   gross_minor >= 0
 *   vat_rate_bp >= 0
 *   net + vat = gross            (parasal değişmez — §A3/§A4)
 *
 * SON KISIT EN ÖNEMLİSİ: net + KDV = brüt kuralı domain katmanında
 * VatCalculator ile kuruluyor, ama veritabanında da yazılı. Böylece
 * hesaplamayı atlayan bir yol (seeder, elle SQL, ileride yazılacak bir
 * import) bozuk bir kayıt bırakamaz.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance_entries', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('company_id')
                ->constrained('companies')
                ->cascadeOnDelete();

            /*
             * Müşteri OPSİYONELDİR: kira gideri hiçbir müşteriye bağlı
             * değildir.
             *
             * nullOnDelete — cascade DEĞİL: müşterisi silinen bir gelir
             * kaydı hâlâ geçerli bir mali kayıttır ve dönem toplamından
             * düşmemelidir. Cascade, geçmiş bir dönemin toplamını geriye
             * dönük değiştirirdi.
             */
            $table->foreignId('customer_id')
                ->nullable()
                ->constrained('customers')
                ->nullOnDelete();

            $table->string('direction', 8);

            // Muhasebe tarihi bir TAKVİM GÜNÜDÜR, bir an değil (§A8).
            // Saat taşısaydı dönem sınırındaki her kayıt tartışmalı olurdu.
            $table->date('financial_date');

            // MVP'de serbest metin. Gruplama kalitesi ileride bir lookup
            // tablosuna bağlanabilir; bugün bir taksonomi uydurmaktansa
            // boş bırakmak dürüst.
            $table->string('category', 100)->nullable();

            $table->text('note')->nullable();

            /*
             * Kullanıcı tutarı NET olarak mı BRÜT olarak mı girdi?
             *
             * Saklanır çünkü açıklanabilirliğin parçasıdır: fişindeki
             * 100,00 TL'yi brüt girdiğini bilen kullanıcı, ekranda
             * gördüğü 83,33 + 16,67'yi doğrulayabilir. Saklanmasaydı bu
             * bilgi ilk yanıttan sonra kaybolurdu.
             */
            $table->string('amount_basis', 8);

            $table->bigInteger('net_minor');

            // null → kayıt KDV bilgisi TAŞIMIYOR
            // 0    → KDV var, oranı sıfır
            // İkisini tek değere indirmek "KDV'siz mi, girilmemiş mi"
            // sorusunu cevapsız bırakırdı (§A4).
            $table->integer('vat_rate_bp')->nullable();

            $table->bigInteger('vat_minor');
            $table->bigInteger('gross_minor');

            $table->char('currency', 3);

            /*
             * İPTAL — SİLME YOK.
             *
             * Silinmiş bir gelir kaydı geçmiş bir dönemin toplamını
             * sessizce değiştirirdi. İptal edilen kayıt yerinde durur,
             * görünür kalır ve sebebi okunabilir.
             *
             * Durum SAKLANMAZ, bu damgadan OKUNUR — InvitationStatus'taki
             * kararla aynı ilke.
             */
            $table->timestamp('voided_at')->nullable();
            $table->string('void_reason', 255)->nullable();

            $table->timestamps();

            // Liste sorgusunun sırası: financial_date DESC, id DESC.
            $table->index(['company_id', 'financial_date', 'id']);
        });

        DB::statement("
            ALTER TABLE finance_entries
            ADD CONSTRAINT finance_entries_direction_check
            CHECK (direction IN ('in', 'out'))
        ");

        // MVP yalnızca TRY. Çoklu para birimine geçiş bu kısıtı kaldırıp
        // dönüşüm alanları eklemekten ibaret olur; geçmiş satırların
        // anlamı zaten etiketli.
        DB::statement("
            ALTER TABLE finance_entries
            ADD CONSTRAINT finance_entries_amount_basis_check
            CHECK (amount_basis IN ('net', 'gross'))
        ");

        DB::statement("
            ALTER TABLE finance_entries
            ADD CONSTRAINT finance_entries_currency_check
            CHECK (currency = 'TRY')
        ");

        DB::statement('
            ALTER TABLE finance_entries
            ADD CONSTRAINT finance_entries_amounts_non_negative_check
            CHECK (net_minor >= 0 AND gross_minor >= 0 AND (vat_rate_bp IS NULL OR vat_rate_bp >= 0))
        ');

        /*
         * PARASAL DEĞİŞMEZ — İKİ HÂLİ AYRI AYRI TANIMLANIR.
         *
         * Yalnızca "net + KDV = brüt" yazmak YETMEZ: oranı null olan ama
         * KDV tutarı taşıyan bir satır (rate=null, vat=500,
         * gross=net+500) o kuralı sağlar ve geçerli sayılırdı. Yani "KDV
         * uygulanmıyor" diyen bir kaydın içinde KDV bulunurdu.
         *
         * İki hâl, iki kural:
         *   vat_rate_bp IS NULL     → KDV uygulanmıyor: tutar sıfır,
         *                             brüt nete eşit
         *   vat_rate_bp IS NOT NULL → KDV var (oranı sıfır olsa bile):
         *                             net + KDV = brüt
         *
         * Bu, VatCalculator::notApplicable()'ın domain katmanında zaten
         * ürettiği sonucun veritabanındaki karşılığıdır — hesap ikinci
         * kez yazılmıyor, aynı kuralın iki katmanda ifadesi.
         */
        DB::statement('
            ALTER TABLE finance_entries
            ADD CONSTRAINT finance_entries_totals_check
            CHECK (
                (vat_rate_bp IS NULL AND vat_minor = 0 AND gross_minor = net_minor)
                OR
                (vat_rate_bp IS NOT NULL AND net_minor + vat_minor = gross_minor)
            )
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('finance_entries');
    }
};
