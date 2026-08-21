import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, api, endpoints, toUserMessage } from '@/lib/api';
import { Button, Card, ErrorState, PasswordInput } from '@/components/ui';

/**
 * Parola değiştirme.
 *
 * GÖVDE TAM OLARAK ÜÇ ALAN:
 *   current_password, new_password, new_password_confirmation
 *
 * Kimlik parametresi YOKTUR: üzerinde işlem yapılan kullanıcı daima
 * oturumdan gelir. `email` ya da `user_id` eklemek, kimliğin gövdeden
 * gelebileceği izlenimi doğururdu.
 *
 * YANLIŞ MEVCUT PAROLA 422 DÖNER, 401 DEĞİL — ve bu ayrım burada
 * hayatidir. Kullanıcının kimliği doğrulanmış durumda; hatalı olan tek
 * şey gönderdiği alan. 401 sanılıp oturum kapatılsaydı, parolasını
 * yanlış yazan kullanıcı sistemden atılırdı. Bu kod hiçbir yerde oturum
 * kapatmaz; 401 zaten merkezî olarak ApiClient'ta ele alınır.
 *
 * OTURUM ETKİSİ: backend mevcut token'ı KORUR, diğerlerini iptal eder.
 * Yanıttaki `other_logins_revoked` gösterilir — "hesabım ele geçirilmiş
 * miydi" sorusunu araştıran kullanıcı için tek anlamlı sinyal odur.
 *
 * 429 GERÇEKTİR (6/dk): `current_password` kuralı bu ucu, oturumu ele
 * geçirmiş ama parolayı bilmeyen bir saldırgan için parola DENEME
 * yüzeyine çevirir. Bekleme süresi backend'in Retry-After başlığından
 * gelir; uydurulmaz.
 *
 * PAROLA HİÇBİR YERE YAZILMAZ: ne log'a, ne URL'e, ne de başarıdan
 * sonra DOM'a. Alanlar başarıda temizlenir.
 */
export function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const [result, setResult] = useState<{ message: string; other_logins_revoked: number } | null>(
    null,
  );
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValidation = error instanceof ApiError && error.isValidation;
  const currentError = isValidation ? error.fieldError('current_password') : undefined;

  // `confirmed` ve `different` kurallarının hataları da new_password
  // alanında döner; üçü aynı yerde gösterilir.
  const nextError = isValidation ? error.fieldError('new_password') : undefined;

  const formError =
    error === null || (isValidation && (currentError || nextError)) ? null : toUserMessage(error);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await endpoints.profile.changePassword(api, {
        current_password: current,
        new_password: next,
        new_password_confirmation: confirmation,
      });

      setResult(response);

      // Parola DOM'da gereğinden uzun durmaz.
      setCurrent('');
      setNext('');
      setConfirmation('');
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="ft-section__title">Parola</h2>

      {formError !== null && <ErrorState message={formError} />}

      {/* Başarı bir ALERT DEĞİLDİR. */}
      {result !== null && formError === null && (
        <p data-testid="password-result" className="ft-muted">
          {result.message}{' '}
          {result.other_logins_revoked > 0
            ? `Diğer ${result.other_logins_revoked} oturum kapatıldı.`
            : 'Başka açık oturumunuz yoktu.'}
        </p>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <PasswordInput
          label="Mevcut parola"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          error={currentError}
          autoComplete="current-password"
        />

        <PasswordInput
          label="Yeni parola"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          error={nextError}
          autoComplete="new-password"
        />

        <PasswordInput
          label="Yeni parola (tekrar)"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="new-password"
        />

        <div className="ft-form__actions">
          <Button type="submit" loading={submitting}>
            Parolayı değiştir
          </Button>
        </div>
      </form>
    </Card>
  );
}
