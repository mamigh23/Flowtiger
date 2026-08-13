<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit log — kim, nerede, ne, hangi kayıt üzerinde, ne zaman.
 *
 * TASARIM KARARLARI:
 *
 * 1) updated_at YOK.
 *    Audit kaydı değişmez bir olgudur. updated_at sütunu "bu satır
 *    güncellenebilir" mesajı verir ve bir gün gerçekten güncellenir.
 *    Sütunun yokluğu, niyetin şemaya yazılmış halidir. Model tarafında
 *    UPDATED_AT = null ile Eloquent'e de bildirilir.
 *
 * 2) company_id ve user_id NULLABLE.
 *    Kimlik doğrulama olayları (login, failed login, logout) henüz bir
 *    şirket seçilmemişken ve bazen hiç kullanıcı doğrulanmamışken
 *    gerçekleşir (§5, §6). Bu satırları uydurma bir şirkete bağlamak,
 *    audit'i yalancı yapardı.
 *
 * 3) nullOnDelete (cascade DEĞİL).
 *    Bir şirket silindiğinde onun geçmişi de silinseydi, "şirketi kim
 *    sildi, öncesinde ne oldu" sorusu cevapsız kalırdı. Satır yaşamaya
 *    devam eder; yalnızca kime/nereye ait olduğu bilgisi düşer.
 *    Faz 2.2'deki users.active_company_id kararıyla aynı yönde.
 *
 * 4) JSONB (JSON değil).
 *    PostgreSQL'de JSONB ikili biçimde saklanır, indekslenebilir ve
 *    sorgulanabilir. Audit verisi yazıldıktan sonra yalnızca OKUNUR;
 *    JSONB'nin biraz daha pahalı yazma maliyeti, ileride "şu alanı kim
 *    değiştirdi" sorgusunu mümkün kılmaya değer.
 *
 * 5) INDEKSLER — körlemesine değil, gerçek sorgulara göre (§22).
 *    Bkz. aşağıdaki gerekçeler.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('company_id')
                ->nullable()
                ->constrained('companies')
                ->nullOnDelete();

            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            // Değerler AuditAction enum'ından gelir; hiçbir istek gövdesi
            // bu alanı belirleyemez, bu yüzden CHECK kısıtı eklenmedi.
            $table->string('action');

            // Polimorfik hedef; Laravel'in standart biçimi (tam sınıf yolu).
            // Global morphMap bilinçli olarak kurulmadı — Sanctum'un
            // tokenable_type'ını da değiştirirdi (bkz. AppServiceProvider).
            // API yanıtında kısa ada çevrilir.
            $table->string('auditable_type')->nullable();
            $table->unsignedBigInteger('auditable_id')->nullable();

            $table->jsonb('old_values')->nullable();
            $table->jsonb('new_values')->nullable();
            $table->jsonb('metadata')->nullable();

            // 45 karakter: IPv6'nın en uzun metin biçimi (IPv4-mapped dahil).
            $table->string('ip_address', 45)->nullable();

            // User agent sınırsız uzunlukta gelebilir; audit tablosunu
            // şişirmemek için kırpılır (§24).
            $table->string('user_agent', 512)->nullable();

            $table->timestamp('created_at')->nullable();

            /*
             * (company_id, created_at) — ZORUNLU.
             * Audit API'sinin TEK sorgusu budur:
             *   WHERE company_id = ? ORDER BY created_at DESC
             * Sütun sırası önemli: eşitlik önce, sıralama sonra.
             */
            $table->index(['company_id', 'created_at']);

            /*
             * (auditable_type, auditable_id) — "bu kaydın geçmişi".
             * Henüz ucu yok ama audit log'un varlık sebeplerinden biri bu
             * soru ve tablo büyüdükten SONRA indeks eklemek pahalıdır.
             */
            $table->index(['auditable_type', 'auditable_id']);

            /*
             * BİLİNÇLİ OLARAK EKLENMEYENLER (§22 "körlemesine indeksleme"):
             *
             * - user_id: henüz hiçbir sorgu aktöre göre filtrelemiyor.
             *   FK'nin ON DELETE SET NULL'ı indekssiz tarama yapar, ancak
             *   FlowTiger kullanıcıyı fiziksel olarak SİLMEZ (Faz 4 §12) —
             *   bu yol hiç işletilmiyor.
             *
             * - action: (company_id, created_at) indeksi listeleme
             *   sorgusunu zaten karşılıyor. Action'a göre filtre ucu
             *   yazıldığında (company_id, action, created_at) eklenmeli.
             *
             * Audit tablosu YAZMA yoğundur: her indeks her INSERT'i
             * yavaşlatır. Kullanılmayan indeks saf maliyettir.
             */
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
