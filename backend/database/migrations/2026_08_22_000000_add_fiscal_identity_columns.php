<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Faz 7 / Adım 2 — mali kimlik alanları.
 *
 * MEVCUT KAYITLARI GEÇERSİZ KILMAMA KURALI:
 * Mali kimlik alanları NULLABLE'dır. Fatura kesiminde hangi alanların
 * zorunlu olduğu bir İŞ KURALIDIR ve kesim anında doğrulanır — kayıt
 * anında değil. Zorunlu yapılsalardı, bu migration çalıştığı anda var
 * olan her şirket ve her müşteri geçersiz hâle gelirdi.
 *
 * İKİ İSTİSNA — timezone ve default_currency:
 * NOT NULL'dur ve varsayılan taşır. Dönem sınırı şirket saat diliminde
 * hesaplanır (31 Aralık 23:30'da girilen kayıt, sunucu UTC'de 1 Ocak
 * olsa bile Aralık dönemine aittir) ve para birimi tutarın anlamının
 * parçasıdır. İkisi de "bilinmiyor" olamaz; bilinmediğinde her hesap
 * tartışmalı hâle gelir.
 *
 * VARSAYILAN VERİTABANI SEVİYESİNDEDİR, model seviyesinde değil.
 * Model varsayılanı, doğrudan yazan bir seeder ya da migration'ı
 * kapsamaz; sütunun kendisi DEFAULT taşımalı ki kaydın nereden geldiği
 * fark etmesin.
 *
 * PARA BİRİMİ CANONICAL ISO KODU olarak, düz string saklanır. Enum
 * SINIRLARDA kullanılır (validation, servis), sütunun içinde değil —
 * Role enum'ının pivot'ta ham string kalma kararıyla aynı ilke.
 */
return new class extends Migration
{
    public function up(): void
    {
        // after() KULLANILMIYOR: PostgreSQL'de sütun sırası kontrol
        // edilemez ve Laravel'in Postgres grammar'ı bu değiştiriciyi
        // sessizce yok sayar. Tutmayacağı belli bir söz verilmez.
        Schema::table('companies', function (Blueprint $table): void {
            // Ticari unvan: `name` kullanıcının verdiği görünen addır,
            // legal_name ise belgede yazan resmi unvandır. İkisinin aynı
            // olması beklenmez.
            $table->string('legal_name')->nullable();

            // VKN (10 hane, tüzel kişi) ya da TCKN (11 hane, gerçek kişi).
            // Uzunluk farkı tek sütunda taşınabilir; hangi tür olduğu
            // uzunluktan okunur ve ayrı bir tip sütunu gerektirmez.
            $table->string('tax_number', 32)->nullable();

            $table->string('tax_office')->nullable();
            $table->text('billing_address')->nullable();

            // ISO 3166-1 alpha-2.
            $table->char('country', 2)->nullable();

            $table->string('timezone', 64)->default('Europe/Istanbul');

            // ISO 4217.
            $table->char('default_currency', 3)->default('TRY');
        });

        Schema::table('customers', function (Blueprint $table): void {
            // Faturanın gideceği adres; kullanıcının giriş e-postasıyla
            // aynı olmak zorunda değildir ve müşterinin kendi hesabı da
            // yoktur.
            $table->string('billing_email')->nullable();

            $table->string('tax_number', 32)->nullable();
            $table->string('tax_office')->nullable();
            $table->text('billing_address')->nullable();
            $table->char('country', 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            $table->dropColumn([
                'legal_name',
                'tax_number',
                'tax_office',
                'billing_address',
                'country',
                'timezone',
                'default_currency',
            ]);
        });

        Schema::table('customers', function (Blueprint $table): void {
            $table->dropColumn([
                'billing_email',
                'tax_number',
                'tax_office',
                'billing_address',
                'country',
            ]);
        });
    }
};
