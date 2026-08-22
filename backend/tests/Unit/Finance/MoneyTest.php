<?php

namespace Tests\Unit\Finance;

use App\Enums\Currency;
use App\Finance\Money;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/**
 * Para değerinin taşıyıcısı.
 *
 * TEK TEMSİL: tam sayı MINOR UNIT (kuruş). Ondalık ya da kayan nokta
 * hiçbir katmanda kullanılmaz — PHP'de bcmath yok (composer.json),
 * Dart'ta ve TypeScript'te ondalık tip yok. Dört katmanın hepsinde
 * kayıpsız olan tek tip 64-bit tam sayıdır (Finance Foundation §A1).
 *
 * NEGATİF DEĞER YASAK DEĞİLDİR. `minus()` kalan bakiyeyi hesaplarken
 * eksiye düşebilir; iade belgesi de eksi tutar taşır. Negatifliği
 * yasaklamak TİPİN değil, ALANIN işidir: hangi sütunun eksi olamayacağı
 * veritabanı CHECK kısıtıyla söylenir. Tipe koysaydık, geçerli bir ara
 * hesap sonucu üretilemez hâle gelirdi.
 *
 * BÖLME YOKTUR. Bölme her zaman bir yuvarlama kararı doğurur ve o karar
 * tek bir yerde yaşamalıdır (RoundingPolicy). Money'ye bölme eklemek,
 * yuvarlama politikasını sessizce ikiye bölerdi.
 */
class MoneyTest extends TestCase
{
    public function test_it_carries_an_integer_minor_amount(): void
    {
        $money = Money::of(123456, Currency::TurkishLira);

        $this->assertSame(123456, $money->minor);
        $this->assertSame(Currency::TurkishLira, $money->currency);
    }

    public function test_zero_is_representable(): void
    {
        $money = Money::zero(Currency::TurkishLira);

        $this->assertSame(0, $money->minor);
        $this->assertTrue($money->isZero());
        $this->assertFalse($money->isNegative());
    }

    public function test_it_adds_without_losing_precision(): void
    {
        $sum = Money::of(100000, Currency::TurkishLira)
            ->plus(Money::of(20000, Currency::TurkishLira));

        $this->assertSame(120000, $sum->minor);
    }

    /**
     * Çıkarma EKSİYE DÜŞEBİLİR ve bu bir hata değildir: fazla tahsilat
     * yapılmış bir belgenin kalanı negatiftir.
     */
    public function test_subtraction_may_produce_a_negative_amount(): void
    {
        $remaining = Money::of(100000, Currency::TurkishLira)
            ->minus(Money::of(150000, Currency::TurkishLira));

        $this->assertSame(-50000, $remaining->minor);
        $this->assertTrue($remaining->isNegative());
    }

    public function test_it_multiplies_by_an_integer_factor(): void
    {
        $total = Money::of(2550, Currency::TurkishLira)->times(3);

        $this->assertSame(7650, $total->minor);
    }

    /**
     * Farklı para birimleri toplanamaz.
     *
     * Bu kural MVP'de tek para birimi olsa bile ŞİMDİDEN vardır: tutarın
     * yanındaki para birimi bir etiket değil, aritmetiğin parçasıdır
     * (§A2). Çoklu para birimi geldiğinde değişecek hiçbir çağrı kodu
     * olmayacak.
     */
    public function test_amounts_in_different_currencies_cannot_be_combined(): void
    {
        $this->expectException(InvalidArgumentException::class);

        Money::of(100, Currency::TurkishLira)->plus(Money::of(100, Currency::Euro));
    }

    /**
     * JSON'da güvenle taşınamayacak bir değer sisteme HİÇ GİRMEZ.
     *
     * JavaScript'in Number tipi 2^53'e kadar tam sayıyı kayıpsız taşır.
     * Üstündeki bir değer web istemcisine ulaştığında sessizce bozulur;
     * bozulmayı yanıt anında değil, kaydın oluştuğu anda engellemek
     * gerekir.
     */
    public function test_it_rejects_amounts_beyond_the_safe_integer_range(): void
    {
        $this->expectException(InvalidArgumentException::class);

        Money::of(Money::MAX_SAFE_MINOR + 1, Currency::TurkishLira);
    }

    public function test_it_accepts_the_largest_safe_amount(): void
    {
        $money = Money::of(Money::MAX_SAFE_MINOR, Currency::TurkishLira);

        $this->assertSame(9007199254740991, $money->minor);
        $this->assertIsInt($money->minor);
    }

    public function test_it_rejects_negative_amounts_beyond_the_safe_range(): void
    {
        $this->expectException(InvalidArgumentException::class);

        Money::of(-Money::MAX_SAFE_MINOR - 1, Currency::TurkishLira);
    }

    /**
     * Taşma sessizce float'a dönüşmemeli.
     *
     * PHP'de PHP_INT_MAX + 1 bir float üretir ve aritmetik sessizce
     * kesinliğini kaybeder. Toplama sonucu güvenli aralığın dışına
     * çıkıyorsa istisna atılır — yanlış bir sayı döndürmektense hata
     * vermek yeğdir.
     */
    public function test_addition_that_overflows_the_safe_range_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);

        Money::of(Money::MAX_SAFE_MINOR, Currency::TurkishLira)
            ->plus(Money::of(1, Currency::TurkishLira));
    }

    public function test_multiplication_that_overflows_the_safe_range_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);

        Money::of(Money::MAX_SAFE_MINOR, Currency::TurkishLira)->times(2);
    }

    public function test_equality_covers_both_amount_and_currency(): void
    {
        $lira = Money::of(100, Currency::TurkishLira);

        $this->assertTrue($lira->equals(Money::of(100, Currency::TurkishLira)));
        $this->assertFalse($lira->equals(Money::of(101, Currency::TurkishLira)));
        $this->assertFalse($lira->equals(Money::of(100, Currency::Euro)));
    }

    /**
     * Değer nesnesi DEĞİŞMEZDİR: her işlem yeni bir örnek döndürür.
     */
    public function test_operations_do_not_mutate_the_original(): void
    {
        $original = Money::of(1000, Currency::TurkishLira);
        $original->plus(Money::of(500, Currency::TurkishLira));

        $this->assertSame(1000, $original->minor);
    }
}
