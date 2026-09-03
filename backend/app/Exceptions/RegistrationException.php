<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Self-servis kaydın reddedilme sebepleri (P0-01).
 *
 * InvitationException/TaskException/PaymentException/FinanceEntryException
 * ile AYNI desen: durum ve makine-okunur kod exception'ın kendisinde
 * taşınır, HTTP'ye çevirme tek bir yerde (bootstrap/app.php) yapılır.
 *
 * TEK SEBEP: e-posta, FORM DOĞRULAMASI GEÇTİKTEN SONRA ama transaction
 * COMMIT OLMADAN ÖNCE başka bir istek tarafından alınmış (yarış durumu —
 * RegisterRequest'teki `unique:users` kuralı TOCTOU'ya karşı korumaz; aynı
 * anda gelen iki istek ikisi de doğrulamayı geçebilir). Bu durumda
 * users.email UNIQUE kısıtı veritabanı seviyesinde zaten devrede olduğu
 * için veri asla bozulmaz — burada yapılan şey yalnızca o ham
 * QueryException'ı kullanıcıya anlamlı bir 422'ye çevirmektir; 500
 * DÖNMEK YANILTICI olurdu (sunucu hatası değil, öngörülen bir çakışma).
 */
class RegistrationException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status,
        public readonly string $errorCode,
    ) {
        parent::__construct($message);
    }

    public static function emailAlreadyRegistered(): self
    {
        return new self(
            'Bu e-posta adresiyle kayıt az önce tamamlandı.',
            422,
            'email_already_registered',
        );
    }
}
