<?php

namespace App\Enums;

/**
 * Para birimi.
 *
 * MVP YALNIZCA TRY KULLANIR. Kalıcı katmanda bu kısıt veritabanı CHECK
 * kısıtıyla uygulanacaktır (Finance Foundation §A2); enum'ın ikinci bir
 * üye taşıması o kararı gevşetmez.
 *
 * PEKİ NEDEN İKİNCİ ÜYE VAR:
 * "Farklı para birimleri toplanamaz" kuralı, tek üyeli bir enum'la test
 * EDİLEMEZ — kuralı ihlal edecek bir değer üretilemez. Kural test
 * edilemezse bir gün sessizce kaybolur. İkinci üye, MVP'de saklanmaz;
 * yalnızca aritmetiğin para birimini gerçekten kontrol ettiğini
 * kanıtlar.
 *
 * PARA BİRİMİ TUTARIN YANINDA TAŞINIR (transaction-level), yalnızca
 * şirket ayarında değil. Şirket bir gün varsayılanını değiştirirse,
 * geçmiş kayıtlar sessizce yeniden yorumlanmamalıdır.
 */
enum Currency: string
{
    case TurkishLira = 'TRY';

    case Euro = 'EUR';

    /**
     * Bir birimde kaç minor unit var?
     *
     * Kuruş/cent için 100. Bu değer YUVARLAMA İÇİN KULLANILMAZ —
     * saklanan tutar zaten minor unit'tir ve daha küçük bir birime
     * bölünmez. Yalnızca görüntüleme ve doğrulama içindir.
     */
    public function minorUnitsPerUnit(): int
    {
        return 100;
    }

    /**
     * MVP'de kalıcı katmanda izin verilen tek para birimi.
     */
    public static function mvpDefault(): self
    {
        return self::TurkishLira;
    }

    /**
     * Validation ve DB constraint'i için geçerli değerler.
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $currency): string => $currency->value, self::cases());
    }
}
