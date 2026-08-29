<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Görev üzerindeki iş kuralı ihlalleri (Task/Planning v1).
 *
 * FinanceEntryException ve PaymentException ile aynı desen: bunlar YETKİ
 * hatası DEĞİLDİR — isteği yapanın yetkisi tamdır, policy zaten
 * geçmiştir. Kaydın DURUMU işleme izin vermiyor. Bu yüzden 403 değil 422;
 * ayrım makine-okunur `errorCode` ile yapılır.
 *
 * HTTP karşılığı bootstrap/app.php'de atanır; exception sınıfı HTTP
 * katmanını tanımaz.
 */
class TaskException extends RuntimeException
{
    private function __construct(
        string $message,
        public readonly string $errorCode,
        public readonly int $status = 422,
    ) {
        parent::__construct($message);
    }

    /**
     * Tamamlanmış bir görev ikinci kez tamamlanamaz.
     *
     * Sessizce başarılı dönmek ilk tamamlanma anını ÜZERİNE YAZARDI —
     * yani "bu iş ne zaman bitti" sorusunun cevabı, ikinci bir tıklamayla
     * değişirdi.
     */
    public static function alreadyCompleted(): self
    {
        return new self(
            'Bu görev zaten tamamlanmış.',
            'task_already_completed',
        );
    }

    /**
     * Açık bir görev yeniden açılamaz.
     *
     * Sessizce başarılı dönmek, kullanıcıya olmayan bir değişikliği
     * yapılmış gibi göstermek olurdu.
     */
    public static function notCompleted(): self
    {
        return new self(
            'Bu görev zaten açık.',
            'task_not_completed',
        );
    }
}
