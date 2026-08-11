<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Kullanıcının o anda üzerinde çalıştığı şirket.
     *
     * nullable: kullanıcı henüz bir şirket seçmemiş olabilir (hiç şirketi
     * olmayabilir ya da birden fazla şirketi olduğu için açık seçim bekliyor
     * olabilir). Bu durumda tenant erişimi yoktur — fail closed.
     *
     * nullOnDelete: şirket silinirse referans veritabanı seviyesinde
     * temizlenir. Böylece silinmiş bir şirkete işaret eden "hayalet" aktif
     * şirket durumu uygulama koduna hiç ulaşamaz.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('active_company_id')
                ->nullable()
                ->constrained('companies')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('active_company_id');
        });
    }
};
