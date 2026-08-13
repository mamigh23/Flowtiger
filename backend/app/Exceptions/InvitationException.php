<?php

namespace App\Exceptions;

use App\Enums\InvitationStatus;
use RuntimeException;

/**
 * Davet akışının reddedilme sebepleri.
 *
 * Her sebep kendi HTTP durumunu ve makine-okunur kodunu taşır; eşleme
 * bootstrap/app.php'de tek bir render callback'iyle yapılır. Böylece
 * "hangi red neye karşılık gelir" sorusu tek bir dosyada, yan yana
 * okunabilir hâlde durur.
 *
 * DURUM SEÇİMLERİ:
 *
 *   404 — Böyle bir davet yok. Token uydurulmuş ya da silinmiş.
 *   410 — Davet VARDI ama artık kullanılamaz (kabul edilmiş, iptal
 *         edilmiş, süresi dolmuş). 410 Gone tam olarak bunu anlatır:
 *         "bu kaynak vardı, kalıcı olarak geçti". 403 dönmek "yetkin
 *         yok" derdi ki yanlış olurdu — davetli kişinin yetkisi tamdı,
 *         zamanı geçti.
 *   403 — Kimlik uyuşmuyor ya da giriş yapılması gerekiyor.
 *   422 — Kullanıcı zaten üye; istek biçimsel olarak doğru ama sonucu
 *         anlamsız.
 *
 * Token bu sınıfın mesajlarına ASLA girmez (§31): exception mesajları
 * loglanır.
 */
class InvitationException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status,
        public readonly string $errorCode,
    ) {
        parent::__construct($message);
    }

    public static function notFound(): self
    {
        return new self(
            'Davet bulunamadı.',
            404,
            'invitation_not_found',
        );
    }

    /**
     * Davet var ama kullanılabilir durumda değil.
     */
    public static function notUsable(InvitationStatus $status): self
    {
        return new self(
            "Davet artık kullanılamaz (durum: {$status->value}).",
            410,
            'invitation_'.$status->value,
        );
    }

    /**
     * Davet edilen e-postanın zaten bir hesabı var; sahibi giriş yapmalı.
     *
     * Sızan bir davet linkinin, hesabın sahibinden habersiz o hesabı bir
     * şirkete bağlamasını engeller.
     */
    public static function authenticationRequired(): self
    {
        return new self(
            'Bu davet, davet edilen e-postaya ait hesapla giriş yapıldıktan sonra kabul edilebilir.',
            403,
            'invitation_requires_authentication',
        );
    }

    /**
     * Giriş yapmış kullanıcının e-postası davetinkiyle uyuşmuyor.
     */
    public static function emailMismatch(): self
    {
        return new self(
            'Bu davet başka bir e-posta adresi için oluşturulmuş.',
            403,
            'invitation_email_mismatch',
        );
    }

    /**
     * Kullanıcı zaten bu şirketin üyesi.
     *
     * Davet KABUL EDİLMEZ ve tüketilmez. Kabul edip rolü güncellemek,
     * rol değiştirme yetkisini (Faz 4) davet üzerinden atlatmanın yolu
     * olurdu: bir üyeye "owner" daveti gönderip kabul ettirmek, yetki
     * yükseltmenin arka kapısına dönüşürdü.
     */
    public static function alreadyMember(): self
    {
        return new self(
            'Bu kullanıcı zaten şirketin üyesi.',
            422,
            'invitation_already_member',
        );
    }
}
