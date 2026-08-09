<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * Testlerin çalışmasına izin verilen tek veritabanı.
     *
     * RefreshDatabase yıkıcı bir işlemdir (migrate:fresh / truncate). Yanlış
     * yapılandırılmış bir .env, test suite'ini geliştirme veya production
     * veritabanına yönlendirebilir. Bu sabit, fail-closed bir bariyerdir:
     * beklenen veritabanı adı değilse tek bir test bile çalışmaz.
     */
    private const ALLOWED_TEST_DATABASE = 'flowtiger_test';

    /**
     * Uygulama oluşturulduktan hemen sonra, fakat RefreshDatabase gibi
     * trait'ler devreye girmeden önce çalışır.
     */
    protected function refreshApplication(): void
    {
        parent::refreshApplication();

        $this->guardAgainstNonTestDatabase();
    }

    private function guardAgainstNonTestDatabase(): void
    {
        $connection = config('database.default');

        if ($connection !== 'pgsql') {
            throw new RuntimeException(
                "Testler yalnızca PostgreSQL üzerinde çalışabilir (FlowTiger Anayasası §6). ".
                "Aktif bağlantı: '{$connection}'. phpunit.xml içindeki DB_CONNECTION değerini kontrol et."
            );
        }

        $database = config("database.connections.{$connection}.database");

        if ($database !== self::ALLOWED_TEST_DATABASE) {
            throw new RuntimeException(
                "GÜVENLİK DURDURMASI: testler yalnızca '".self::ALLOWED_TEST_DATABASE."' veritabanında ".
                "çalışabilir, fakat '{$database}' veritabanına bağlanılmak üzere. ".
                "Test suite'i yıkıcıdır; geliştirme/production verisini korumak için durduruldu."
            );
        }
    }
}
