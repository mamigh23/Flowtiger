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
 *        → gönderilen mail'in gövdesindeki KABUL BAĞLANTISININ İÇİNE yazılır
 *        → bellekten düşer
 *
 * P1-05: Token artık e-postada AYRI bir kopyala-yapıştır kodu olarak
 * GÖSTERİLMEZ — yalnızca frontend'in davet kabul ekranına (?token=...)
 * götüren tıklanabilir bağlantının İÇİNDE, url-encode edilmiş hâliyle
 * yaşar (bkz. acceptUrl()). Bu, "tek yer" kuralını BOZMAZ: token hâlâ
 * yalnızca bu sınıfın ürettiği gövdede var olur, sadece SUNUM şekli
 * değişir.
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
                'acceptUrl' => $this->acceptUrl(),
                'expiresAt' => $this->invitation->expires_at,
            ],
        );
    }

    /**
     * Davet kabul bağlantısı — config/flowtiger.php'deki `{token}` şablonu
     * url-encode edilmiş plaintext token ile doldurulur.
     *
     * urlencode() BİLİNÇLİ: token bir SORGU PARAMETRESİ olarak taşınır
     * (?token=...), yol segmenti olarak değil — password_reset.url'ün
     * e-posta yer tutucusuyla (?email={email}) AYNI konum, AYNI fonksiyon.
     * Token şu an yalnızca [0-9a-f] karakterlerinden oluşsa da (bkz.
     * InvitationService::generateToken()) encode adımı üretim biçimine
     * bağımlı kalmaz — token formatı ileride değişse bile bağlantı geçerli
     * kalır.
     */
    private function acceptUrl(): string
    {
        return str_replace(
            '{token}',
            urlencode($this->plainToken),
            (string) config('flowtiger.invitations.accept_url'),
        );
    }
}
