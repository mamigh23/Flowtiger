import { useState } from 'react';
import { api, endpoints, toUserMessage } from '@/lib/api';
import { Badge, Button, Card, ErrorState } from '@/components/ui';
import type { User } from '@/types/api';

/**
 * E-posta doğrulama — YALNIZCA "yeniden gönder" tarafı.
 *
 * GET /auth/email/verify/{id}/{hash} burada YOKTUR: kimlik doğrulaması
 * olmayan, imzalı bir uçtur ve bağlantı mail istemcisinden tıklanır.
 * Üstelik backend'de o bağlantı için bir frontend URL şablonu tanımlı
 * değil — link doğrudan API'ye gidiyor. Bunu arayüzde taklit etmek,
 * olmayan bir akışı varmış gibi göstermek olurdu.
 *
 * GÖVDE BOŞ GÖNDERİLİR. Hedef adres parametresi yoktur ve olmamalı:
 * kullanıcı yalnızca KENDİ adresi için bağlantı ister. Başkasının
 * adresini hedefleyen bir alan, "bu adres sistemde kayıtlı mı?"
 * sorusunu herkese açık hâle getirirdi.
 *
 * KARAR `code` ALANINA GÖRE VERİLİR, MESAJ METNİNE GÖRE DEĞİL. Backend
 * metni bir gün değişebilir (dil, noktalama, kelime); metin eşleştiren
 * bir arayüz o gün sessizce yanlış davranır. Gösterilen metinler de
 * buradan gelir, yanıttan değil.
 *
 * ZATEN DOĞRULANMIŞ HESAP HATA DEĞİLDİR: yanıt 200'dür. Arayüz bunu bir
 * hata gibi göstermez; istenen sonuç (adres doğrulanmış olsun) zaten
 * sağlanmış durumda.
 */
const SENT_MESSAGE = 'Doğrulama bağlantısı e-posta adresinize gönderildi.';
const ALREADY_VERIFIED_MESSAGE = 'E-posta adresiniz zaten doğrulanmış.';

export function EmailVerificationCard({ profile }: { profile: User }) {
  /**
   * "Backend zaten doğrulanmış dedi."
   *
   * Sahte bir zaman damgası üretilmez: `email_verified_at`'in gerçek
   * değerini bilmiyoruz ve uydurmak, audit'e bakan birine yanlış bilgi
   * vermek olurdu. Bilinen tek şey bu boole.
   *
   * Adres değişince bu işaret sıfırlanmalıdır; sıfırlamayı ProfilePage
   * kartı `key={profile.email}` ile yeniden kurarak yapar.
   */
  const [alreadyVerified, setAlreadyVerified] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);

  const verified = alreadyVerified || profile.email_verified_at !== null;

  async function send() {
    setSending(true);
    setError(null);
    setMessage(null);

    try {
      // Gövde YOK — endpoints.auth.sendVerificationEmail gövdesiz POST atar.
      const result = await endpoints.auth.sendVerificationEmail(api);

      if (result.code === 'already_verified') {
        setAlreadyVerified(true);
        setMessage(ALREADY_VERIFIED_MESSAGE);
      } else {
        setMessage(SENT_MESSAGE);
      }
    } catch (caught) {
      // 429 buraya düşer: sınır 6/dk ve toUserMessage backend'in
      // Retry-After başlığındaki saniyeyi kullanır. Uydurma bir bekleme
      // süresi üretilmez.
      setError(caught);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <h2 className="ft-section__title">E-posta doğrulama</h2>

      <p className="ft-muted">{profile.email}</p>

      <p data-testid="verification-status">
        <Badge tone={verified ? 'neutral' : 'accent'}>
          {verified ? 'Doğrulandı' : 'Doğrulama bekliyor'}
        </Badge>
      </p>

      {error !== null && <ErrorState message={toUserMessage(error)} />}

      {/* Başarı bir ALERT DEĞİLDİR. */}
      {message !== null && error === null && <p className="ft-muted">{message}</p>}

      {!verified && (
        <div className="ft-form__actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void send()}
            loading={sending}
          >
            Doğrulama bağlantısı gönder
          </Button>
        </div>
      )}
    </Card>
  );
}
