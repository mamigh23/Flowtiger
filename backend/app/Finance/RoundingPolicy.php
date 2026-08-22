<?php

namespace App\Finance;

use InvalidArgumentException;

/**
 * Kesirin tam sayıya döndüğü TEK YER.
 *
 * Projede bu deseni izleyen bir örnek zaten var: parola politikası
 * AppServiceProvider'da BİR KEZ tanımlanıp iki ayrı FormRequest
 * tarafından paylaşılıyor — politika değiştiğinde iki uç birlikte
 * değişiyor, birinin sessizce eskimesi mümkün değil. Yuvarlama da aynı
 * sebeple tek kaynaktan gelir: iki yerde yuvarlayan bir sistem, bir gün
 * iki farklı toplam üretir ve hangisinin doğru olduğu bilinemez.
 *
 * MOD: YARIM YUKARI, SIFIRDAN UZAĞA (half-up, away from zero).
 *
 * Bankacı yuvarlaması (yarımı en yakın çifte) istatistiksel sapmayı
 * azaltır ama AÇIKLANAMAZ: aynı oran ve aynı tutar bazen yukarı bazen
 * aşağı gider. Playbook §10.3 mali sonuçların açıklanabilir olmasını
 * şart koşuyor. "0,5 yukarı gider" cümlesi kurulabilir; "0,5 bazen
 * aşağı gider" cümlesi kurulamaz.
 *
 * Sıfırdan uzağa yuvarlama, işaret simetrisini garanti eder:
 * round(−x) === −round(x). Bir iade belgesi aslının kuruşu kuruşuna
 * aynadaki görüntüsü olur.
 *
 * ARİTMETİK TAMAMEN TAM SAYIDIR. round(), floor(), intval() gibi float
 * üzerinden geçen hiçbir fonksiyon kullanılmaz; kesinlik kaybı olasılığı
 * hiç doğmaz. PHP'de taşan bir tam sayı işlemi sessizce float'a döner —
 * bu yüzden her ara sonuç is_float() ile denetlenir ve taşma yanlış bir
 * sayı döndürmek yerine istisna üretir.
 */
final class RoundingPolicy
{
    /**
     * Yanıtlarda taşınabilmesi için: "nasıl yuvarlandı?" sorusunun
     * cevabı hesabın kendisiyle birlikte gitmeli (§A5).
     */
    public const MODE = 'half_up';

    /**
     * round($numerator / $denominator) — yarım yukarı, sıfırdan uzağa.
     *
     * $denominator DAİMA POZİTİFTİR. İşareti paydaya taşımak, aynı
     * bölmenin iki farklı yazımını mümkün kılar ve yuvarlama yönünü
     * belirsizleştirirdi.
     */
    public static function divide(int $numerator, int $denominator): int
    {
        if ($denominator <= 0) {
            throw new InvalidArgumentException(
                'Yuvarlama böleni pozitif olmalıdır; verilen: '.$denominator
            );
        }

        $isNegative = $numerator < 0;

        // PHP_INT_MIN'in mutlak değeri int'e sığmaz ve float'a döner.
        $absolute = $isNegative ? -$numerator : $numerator;

        if (is_float($absolute)) {
            throw new InvalidArgumentException('Yuvarlama girdisi tam sayı aralığını aştı.');
        }

        $doubledNumerator = 2 * $absolute;
        $doubledDenominator = 2 * $denominator;
        $shifted = is_float($doubledNumerator) ? $doubledNumerator : $doubledNumerator + $denominator;

        if (is_float($shifted) || is_float($doubledDenominator)) {
            throw new InvalidArgumentException('Yuvarlama ara sonucu tam sayı aralığını aştı.');
        }

        // +denominator kaydırması, tam yarımı bir üst tam sayıya taşır.
        $rounded = intdiv($shifted, $doubledDenominator);

        return $isNegative ? -$rounded : $rounded;
    }

    /**
     * round($amount × $multiplier / $divisor) — ölçekli tek adım.
     *
     * Çarpma ve bölme AYNI işlemde yapılır; ara sonuç asla dışarı
     * çıkmaz. Çağıranın elinde hiçbir zaman yuvarlanmamış bir kesir
     * bulunmaz — bulunsaydı, onu ikinci kez yuvarlama ihtimali doğardı.
     */
    public static function scale(int $amount, int $multiplier, int $divisor): int
    {
        $product = $amount * $multiplier;

        if (is_float($product)) {
            throw new InvalidArgumentException('Ölçekleme çarpımı tam sayı aralığını aştı.');
        }

        return self::divide($product, $divisor);
    }
}
