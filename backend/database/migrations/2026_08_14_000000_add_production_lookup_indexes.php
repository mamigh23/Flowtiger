<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Faz 10 denetiminde bulunan İKİ GERÇEK indeks eksiği.
 *
 * Bu migration hiçbir sütun eklemez, hiçbir veriyi değiştirmez ve hiçbir
 * mevcut kısıtı kaldırmaz — yalnızca iki okuma yolunu hızlandırır.
 *
 * ---------------------------------------------------------------------
 * 1) company_users.user_id
 *
 * Tabloda yalnızca UNIQUE(company_id, user_id) vardı. PostgreSQL bu
 * indeksi soldan başlayarak kullanır; dolayısıyla "şu KULLANICININ
 * şirketleri" sorgusu (WHERE user_id = ?) indekssiz kalıyordu.
 *
 * Bu sorgu FlowTiger'ın en sıcak yoludur:
 *   - User::isMemberOf()            → her yetki kontrolünde
 *   - CompanySelectionService::resolveFor() → HER tenant isteğinde
 *   - CompanyMemberPolicy / CustomerPolicy / InvitationPolicy
 *
 * PostgreSQL, foreign key sütunlarını otomatik indekslemez (MySQL'in
 * aksine); bu yüzden FK'nin varlığı yeterli değildi.
 *
 * ---------------------------------------------------------------------
 * 2) audit_logs (user_id, created_at)
 *
 * Faz 9'da eklenen GET /profile/security-events ucu şunu sorgular:
 *
 *     WHERE user_id = ? AND company_id IS NULL
 *     ORDER BY created_at DESC
 *
 * Faz 5'te tabloya konan indeksler (company_id, created_at) ve
 * (auditable_type, auditable_id) bu sorguya yardım etmez. audit_logs
 * sürekli büyüyen ve asla silinmeyen bir tablodur; indekssiz bir tam
 * tarama zamanla en pahalı sorgu haline gelirdi.
 *
 * Sütun sırası önemli: eşitlik (user_id) önce, sıralama (created_at)
 * sonra.
 *
 * ---------------------------------------------------------------------
 * CANLI VERİTABANI NOTU:
 * Büyük tablolarda CREATE INDEX yazma kilidi alır. Zaten veri bulunan
 * bir production veritabanında bu migration yerine
 * CREATE INDEX CONCURRENTLY tercih edilmelidir (transaction dışında
 * çalışır, migration içinden yürütülemez). Ayrıntı: docs/PRODUCTION.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_users', function (Blueprint $table): void {
            $table->index('user_id', 'company_users_user_id_index');
        });

        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->index(['user_id', 'created_at'], 'audit_logs_user_id_created_at_index');
        });
    }

    public function down(): void
    {
        Schema::table('company_users', function (Blueprint $table): void {
            $table->dropIndex('company_users_user_id_index');
        });

        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->dropIndex('audit_logs_user_id_created_at_index');
        });
    }
};
