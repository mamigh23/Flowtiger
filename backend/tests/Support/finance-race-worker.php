<?php

use App\Exceptions\FinanceEntryException;
use App\Exceptions\PaymentException;
use App\Models\Company;
use App\Models\FinanceEntry;
use App\Models\Payment;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\FinanceEntryService;
use App\Services\PaymentService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

// Bu yardımcı bağımsız PHP sürecidir; tek bir sorgudan önce fail closed.
if (! app()->environment('testing') || config('database.default') !== 'pgsql'
    || config('database.connections.pgsql.database') !== 'flowtiger_test') {
    exit(90);
}

[$script, $kind, $operation, $ownerId, $companyId, $recordId] = $argv;
$owner = User::findOrFail((int) $ownerId);
$company = Company::findOrFail((int) $companyId);
auth()->setUser($owner);
app(CompanyContext::class)->setForUser($owner, $company);
$model = $kind === 'payment' ? Payment::class : FinanceEntry::class;
$service = app($kind === 'payment' ? PaymentService::class : FinanceEntryService::class);
$record = $model::findOrFail((int) $recordId);
echo json_encode(['ready' => true, 'pid' => DB::selectOne('select pg_backend_pid() as pid')->pid])."\n";
flush();

try {
    if ($operation === 'void') {
        $service->void($company, $record, 'İkinci iptal');
    } else {
        $service->update($company, $record, [
            'direction' => 'in', 'financial_date' => '2026-10-18',
            'amount_minor' => 50000, 'amount_basis' => 'net',
            'vat_rate_bp' => null, 'currency' => 'TRY', 'allocations' => [],
        ]);
    }
    echo json_encode(['result' => 'written'])."\n";
} catch (FinanceEntryException|PaymentException $exception) {
    echo json_encode(['result' => $exception->errorCode])."\n";
}
