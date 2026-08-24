<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Ödeme üzerindeki iş kuralı ihlalleri (Faz 7 / Adım 4).
 *
 * FinanceEntryException ile aynı desen: bunlar YETKİ hatası DEĞİLDİR —
 * isteği yapanın yetkisi tamdır, policy zaten geçmiştir. Kaydın DURUMU
 * işleme izin vermiyor. Bu yüzden 403 değil 422; ayrım makine-okunur
 * `errorCode` ile yapılır.
 *
 * HTTP karşılığı bootstrap/app.php'de atanır; exception sınıfı HTTP
 * katmanını tanımaz.
 */
class PaymentException extends RuntimeException
{
    private function __construct(
        string $message,
        public readonly string $errorCode,
        public readonly int $status = 422,
    ) {
        parent::__construct($message);
    }

    /**
     * İptal edilmiş bir ödeme değiştirilemez.
     */
    public static function voided(): self
    {
        return new self(
            'İptal edilmiş bir ödeme değiştirilemez.',
            'payment_voided',
        );
    }

    /**
     * İptal TERMİNALDİR: sessizce başarılı dönmek, ilk iptalin zamanını
     * ve sebebini üzerine yazma riski doğururdu.
     */
    public static function alreadyVoided(): self
    {
        return new self(
            'Bu ödeme zaten iptal edilmiş.',
            'payment_already_voided',
        );
    }

    /**
     * Dağıtım toplamı ödeme tutarını aşamaz.
     *
     * FormRequest bunu zaten yakalıyor; buradaki, eşzamanlı iki isteğin
     * aynı ödemeyi aynı anda güncellemesine karşı son savunma.
     */
    public static function overAllocated(): self
    {
        return new self(
            'Dağıtım toplamı ödeme tutarını aşamaz.',
            'payment_over_allocated',
        );
    }
}
