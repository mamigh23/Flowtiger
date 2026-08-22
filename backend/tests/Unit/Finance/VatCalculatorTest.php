<?php

namespace Tests\Unit\Finance;

use App\Enums\Currency;
use App\Finance\Money;
use App\Finance\VatBreakdown;
use App\Finance\VatCalculator;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/**
 * KDV hesabı.
 *
 * ORAN BASIS POINT'TİR: yüzde × 100. %20 → 2000, %1 → 100, %0 → 0.
 * Yüzdeyi int tutmak %8,5 gibi bir oranı temsil edilemez kılardı;
 * decimal tutmak ondalık sorununu geri getirirdi (§A4).
 *
 * FORMÜLLER:
 *   net → KDV:  vat_minor = round(net_minor × rate_bp / 10000)
 *   brüt → net: net_minor = round(gross_minor × 10000 / (10000 + rate_bp))
 *               vat_minor = gross_minor − net_minor
 *
 * Brüt ayrıştırmada KDV ÇIKARMA ile bulunur, ayrıca hesaplanmaz —
 * aksi hâlde net + KDV ≠ brüt olabilirdi.
 *
 * ÜÇ AYRI DURUM, BİRBİRİNE KARIŞTIRILMAZ:
 *   oran 0, istisna kodu yok  → KDV var, oranı sıfır
 *   oran 0, istisna kodu var  → mevzuat gereği istisna (Faz 8 konusu)
 *   oran null                 → kayıt KDV bilgisi TAŞIMIYOR
 * Üçünü tek "0"a indirmek, "KDV'siz mi, girilmemiş mi" sorusunu
 * cevapsız bırakırdı. Oranı null olan kalem KDV özetine GİRMEZ.
 */
class VatCalculatorTest extends TestCase
{
    private function lira(int $minor): Money
    {
        return Money::of($minor, Currency::TurkishLira);
    }

    // ------------------------------------------------------- net → brüt

    public function test_it_computes_twenty_percent_vat_from_net(): void
    {
        // 1.000,00 TL @ %20
        $breakdown = VatCalculator::fromNet($this->lira(100000), 2000);

        $this->assertSame(100000, $breakdown->net->minor);
        $this->assertSame(20000, $breakdown->vat->minor);
        $this->assertSame(120000, $breakdown->gross->minor);
    }

    public function test_it_computes_one_percent_vat_from_net(): void
    {
        // 1.000,00 TL @ %1
        $breakdown = VatCalculator::fromNet($this->lira(100000), 100);

        $this->assertSame(1000, $breakdown->vat->minor);
        $this->assertSame(101000, $breakdown->gross->minor);
    }

    /**
     * Sıfır ORAN, "KDV yok" DEĞİLDİR: kalem KDV'lidir, oranı sıfırdır ve
     * KDV özetinde sıfır oranlı satır olarak görünür.
     */
    public function test_a_zero_rate_still_counts_as_vat_bearing(): void
    {
        $breakdown = VatCalculator::fromNet($this->lira(100000), 0);

        $this->assertSame(0, $breakdown->vat->minor);
        $this->assertSame(100000, $breakdown->gross->minor);
        $this->assertTrue($breakdown->isVatApplicable());
        $this->assertSame(0, $breakdown->vatRateBp);
    }

    /**
     * NULL ORAN: kayıt KDV bilgisi taşımıyor. Tutar olduğu gibi geçer,
     * ama bu kalem KDV özetine girmez — `isVatApplicable()` false'tur.
     */
    public function test_a_null_rate_means_vat_is_not_applicable(): void
    {
        $breakdown = VatCalculator::fromNet($this->lira(100000), null);

        $this->assertSame(100000, $breakdown->net->minor);
        $this->assertSame(0, $breakdown->vat->minor);
        $this->assertSame(100000, $breakdown->gross->minor);
        $this->assertFalse($breakdown->isVatApplicable());
        $this->assertNull($breakdown->vatRateBp);
    }

    // ------------------------------------------------------- brüt → net

