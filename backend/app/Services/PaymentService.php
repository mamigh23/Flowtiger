<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Exceptions\PaymentException;
use App\Models\Company;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use Illuminate\Support\Facades\DB;

/**
 * Ödeme ve tahsilat dağıtımının iş mantığı (Faz 7 / Adım 4).
 *
 * ÖDEME VE DAĞITIMLARI AYNI TRANSACTION'DA YAZILIR. Ayrı yazılsalardı,
 * arada bir hata "dağıtımsız ödeme" ya da "ödemesiz dağıtım" bırakırdı;
 * ikisi de raporu bozar.
 *
 * TOPLAM KONTROLÜ İKİ KEZ YAPILIR VE BU BİLİNÇLİDİR:
 *   FormRequest → kullanıcıya anlaşılır bir 422 vermek için
 *   burası      → eşzamanlılığa karşı gerçek güvence
 * İkincisi olmadan, aynı ödemeyi aynı anda güncelleyen iki istek
 * birbirinin kontrolünü geçersiz kılabilirdi. Ödeme satırı kilitlenir —
 * CustomerService'in customer_no üretimindeki desen.
 *
 * DEĞİŞİKLİK VE AUDIT AYNI TRANSACTION'DA (§9).
 */
class PaymentService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $attributes  PaymentRequest::validated()
     */
    public function create(Company $company, array $attributes): Payment
    {
        return DB::transaction(function () use ($company, $attributes): Payment {
            $payment = new Payment;

            $payment->fill($this->paymentAttributes($attributes));
            $payment->company_id = $company->getKey();
            $payment->save();

            $this->replaceAllocations($payment, $attributes['allocations'] ?? []);

            $payment->load('allocations');

            $this->audit->record(
                action: AuditAction::PaymentCreated,
                company: $company,
                auditable: $payment,
                newValues: $this->auditValues($payment),
            );

            return $payment;
        });
    }

    /**
     * PUT: ödemenin tam hâli yazılır, dağıtım listesi eskisinin TAMAMEN
     * yerine geçer.
     *
     * @param  array<string, mixed>  $attributes
     *
     * @throws PaymentException
     */
    public function update(Company $company, Payment $payment, array $attributes): Payment
    {
        if ($payment->isVoided()) {
            throw PaymentException::voided();
        }

        return DB::transaction(function () use ($company, $payment, $attributes): Payment {
            // Satır kilidi: eşzamanlı iki güncelleme birbirinin toplam
            // kontrolünü geçersiz kılamasın.
            Payment::query()->whereKey($payment->getKey())->lockForUpdate()->firstOrFail();

            $payment->load('allocations');
            $oldValues = $this->auditValues($payment);

            $payment->fill($this->paymentAttributes($attributes));
            $payment->save();

            $this->replaceAllocations($payment, $attributes['allocations'] ?? []);

            $payment->load('allocations');

            $this->audit->record(
                action: AuditAction::PaymentUpdated,
                company: $company,
                auditable: $payment,
                oldValues: $oldValues,
                newValues: $this->auditValues($payment),
            );

            return $payment;
        });
    }

    /**
     * Ödemeyi iptal eder — SİLMEZ.
     *
     * DAĞITIMLAR YERİNDE DURUR: "bu para neye sayılmıştı" sorusu iptalden
     * sonra da cevaplanabilmeli. Raporlarda sayılmaması iptal
     * işaretinden gelir, satırların yok olmasından değil.
     *
     * @throws PaymentException
     */
    public function void(Company $company, Payment $payment, ?string $reason): Payment
    {
        if ($payment->isVoided()) {
            throw PaymentException::alreadyVoided();
        }

        return DB::transaction(function () use ($company, $payment, $reason): Payment {
            $payment->load('allocations');
            $oldValues = $this->auditValues($payment);

            $payment->voided_at = now();
            $payment->void_reason = $reason;
            $payment->save();

            $this->audit->record(
                action: AuditAction::PaymentVoided,
                company: $company,
                auditable: $payment,
                oldValues: $oldValues,
                metadata: ['void_reason' => $reason],
            );

            return $payment;
        });
    }

    /**
     * Dağıtım listesini TAMAMEN yeniler.
     *
     * Eskiler silinir, yenileri yazılır. Kısmi güncelleme olsaydı
     * "dağıtımı sil" ile "dağıtıma dokunma" ayrımı anlatılamazdı.
     *
     * @param  array<int, array<string, mixed>>  $allocations
     *
     * @throws PaymentException
     */
    private function replaceAllocations(Payment $payment, array $allocations): void
    {
        $total = 0;

        foreach ($allocations as $allocation) {
            $total += (int) $allocation['amount_minor'];
        }

        // Son savunma: FormRequest bunu zaten yakalıyor, ama eşzamanlı
        // istekler ya da servisi doğrudan çağıran gelecekteki bir kod
        // yolu için kural burada da duruyor.
        if ($total > (int) $payment->amount_minor) {
            throw PaymentException::overAllocated();
        }

        $payment->allocations()->delete();

        foreach ($allocations as $allocation) {
            $row = new PaymentAllocation([
                'finance_entry_id' => $allocation['finance_entry_id'],
                'amount_minor' => (int) $allocation['amount_minor'],
            ]);

            // company_id fillable DEĞİLDİR (§9): tenant anahtarı gövdeden
            // değil, ödemenin kendisinden gelir. Dağıtım hiçbir koşulda
            // ödemesinden başka bir şirkete yazılamaz.
            $row->company_id = $payment->company_id;

            $payment->allocations()->save($row);
        }
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function paymentAttributes(array $attributes): array
    {
        return [
            'customer_id' => $attributes['customer_id'] ?? null,
            'financial_date' => $attributes['financial_date'],
            'amount_minor' => (int) $attributes['amount_minor'],
            'currency' => $attributes['currency'],
            'method' => $attributes['method'] ?? null,
            'note' => $attributes['note'] ?? null,
        ];
    }

    /**
     * Audit'e yazılacak alanlar.
     *
     * `note` BİLİNÇLİ OLARAK DIŞARIDA: serbest metindir ve kullanıcı
     * oraya kişisel veri yazabilir. Audit tablosu tasarım gereği
     * kalıcıdır; oraya yazılan bir not asla silinemez. Kaydın kendisi
     * zaten notu taşıyor — audit'in işi tutarların ve bağlantıların izini
     * tutmak (FinanceEntry'deki kararla aynı).
     *
     * `allocated_minor` izde YER ALIR: dağıtım değişikliği tek başına bir
     * audit olayı üretmiyor, ödemenin izinde görünüyor.
     *
     * @return array<string, mixed>
     */
    private function auditValues(Payment $payment): array
    {
        return [
            'financial_date' => $payment->financial_date?->format('Y-m-d'),
            'amount_minor' => $payment->amount_minor,
            'currency' => $payment->currency,
            'method' => $payment->method,
            'customer_id' => $payment->customer_id,
            'allocated_minor' => $payment->allocatedMinor(),
            'allocation_count' => $payment->allocations->count(),
        ];
    }
}
