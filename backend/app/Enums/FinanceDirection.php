<?php

namespace App\Enums;

/**
 * Bir finans kaydının yönü: para giriyor mu, çıkıyor mu?
 *
 * TEK TABLO, İKİ YÖN. Gelir ve gider ayrı tablolar DEĞİLDİR: alanların
 * neredeyse tamamı ortak ve her rapor ikisini birlikte istiyor. İki tablo,
 * her sorguyu iki kez yazmak ve her yeni alanı iki yere eklemek demekti.
 *
 * YÖN İŞARETİ TUTARDA DEĞİL BURADA TAŞINIR. `net_minor` daima pozitiftir
 * (veritabanı CHECK kısıtıyla). Eksi tutarlı bir 'out' kaydı ile artı
 * tutarlı bir 'in' kaydı aynı şeyi iki farklı biçimde anlatırdı ve her
 * rapor ikisini birden düşünmek zorunda kalırdı.
 */
enum FinanceDirection: string
{
    /** Para girişi — gelir. */
    case In = 'in';

    /** Para çıkışı — gider. */
    case Out = 'out';

    /**
     * Validation ve DB constraint'i için geçerli değerler.
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $direction): string => $direction->value, self::cases());
    }
}