    public function test_it_extracts_net_and_vat_from_a_gross_amount(): void
    {
        // 1.200,00 TL brüt @ %20 → 1.000,00 net + 200,00 KDV
        $breakdown = VatCalculator::fromGross($this->lira(120000), 2000);

        $this->assertSame(100000, $breakdown->net->minor);
        $this->assertSame(20000, $breakdown->vat->minor);
        $this->assertSame(120000, $breakdown->gross->minor);
    }

    public function test_gross_extraction_with_a_null_rate_leaves_the_amount_whole(): void
    {
        $breakdown = VatCalculator::fromGross($this->lira(120000), null);

        $this->assertSame(120000, $breakdown->net->minor);
        $this->assertSame(0, $breakdown->vat->minor);
        $this->assertFalse($breakdown->isVatApplicable());
    }

    /**
     * Küsuratlı ayrıştırma: 100,00 TL brüt @ %20.
     * 10000 × 10000 / 12000 = 8333,33… → 8333 (yarım altı, aşağı)
     * KDV = 10000 − 8333 = 1667
     */
    public function test_gross_extraction_rounds_the_fraction(): void
    {
        $breakdown = VatCalculator::fromGross($this->lira(10000), 2000);

        $this->assertSame(8333, $breakdown->net->minor);
        $this->assertSame(1667, $breakdown->vat->minor);
    }

    // --------------------------------------------------------- yuvarlama

    /**
     * Küsurat KALEM BAZINDA yuvarlanır.
     * 33,33 TL @ %20 → 3333 × 2000 / 10000 = 666,6 → 667
     */
    public function test_a_fractional_vat_amount_is_rounded_half_up(): void
    {
        $breakdown = VatCalculator::fromNet($this->lira(3333), 2000);

        $this->assertSame(667, $breakdown->vat->minor);
        $this->assertSame(4000, $breakdown->gross->minor);
    }

    public function test_a_fraction_below_the_half_rounds_down(): void
    {
        // 1,11 TL @ %1 → 111 × 100 / 10000 = 1,11 → 1
        $breakdown = VatCalculator::fromNet($this->lira(111), 100);

        $this->assertSame(1, $breakdown->vat->minor);
    }

    // ------------------------------------------------------- uç durumlar

    public function test_a_zero_amount_produces_zero_vat(): void
    {
        $breakdown = VatCalculator::fromNet($this->lira(0), 2000);

        $this->assertSame(0, $breakdown->net->minor);
        $this->assertSame(0, $breakdown->vat->minor);
        $this->assertSame(0, $breakdown->gross->minor);
    }

    /**
     * Büyük ama GÜVENLİ değer: sonuç hâlâ tam sayı, hâlâ kayıpsız.
     */
    public function test_it_handles_a_large_but_safe_amount(): void
    {
        // 1.000.000.000,00 TL @ %20
        $breakdown = VatCalculator::fromNet($this->lira(100_000_000_000), 2000);

        $this->assertSame(20_000_000_000, $breakdown->vat->minor);
        $this->assertSame(120_000_000_000, $breakdown->gross->minor);
        $this->assertIsInt($breakdown->vat->minor);
    }

    /**
     * Negatif tutar geçerlidir (iade kalemi) ve KDV'si de negatiftir.
     */
    public function test_a_negative_amount_produces_negative_vat(): void
    {
        $breakdown = VatCalculator::fromNet($this->lira(-100000), 2000);

        $this->assertSame(-20000, $breakdown->vat->minor);
        $this->assertSame(-120000, $breakdown->gross->minor);
    }

    public function test_it_rejects_a_negative_rate(): void
    {
        $this->expectException(InvalidArgumentException::class);

        VatCalculator::fromNet($this->lira(100000), -100);
    }

    // ---------------------------------------------------------- invariant

