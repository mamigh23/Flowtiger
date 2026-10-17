<?php

namespace Tests\Feature\Finance;

use App\Exceptions\FinanceEntryException;
use App\Exceptions\PaymentException;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\FinanceEntry;
use App\Models\Payment;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\FinanceEntryService;
use App\Services\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class VoidedWriteSerializationTest extends TestCase
{
    use RefreshDatabase;

    public static function records(): array
    {
        return [
            'payment' => [Payment::class, PaymentService::class, 'payment'],
            'finance entry' => [FinanceEntry::class, FinanceEntryService::class, 'finance_entry'],
        ];
    }

    // İki isteğin aynı aktif kaydı önceden okuduğu sıralamayı tekrarlar.
    // Gerçek paralel bağlantı testi değildir; eski route binding nesnesinin
    // veritabanındaki son iptal durumunu atlamasını deterministik olarak ölçer.
    #[DataProvider('records')]
    public function test_a_stale_model_cannot_update_a_record_voided_by_another_request(
        string $modelClass, string $serviceClass, string $code,
    ): void {
        $owner = User::factory()->create();
        $company = Company::factory()->withOwner($owner)->create();
        $this->actingAs($owner);
        app(CompanyContext::class)->setForUser($owner, $company);
        $record = $modelClass::factory()->forCompany($company)->create();
        $stale = $record->fresh();
        $service = app($serviceClass);
        $service->void($company, $record, 'İlk iptal');
        $expected = $record->fresh()->getAttributes();
        $auditCount = AuditLog::query()->count();

        try {
            $service->update($company, $stale, [
                'direction' => 'in', 'financial_date' => '2026-10-17',
                'amount_minor' => 50000, 'amount_basis' => 'net',
                'vat_rate_bp' => null, 'currency' => 'TRY',
                'allocations' => [],
            ]);
            $this->fail('Eski model iptal edilmiş kaydı güncelleyebildi.');
        } catch (FinanceEntryException|PaymentException $exception) {
            $this->assertSame($code.'_voided', $exception->errorCode);
        }

        $this->assertSame($expected, $record->fresh()->getAttributes());
        $this->assertSame($auditCount, AuditLog::query()->count());
    }

    #[DataProvider('records')]
    public function test_a_stale_model_cannot_overwrite_the_first_void(
        string $modelClass, string $serviceClass, string $code,
    ): void {
        $owner = User::factory()->create();
        $company = Company::factory()->withOwner($owner)->create();
        $this->actingAs($owner);
        app(CompanyContext::class)->setForUser($owner, $company);
        $record = $modelClass::factory()->forCompany($company)->create();
        $stale = $record->fresh();
        $service = app($serviceClass);
        $service->void($company, $record, 'İlk iptal');
        $expected = $record->fresh()->getAttributes();
        $auditCount = AuditLog::query()->count();

        try {
            $service->void($company, $stale, 'İkinci iptal');
            $this->fail('Eski model ilk iptalin üzerine yazabildi.');
        } catch (FinanceEntryException|PaymentException $exception) {
            $this->assertSame($code.'_already_voided', $exception->errorCode);
        }

        $this->assertSame($expected, $record->fresh()->getAttributes());
        $this->assertSame($auditCount, AuditLog::query()->count());
    }
}
