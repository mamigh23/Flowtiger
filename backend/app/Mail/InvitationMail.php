<?php

namespace App\Mail;

use App\Models\Invitation;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Davet e-postası.
 *
 * PLAINTEXT TOKEN'IN VAR OLDUĞU TEK YER BURASIDIR.
 *
 * Token veritabanına yazılmaz (yalnızca SHA-256 hash'i), API yanıtında
 * dönmez, audit'e girmez, loglanmaz. Yaşam döngüsü şudur:
 *
 *   InvitationService::create() üretir
 *        → bu Mailable'a verilir
 *        → gönderilen mail'in gövdesine yazılır
 *        → bellekten düşer
 *
 * Bu yüzden sınıf BİLİNÇLİ OLARAK ShouldQueue DEĞİLDİR: kuyruğa alınsaydı
 * token, serialize edilerek jobs tablosuna — yani kalıcı depolamaya —
 * yazılırdı. Gerçek gönderim altyapısı kurulduğunda bu kararın yeniden
 * ele alınması gerekir (kuyruk şifreleme, kısa ömürlü job, vb.).
 *
 * Gerçek bir mail sağlayıcısı bu fazda kurulmaz (§28); geliştirme
 * ortamında MAIL_MAILER=log olduğu için mail log'a düşer, testlerde
 * Mail::fake() ile yakalanır.
 */
class InvitationMail extends Mailable
{
    public function __construct(
        public readonly Invitation $invitation,
        #[\SensitiveParameter] public readonly string $plainToken,
        public readonly string $companyName,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "{$this->companyName} sizi FlowTiger'a davet etti",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.invitation',
            with: [
                'companyName' => $this->companyName,
                'role' => $this->invitation->role->value,
                'token' => $this->plainToken,
                'expiresAt' => $this->invitation->expires_at,
            ],
        );
    }
}