    /**
     * DEĞİŞMEZ KURAL: net + KDV = brüt. Her iki yönde de.
     *
     * Bu kural bozulursa belge toplamı kalem toplamlarını tutturmaz ve
     * aradaki farkı kapatmak için "denkleştirme kuruşu" uydurmak gerekir
     * — playbook §10.2 uydurma finansal sonucu yasaklıyor.
     */
    public function test_net_plus_vat_always_equals_gross_from_net(): void
    {
        foreach ([0, 1, 99, 100, 3333, 100000, 999999] as $minor) {
            foreach ([null, 0, 100, 1000, 2000] as $rate) {
                $breakdown = VatCalculator::fromNet($this->lira($minor), $rate);

                $this->assertSame(
                    $breakdown->gross->minor,
                    $breakdown->net->minor + $breakdown->vat->minor,
                    "net + KDV ≠ brüt (tutar: $minor, oran: ".var_export($rate, true).')',
                );
            }
        }
    }

    public function test_net_plus_vat_always_equals_gross_from_gross(): void
    {
        foreach ([0, 1, 99, 10000, 120000, 999999] as $minor) {
            foreach ([null, 0, 100, 1000, 2000] as $rate) {
                $breakdown = VatCalculator::fromGross($this->lira($minor), $rate);

                $this->assertSame(
                    $breakdown->gross->minor,
                    $breakdown->net->minor + $breakdown->vat->minor,
                    "net + KDV ≠ brüt (brüt: $minor, oran: ".var_export($rate, true).')',
                );
                $this->assertSame($minor, $breakdown->gross->minor);
            }
        }
    }

    public function test_the_currency_is_preserved_across_the_breakdown(): void
    {
        $breakdown = VatCalculator::fromNet($this->lira(100000), 2000);

        $this->assertSame(Currency::TurkishLira, $breakdown->net->currency);
        $this->assertSame(Currency::TurkishLira, $breakdown->vat->currency);
        $this->assertSame(Currency::TurkishLira, $breakdown->gross->currency);
    }

    // -------------------------------------------------------- determinizm

    public function test_it_is_deterministic(): void
    {
        $first = VatCalculator::fromNet($this->lira(3333), 2000);

        for ($i = 0; $i < 100; $i++) {
            $repeat = VatCalculator::fromNet($this->lira(3333), 2000);

            $this->assertSame($first->net->minor, $repeat->net->minor);
            $this->assertSame($first->vat->minor, $repeat->vat->minor);
            $this->assertSame($first->gross->minor, $repeat->gross->minor);
        }
    }

    // ---------------------------------------------------- açıklanabilirlik

    /**
     * Sonuç GİRDİLERİNİ TAŞIR.
     *
     * Playbook kontrol listesi: "finansal hesaplamalar açıklanabilir".
     * Kullanıcıya yalnızca "KDV: 667" demek yetmez; hangi tutardan,
     * hangi oranla, hangi yönde ve nasıl yuvarlanarak çıktığı da
     * taşınabilmelidir. Bu dizi ileride API yanıtının kaynağı olacak —
     * ama burada hiçbir HTTP bilgisi yoktur, saf veridir.
     */
    public function test_the_breakdown_carries_its_own_inputs(): void
    {
        $breakdown = VatCalculator::fromNet($this->lira(3333), 2000);

        $this->assertInstanceOf(VatBreakdown::class, $breakdown);
        $this->assertSame(VatBreakdown::SOURCE_NET, $breakdown->source);
        $this->assertSame(2000, $breakdown->vatRateBp);

        $this->assertSame(
            [
                'source' => 'net',
                'currency' => 'TRY',
                'vat_rate_bp' => 2000,
                'vat_applicable' => true,
                'rounding' => 'half_up',
                'net_minor' => 3333,
                'vat_minor' => 667,
                'gross_minor' => 4000,
            ],
            $breakdown->toArray(),
        );
    }

    public function test_the_breakdown_reports_the_gross_source(): void
    {
        $breakdown = VatCalculator::fromGross($this->lira(120000), 2000);

        $this->assertSame(VatBreakdown::SOURCE_GROSS, $breakdown->source);
        $this->assertSame('gross', $breakdown->toArray()['source']);
    }
}
