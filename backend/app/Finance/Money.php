<?php

namespace App\Finance;

use App\Enums\Currency;
use InvalidArgumentException;

/**
 * Bir para tutarı — tam sayı MINOR UNIT (kuruş) + para birimi.
 *
 * NEDEN ONDALIK DEĞİL (Finance Foundation §A1):
 * Tutar dört katmandan geçiyor ve hepsinde kayıpsız olmak zorunda.
 *
 *   PostgreSQL  numeric var                    ✅
 *   PHP 8.3     bcmath/decimal YOK             ❌ float'a düşer
 *   Dart 3.13   ondalık tip yok, double var    ❌
 *   TypeScript  number = IEEE754               ❌
 *
 * Dördünün kesişimindeki tek kayıpsız tip 64-bit tam sayıdır. Ondalık
 * seçmek PHP'ye yeni bağımlılık eklemeyi ve Dart/TS tarafında elle
 * ondalık sınıfı yazmayı zorunlu kılardı.
 *
 * ALAN ADI BİRİMİ TAŞIR: `*_minor`. `amount` gibi belirsiz bir ad, bir
 * gün birinin lira sanmasına ve yüz kat hatalı bir kayıt girmesine yol
 * açar.
 *
 * NEGATİF DEĞER YASAK DEĞİLDİR. Kalan bakiye fazla tahsilatta eksiye
 * düşer; iade belgesi eksi tutar taşır. Negatifliği yasaklamak TİPİN
 * değil ALANIN işidir — hangi sütunun eksi olamayacağını veritabanı
 * CHECK kısıtı söyler. Tipe koysaydık geçerli bir ara sonuç
 * üretilemezdi.
 *
 * BÖLME YOKTUR. Her bölme bir yuvarlama kararıdır ve o karar tek bir
 * yerde yaşamalıdır (RoundingPolicy). Buraya bölme eklemek, yuvarlama
 * politikasını sessizce ikiye bölerdi.
 */
final readonly class Money
{
    /**
     * JSON'da güvenle taşınabilen en büyük tam sayı: 2^53 − 1.
     *
     * JavaScript'in Number tipi bu sınıra kadar tam sayıyı kayıpsız
     * taşır; üstünde sessizce bozulur. Bozulmayı yanıt anında değil,
     * DEĞERİN OLUŞTUĞU anda engellemek gerekir — yanıt katmanında
     * yakalamak, veritabanına çoktan yazılmış bozuk bir kaydı kurtarmaz.
     *
     * Kuruş cinsinden ~90 trilyon TL'ye karşılık gelir; hedef kullanıcı
     * için erişilemez bir tavan.
     */
    public const MAX_SAFE_MINOR = 9007199254740991;

    private function __construct(
        public int $minor,
        public Currency $currency,
    ) {}

    public static function of(int $minor, Currency $currency): self
    {
        if ($minor > self::MAX_SAFE_MINOR || $minor < -self::MAX_SAFE_MINOR) {
            throw new InvalidArgumentException(
                'Tutar güvenli tam sayı aralığının dışında: '.$minor
            );
        }

        return new self($minor, $currency);
    }

    public static function zero(Currency $currency): self
    {
        return new self(0, $currency);
    }

    public function plus(self $other): self
    {
        $this->assertSameCurrency($other);

        // Her iki taraf da MAX_SAFE ile sınırlı olduğundan toplam int
        // aralığından taşamaz; aralık ihlalini of() yakalar.
        return self::of($this->minor + $other->minor, $this->currency);
    }

    public function minus(self $other): self
    {
        $this->assertSameCurrency($other);

        return self::of($this->minor - $other->minor, $this->currency);
    }

    public function times(int $factor): self
    {
        $product = $this->minor * $factor;

        if (is_float($product)) {
            throw new InvalidArgumentException('Çarpım tam sayı aralığını aştı.');
        }

        return self::of($product, $this->currency);
    }

    public function isZero(): bool
    {
        return $this->minor === 0;
    }

    public function isNegative(): bool
    {
        return $this->minor < 0;
    }

    public function equals(self $other): bool
    {
        return $this->minor === $other->minor && $this->currency === $other->currency;
    }

    /**
     * Farklı para birimleri toplanamaz.
     *
     * Bu kural MVP'de tek para birimi olsa bile ŞİMDİDEN vardır: tutarın
     * yanındaki para birimi bir etiket değil, aritmetiğin parçasıdır.
     * Çoklu para birimi geldiğinde değişecek hiçbir çağrı kodu olmayacak.
     */
    private function assertSameCurrency(self $other): void
    {
        if ($this->currency !== $other->currency) {
            throw new InvalidArgumentException(
                'Farklı para birimleri toplanamaz: '
                .$this->currency->value.' ve '.$other->currency->value
            );
        }
    }
}
