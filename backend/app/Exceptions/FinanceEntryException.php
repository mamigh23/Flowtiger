<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Finans kaydı üzerindeki iş kuralı ihlalleri (Faz 7 / Adım 3).
 *
 * Bunlar YETKİ hataları DEĞİLDİR — isteği yapanın yetkisi tamdır, policy
 * zaten geçmiştir. Kaydın DURUMU işleme izin vermiyor. Bu yüzden 403
 * değil 422 dönerler; ayrım makine-okunur `errorCode` ile yapılır
 * (LastOwnerException ve InvitationException ile aynı yaklaşım).
 *
 * Mesajlar istemciye GÖNDERİLİR ve bu bilinçlidir: kullanıcıya
 * gösterilmeye uygun yazılmışlardır, hiçbir kimlik ya da iç ayrıntı
 * içermezler. Buraya yeni bir sebep eklenirken aynı kural geçerlidir.
 *
 * HTTP karşılığı bootstrap/app.php'de atanır; exception sınıfı HTTP
 * katmanını tanımaz.
 */
class FinanceEntryException extends RuntimeException
{
    private function __construct(
        string $message,
        public readonly string $errorCode,
        public readonly int $status = 422,
    ) {
        parent::__construct($message);
    }

    /**
     * İptal edilmiş bir kayıt değiştirilemez.
     *
     * Değiştirilebilseydi iptal bir işaretten ibaret kalır ve kaydın
     * tutarları iptalden sonra da oynatılabilirdi — yani iptalin hiçbir
     * koruyucu değeri olmazdı.
     */
    public static function voided(): self
    {
        return new self(
            'İptal edilmiş bir finans kaydı değiştirilemez.',
            'finance_entry_voided',
        );
    }

    /**
     * İptal TERMİNALDİR.
     *
     * Sessizce başarılı dönmek, ilk iptalin zamanını ve sebebini üzerine
     * yazma riski doğururdu.
     */
    public static function alreadyVoided(): self
    {
        return new self(
            'Bu finans kaydı zaten iptal edilmiş.',
            'finance_entry_already_voided',
        );
    }
}
