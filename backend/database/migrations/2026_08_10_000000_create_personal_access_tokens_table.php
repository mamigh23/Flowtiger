<?php

// Laravel Sanctum v4.3.3'ün kendi migration'ı.
//
// Sanctum 4.x migration'ları OTOMATİK yüklemez; SanctumServiceProvider yalnızca
// publishesMigrations(...) ile 'sanctum-migrations' etiketi altında yayınlar.
// Bu dosya o yayının birebir sonucudur (paket içeriği değiştirilmemiştir),
// yalnızca dosya adı Laravel'in yayınlama davranışına uygun olarak güncel
// tarihle yeniden adlandırılmıştır.
//
// DİKKAT: `php artisan vendor:publish --tag=sanctum-migrations` ÇALIŞTIRMA —
// aynı tabloyu ikinci kez oluşturmaya çalışan kopya bir migration üretir.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('personal_access_tokens');
    }
};
