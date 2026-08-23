<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Enums\Currency;
use App\Exceptions\FinanceEntryException;
use App\Finance\Money;
use App\Finance\VatBreakdown;
use App\Finance\VatCalculator;
use App\Models\Company;
use App\Models\FinanceEntry;
use Illuminate\Support\Facades\DB;

/**
 * Finans kaydının iş mantığı (Faz 7 / Adım 3).
 *
 * HESAPLAMA BURADA YENİDEN YAZILMAZ. net/KDV/brüt üçlüsü tek bir yerden,
 * VatCalculator'dan gelir; bu sınıf yalnızca hangi yönden hesaplanacağına
 * karar verir. İkinci bir hesaplama kodu, bir gün ilkinden farklı
 * yuvarlayan bir sonuç üretirdi.
 *
 * DEĞİŞİKLİK VE AUDIT AYNI TRANSACTION'DA (§9): tutar değişip iz
 * kaybolursa "bu rakam neden değişti" sorusu cevapsız kalır.
 *
 * FİZİKSEL SİLME YOKTUR. delete() metodu bilinçli olarak yazılmadı;
 * kaydın sonlandırılması void() ile yapılır ve satır yerinde durur.
 */
class FinanceEntryService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $attributes  FinanceEntryRequest::validated()
     */
    public function create(Company $company, array $attributes): FinanceEntry
    {
        return DB::transaction(function () use ($company, $attributes): FinanceEntry {
            $entry = new FinanceEntry;

            $this->applyAttributes($entry, $attributes);
            $entry->company_id = $company->getKey();
            $entry->save();

            $this->audit->record(
                action: AuditAction::FinanceEntryCreated,
                company: $company,
                auditable: $entry,
                newValues: $this->auditValues($entry),
            );

            return $entry;
        });
    }

    /**
     * PUT: kaydın tam hâli yazılır, parasal üçlü yeniden hesaplanır.
     *
     * @param  array<string, mixed>  $attributes
     *
     * @throws FinanceEntryException
     */
    public function update(Company $company, FinanceEntry $entry, array $attributes): FinanceEntry
    {
        if ($entry->isVoided()) {
            throw FinanceEntryException::voided();
        }

        return DB::transaction(function () use ($company, $entry, $attributes): FinanceEntry {
            $oldValues = $this->auditValues($entry);

            $this->applyAttributes($entry, $attributes);
            $entry->save();

            $this->audit->record(
                action: AuditAction::FinanceEntryUpdated,
                company: $company,
                auditable: $entry,
                oldValues: $oldValues,
                newValues: $this->auditValues($entry),
            );

            return $entry;
        });
    }

    /**
     * Kaydı iptal eder — SİLMEZ.
     *
     * Silinmiş bir gelir kaydı geçmiş bir dönemin toplamını sessizce
     * değiştirirdi. İptal edilen kayıt yerinde durur, görünür kalır ve
     * sebebi okunabilir.
     *
     * @throws FinanceEntryException
     */
    public function void(Company $company, FinanceEntry $entry, ?string $reason): FinanceEntry
    {
        if ($entry->isVoided()) {
            throw FinanceEntryException::alreadyVoided();
        }

        return DB::transaction(function () use ($company, $entry, $reason): FinanceEntry {
            // İptal anındaki tutarlar ize girer: kaydın o günkü hâli
            // sonradan değiştirilemeyeceği için bu satır kalıcı kanıttır.
            $oldValues = $this->auditValues($entry);

            $entry->voided_at = now();
            $entry->void_reason = $reason;
            $entry->save();

            $this->audit->record(
                action: AuditAction::FinanceEntryVoided,
                company: $company,
                auditable: $entry,
                oldValues: $oldValues,
                metadata: ['void_reason' => $reason],
            );

            return $entry;
        });
    }

    /**
     * Gövdeyi modele yazar ve parasal üçlüyü hesaplar.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function applyAttributes(FinanceEntry $entry, array $attributes): void
    {
        $entry->fill([
            'customer_id' => $attributes['customer_id'] ?? null,
            'direction' => $attributes['direction'],
            'financial_date' => $attributes['financial_date'],
            'category' => $attributes['category'] ?? null,
            'note' => $attributes['note'] ?? null,
            'amount_basis' => $attributes['amount_basis'],
            'vat_rate_bp' => $attributes['vat_rate_bp'] ?? null,
            'currency' => $attributes['currency'],
        ]);

        $breakdown = $this->calculate($attributes);

        // Hesaplanan alanlar fillable DEĞİLDİR; açıkça atanır.
        $entry->net_minor = $breakdown->net->minor;
        $entry->vat_minor = $breakdown->vat->minor;
        $entry->gross_minor = $breakdown->gross->minor;
    }

    /**
     * Hangi yönden hesaplanacağına karar verir; hesabın kendisini
     * VatCalculator yapar.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function calculate(array $attributes): VatBreakdown
    {
        $amount = Money::of(
            (int) $attributes['amount_minor'],
            Currency::from($attributes['currency']),
        );

        $rate = $attributes['vat_rate_bp'] ?? null;

        return $attributes['amount_basis'] === 'gross'
            ? VatCalculator::fromGross($amount, $rate)
            : VatCalculator::fromNet($amount, $rate);
    }

    /**
     * Audit'e yazılacak alanlar.
     *
     * `note` BİLİNÇLİ OLARAK DIŞARIDA: serbest metindir ve kullanıcı oraya
     * kişisel veri yazabilir. Audit tablosu tasarım gereği kalıcıdır;
     * oraya yazılan bir not asla silinemez. Kaydın kendisi zaten notu
     * taşıyor — audit'in işi tutarların ve sınıflandırmanın izini tutmak.
     *
     * @return array<string, mixed>
     */
    private function auditValues(FinanceEntry $entry): array
    {
        return [
            'direction' => $entry->direction instanceof \App\Enums\FinanceDirection
                ? $entry->direction->value
                : $entry->direction,
            'financial_date' => $entry->financial_date?->format('Y-m-d'),
            'category' => $entry->category,
            'amount_basis' => $entry->amount_basis,
            'net_minor' => $entry->net_minor,
            'vat_rate_bp' => $entry->vat_rate_bp,
            'vat_minor' => $entry->vat_minor,
            'gross_minor' => $entry->gross_minor,
            'currency' => $entry->currency,
            'customer_id' => $entry->customer_id,
        ];
    }
}
