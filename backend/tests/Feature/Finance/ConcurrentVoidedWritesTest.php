<?php

namespace Tests\Feature\Finance;

use App\Models\AuditLog;
use App\Models\Company;
use App\Models\FinanceEntry;
use App\Models\Payment;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\FinanceEntryService;
use App\Services\PaymentService;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class ConcurrentVoidedWritesTest extends TestCase
{
    // İşçi bağlantısının fixture'ları görebilmesi için test transaction'ı yok.
    use DatabaseMigrations;

    public static function races(): array
    {
        return [
            'payment update/void' => ['payment', 'update'],
            'payment void/void' => ['payment', 'void'],
            'entry update/void' => ['finance_entry', 'update'],
            'entry void/void' => ['finance_entry', 'void'],
        ];
    }

    #[DataProvider('races')]
    public function test_waiting_writer_observes_the_committed_void(string $kind, string $operation): void
    {
        $owner = User::factory()->create();
        $company = Company::factory()->withOwner($owner)->create();
        $this->actingAs($owner);
        app(CompanyContext::class)->setForUser($owner, $company);
        $model = $kind === 'payment' ? Payment::class : FinanceEntry::class;
        $service = app($kind === 'payment' ? PaymentService::class : FinanceEntryService::class);
        $record = $model::factory()->forCompany($company)->create();
        $auditBefore = AuditLog::count();
        $connection = config('database.connections.pgsql');
        $process = new Process([
            PHP_BINARY, '-c', php_ini_loaded_file(), base_path('tests/Support/finance-race-worker.php'),
            $kind, $operation, (string) $owner->id, (string) $company->id, (string) $record->id,
        ], base_path(), [
            'APP_ENV' => 'testing', 'DB_CONNECTION' => 'pgsql', 'DB_DATABASE' => 'flowtiger_test',
            'DB_URL' => '', 'DB_HOST' => $connection['host'], 'DB_PORT' => (string) $connection['port'],
            'DB_USERNAME' => $connection['username'], 'DB_PASSWORD' => $connection['password'],
            'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync',
        ]);
        $process->setTimeout(30);

        $this->assertSame(0, DB::transactionLevel(), 'İşçi fixtureları commit edilmiş olmalı.');
        $phase = 'başlangıç';
        DB::beginTransaction();
        try {
            $model::whereKey($record->id)->lockForUpdate()->firstOrFail();
            $parentPid = DB::selectOne('select pg_backend_pid() as pid')->pid;
            $process->start();
            $phase = 'işçi hazır yanıtı';
            $ready = null;
            $stdout = '';
            $process->waitUntil(function (string $type, string $output) use (&$ready, &$stdout): bool {
                if ($type !== Process::OUT) {
                    return false;
                }
                $stdout .= $output;
                $candidate = json_decode(trim($stdout), true);
                if (is_array($candidate) && ($candidate['ready'] ?? false)) {
                    $ready = $candidate;

                    return true;
                }

                return false;
            });
            $this->assertNotNull($ready, 'İşçi test bağlantısı hazırlanamadı.');
            $phase = 'satır kilidi bekleme';

            $deadline = microtime(true) + 10;
            do {
                $blocked = DB::selectOne('select ? = any(pg_blocking_pids(?)) as blocked', [$parentPid, $ready['pid']])->blocked;
                if ($blocked) {
                    break;
                }
                usleep(20000);
            } while (microtime(true) < $deadline && $process->isRunning());
            $this->assertTrue((bool) $blocked, 'İkinci gerçek PostgreSQL bağlantısı satır kilidini beklemeli.');

            $phase = 'ilk iptal';
            $service->void($company, $record, 'İlk iptal');
            $expected = $record->fresh()->getAttributes();
            DB::commit();
            $phase = 'commit sonrası işçi sonucu';
            $this->assertSame(0, $process->wait(), 'İşçi işlemi başarısız oldu.');
            $lines = explode("\n", trim($process->getOutput()));
            $result = json_decode(end($lines), true);
            $this->assertSame($kind.($operation === 'void' ? '_already_voided' : '_voided'), $result['result']);
            $this->assertSame($expected, $record->fresh()->getAttributes());
            $this->assertSame($auditBefore + 1, AuditLog::count());
        } catch (ProcessTimedOutException $exception) {
            throw new RuntimeException('Finans test işçisi zaman aşımı: '.$phase, previous: $exception);
        } finally {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            if ($process->isRunning()) {
                $process->stop();
            }
        }
    }
}
