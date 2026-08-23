<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\FinanceEntry;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FinanceEntry>
 */
class FinanceEntryFactory extends Factory
{
    protected $model = FinanceEntry::class;

    /**
     * Varsayılan: 1.000,00 TL gider, %20 KDV.
     *
     * Parasal üçlü BURADA ELLE TUTARLI YAZILIR (100000 + 20000 = 120000).
     * Rastgele üretilmez: veritabanındaki `net + vat = gross` CHECK kısıtı
     * tutarsız bir üçlüyü reddeder ve test rastgele patlardı. Ayrıca
     * factory, VatCalculator'ı çağırmaz — hesaplamanın doğruluğu servis
     * ve birim testlerinin konusudur, fixture'ın değil.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'customer_id' => null,
            'direction' => 'out',
            'financial_date' => '2026-08-15',
            'category' => 'Genel',
            'note' => null,
            'amount_basis' => 'net',
            'net_minor' => 100000,
            'vat_rate_bp' => 2000,
            'vat_minor' => 20000,
            'gross_minor' => 120000,
            'currency' => 'TRY',
        ];
    }

    /**
     * Kaydı mevcut bir şirkete bağlar.
     */
    public function forCompany(Company $company): static
    {
        return $this->state(fn (): array => [
            'company_id' => $company->getKey(),
        ]);
    }

    /**
     * İptal edilmiş kayıt.
     */
    public function voided(?string $reason = null): static
    {
        return $this->state(fn (): array => [
            'voided_at' => now(),
            'void_reason' => $reason,
        ]);
    }
}
