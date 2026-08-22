<?php

namespace App\Finance;

use InvalidArgumentException;

/**
 * KDV hesabı — saf, durumsuz, veritabanından bağımsız.
 *
 * ORAN BASIS POINT'TİR: yüzde × 100. %20 → 2000, %1 → 100, %0 → 0.
 * Yüzdeyi int tutmak %8,5 gibi bir oranı temsil edilemez kılardı;
 * decimal tutmak Money'de reddedilen ondalık sorununu geri getirirdi
 * (Finance Foundation §A4).
 *
 * FORMÜLLER:
 *   net → KDV:  vat  = round(net × rate_bp / 10000)
 *               brüt = net + vat
 *
 *   brüt → net: net  = round(brüt × 10000 / (10000 + rate_bp))
 *               vat  = brüt − net
 *
 * BRÜT AYRIŞTIRMADA KDV ÇIKARMA İLE BULUNUR, ayrıca hesaplanmaz. İki
 * ayrı yuvarlama yapılsaydı net + KDV ≠ brüt olabilir ve belge toplamı
 * kalem toplamlarını tutturmazdı — aradaki farkı kapatmak için
 * "denkleştirme kuruşu" uydurmak gerekirdi. Playbook §10.2 uydurma
 * finansal sonucu yasaklıyor.
 *
 * YUVARLAMA KALEM BAZINDADIR ve yalnızca burada, RoundingPolicy
 * üzerinden olur. Belge toplamı kalemlerin toplamıdır; bağımsız
 * hesaplanmaz.
 *
 * DİKKAT — MEVZUAT DOĞRULAMASI BEKLİYOR:
 * Kalem bazında yuvarlama mühendislik açısından tutarlıdır, ancak
 * hangi kuralın YASAL BAĞLAYICI olduğu e-belge sağlayıcı şartnamesiyle
 * doğrulanmalıdır. Playbook §6.3 e-belge entegrasyonunun mevzuata göre
 * ayrıca planlanacağını söylüyor; bu doğrulama AŞAMA 8'den önce
 * yapılmalıdır.
 */
final class VatCalculator
{
    /** Basis point ölçeği: 10000 bp = %100. */
    private const SCALE = 10000;

    public static function fromNet(Money $net, ?int $vatRateBp): VatBreakdown
    {
        self::assertValidRate($vatRateBp);

        if ($vatRateBp === null) {
            return self::notApplicable(VatBreakdown::SOURCE_NET, $net);
        }

        $vat = Money::of(
            RoundingPolicy::scale($net->minor, $vatRateBp, self::SCALE),
            $net->currency,
        );

        return new VatBreakdown(
            source: VatBreakdown::SOURCE_NET,
            net: $net,
            vat: $vat,
            gross: $net->plus($vat),
            vatRateBp: $vatRateBp,
        );
    }

    public static function fromGross(Money $gross, ?int $vatRateBp): VatBreakdown
    {
        self::assertValidRate($vatRateBp);

        if ($vatRateBp === null) {
            return self::notApplicable(VatBreakdown::SOURCE_GROSS, $gross);
        }

        $net = Money::of(
            RoundingPolicy::scale($gross->minor, self::SCALE, self::SCALE + $vatRateBp),
            $gross->currency,
        );

        return new VatBreakdown(
            source: VatBreakdown::SOURCE_GROSS,
            net: $net,
            // Çıkarma ile: net + vat = brüt değişmezi böylece kurulumdan
            // gelir, sonradan doğrulanması gereken bir iddia olmaz.
            vat: $gross->minus($net),
            gross: $gross,
            vatRateBp: $vatRateBp,
        );
    }

    /**
     * Kayıt KDV bilgisi taşımıyor: tutar olduğu gibi geçer.
     *
     * KDV sıfır GÖSTERİLİR ama oran null kalır — aritmetiğin her yerde
     * null kontrolü yapmasını önlemek için tutar sıfırdır, anlamı ise
     * `isVatApplicable()` üzerinden okunur.
     */
    private static function notApplicable(string $source, Money $amount): VatBreakdown
    {
        return new VatBreakdown(
            source: $source,
            net: $amount,
            vat: Money::zero($amount->currency),
            gross: $amount,
            vatRateBp: null,
        );
    }

    /**
     * Negatif oran anlamsızdır.
     *
     * Üst sınır BİLİNÇLİ OLARAK KONMADI: "makul en yüksek oran" bir ürün
     * kararıdır ve burada uydurulamaz. Taşmaya karşı koruma zaten
     * RoundingPolicy ve Money tarafında var.
     */
    private static function assertValidRate(?int $vatRateBp): void
    {
        if ($vatRateBp !== null && $vatRateBp < 0) {
            throw new InvalidArgumentException(
                'KDV oranı negatif olamaz; verilen: '.$vatRateBp
            );
        }
    }
}
