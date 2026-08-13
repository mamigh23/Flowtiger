<?php

use App\Enums\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * company_users.role için veritabanı seviyesinde değer kısıtı.
 *
 * NEDEN GEREKLİ:
 * Rol, uygulamanın tüm yetki kararlarının dayandığı tek alan. String olarak
 * bırakıldığında bir seeder, bir konsol komutu, elle atılmış bir UPDATE ya
 * da ileride yazılacak bir migration 'Owner', 'admin' ya da '' yazabilir.
 * Böyle bir satır uygulamada owner SAYILMAZ (enum eşleşmez) ama member de
 * değildir — kullanıcı sessizce yetkisiz kalır ve şirket ownersız görünür.
 * CHECK kısıtı bu sınıf hatayı veritabanı seviyesinde imkânsız kılar.
 *
 * GERİYE DÖNÜK UYUMLU:
 * Mevcut migration'a DOKUNULMAZ (§18). Bu ayrı bir ALTER'dır ve yalnızca
 * hâlihazırda kullanılan iki değeri ('owner', 'member') kabul eder; mevcut
 * verinin tamamı bu ikisinden biridir. Sütun tipi, default'u ve
 * nullable'lığı değişmez — yalnızca kabul edilen değer kümesi daralır.
 *
 * PostgreSQL'e özgüdür; proje Faz 0'dan beri yalnızca PostgreSQL üzerinde
 * çalışır (bkz. phpunit.xml ve TestCase'deki bariyer).
 */
return new class extends Migration
{
    private const CONSTRAINT = 'company_users_role_check';

    public function up(): void
    {
        // Değerler Role enum'ından türetilir: geçerli rol kümesi kod ve
        // veritabanında ikiye ayrılmasın, tek kaynaktan gelsin.
        $allowed = collect(Role::values())
            ->map(fn (string $role): string => "'".$role."'")
            ->implode(', ');

        DB::statement(
            'ALTER TABLE company_users ADD CONSTRAINT '.self::CONSTRAINT.
            ' CHECK (role IN ('.$allowed.'))'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE company_users DROP CONSTRAINT IF EXISTS '.self::CONSTRAINT);
    }
};
