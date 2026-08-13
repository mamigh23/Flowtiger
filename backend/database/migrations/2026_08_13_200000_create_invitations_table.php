<?php

use App\Enums\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Şirkete katılım davetleri.
 *
 * TASARIM KARARLARI:
 *
 * 1) status SÜTUNU YOK.
 *    Durum accepted_at / revoked_at / expires_at üçlüsünden hesaplanır
 *    (bkz. InvitationStatus). Ayrı bir status sütunu, zaman damgalarıyla
 *    çelişebilecek ikinci bir gerçek kaynağı yaratırdı.
 *
 * 2) token_hash — PLAINTEXT TOKEN ASLA YAZILMAZ (§3, §4).
 *    Veritabanı ele geçirilse bile hiçbir davet linki üretilemez.
 *    Sanctum'un token'ları için Faz 2.1'de verilen kararla aynı çizgi.
 *    64 karakter: SHA-256'nın hex gösterimi.
 *
 * 3) company_id CASCADE (audit_logs'taki nullOnDelete'in tersine).
 *    Şirket silindiğinde ona ait bekleyen davetler ANLAMSIZLAŞIR ve
 *    yaşamaya devam etmemelidir — var olmayan bir şirkete katılım
 *    daveti, kabul edilebilir bir şey değildir. Audit kaydı ise tarihtir
 *    ve yaşamalıdır; ikisi farklı doğaya sahiptir.
 *
 * 4) invited_by nullOnDelete.
 *    Daveti gönderen kullanıcı silinse bile davet geçerliliğini korur;
 *    yalnızca "kim gönderdi" bilgisi düşer.
 *
 * 5) role için CHECK kısıtı — Faz 4'teki company_users.role ile AYNI
 *    gerekçe: bu alan KULLANICI GİRDİSİNDEN gelir (POST gövdesindeki
 *    role), dolayısıyla veritabanı da savunma yapmalıdır. (Karşılaştır:
 *    audit_logs.action yalnızca koddan gelir ve kısıt taşımaz.)
 */
return new class extends Migration
{
    private const PENDING_UNIQUE_INDEX = 'invitations_company_email_pending_unique';

    private const ROLE_CHECK = 'invitations_role_check';

    public function up(): void
    {
        Schema::create('invitations', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('company_id')
                ->constrained('companies')
                ->cascadeOnDelete();

            $table->foreignId('invited_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            // Normalize edilmiş (küçük harf, kırpılmış) hâliyle saklanır;
            // normalizasyon tek bir yerde yapılır (InvitationService).
            $table->string('email');

            $table->string('role');

            // Yalnızca hash. Plaintext token yalnızca gönderilen mail'de
            // yaşar ve hiçbir yere kaydedilmez.
            $table->string('token_hash', 64)->unique();

            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('revoked_at')->nullable();

            $table->timestamps();

            /*
             * Liste ucunun tek sorgusu:
             *   WHERE company_id = ? ORDER BY created_at DESC
             */
            $table->index(['company_id', 'created_at']);
        });

        /*
         * "Bir şirkette, bir e-posta için AYNI ANDA en fazla bir BEKLEYEN
         * davet olabilir."
         *
         * Partial unique index kullanılıyor çünkü kural yalnızca BEKLEYEN
         * davetler için geçerli: aynı kişiye zaman içinde defalarca davet
         * gönderilebilmeli, ama aynı anda iki geçerli token dolaşımda
         * olmamalı.
         *
         * InvitationService bu kuralı zaten şirket satırını kilitleyerek
         * ve eski daveti iptal ederek koruyor; buradaki index yapısal
         * yedektir — uygulama dışından (SQL, seeder, ileride yazılacak bir
         * konsol komutu) gelen yazmalar da kurala uymak zorunda kalır.
         */
        DB::statement(
            'CREATE UNIQUE INDEX '.self::PENDING_UNIQUE_INDEX.' ON invitations (company_id, email) '.
            'WHERE accepted_at IS NULL AND revoked_at IS NULL'
        );

        // Geçerli rol kümesi tek kaynaktan: Role enum'ı.
        $allowedRoles = collect(Role::values())
            ->map(fn (string $role): string => "'".$role."'")
            ->implode(', ');

        DB::statement(
            'ALTER TABLE invitations ADD CONSTRAINT '.self::ROLE_CHECK.
            ' CHECK (role IN ('.$allowedRoles.'))'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');
    }
};
