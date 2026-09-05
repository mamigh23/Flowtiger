import { useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ErrorState, Input, useFocusFirstInvalidFieldOnError } from '@/components/ui';
import type { Role } from '@/types/api';
import { invitationErrorMessage, invitationFieldError } from './invitationErrors';

/**
 * Davet gönderme.
 *
 * GÖVDE `{email, role}` — `name` DEĞİL. Davet edilen kişinin adı bu
 * aşamada bilinmez; adını kendisi kabul ekranında girer.
 *
 * ENUMERATION KORUMASI: backend, kayıtlı bir adresi davet etmekle
 * kayıtsızı davet etmeyi AYNI yanıtla karşılar. Arayüz de "bu kullanıcı
 * zaten kayıtlı" gibi bir ayrım yapmaz — yapsaydı backend'in özenle
 * kapattığı bilgi sızıntısını geri açardı.
 *
 * Yanıtta `token` YOKTUR ve burada hiçbir yerde beklenmez; plaintext
 * token yalnızca gönderilen mailde yaşar.
 */
export function InviteMemberPage() {
  const navigate = useNavigate();
  const roleFieldId = useId();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // P1-06: submit başarısız olduğunda odağı ilk geçersiz alana taşır.
  useFocusFirstInvalidFieldOnError(error);

  // Çift gönderim koruması ref ile: state güncellemesi asenkrondur ve
  // hızlı iki tıklama arasında henüz uygulanmamış olabilir.
  const inFlight = useRef(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (inFlight.current) return;
    inFlight.current = true;

    setSubmitting(true);
    setError(null);

    try {
      await endpoints.invitations.create(api, { email: email.trim(), role });
      navigate('/app/invitations', { replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const emailError = invitationFieldError(error, 'email');

  // `invitation_already_member` 422 döner ama `errors` taşımaz; alan
  // altında gösterilemez, form seviyesinde gösterilir.
  const formError = error && !emailError ? invitationErrorMessage(error) : null;

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">Davet gönder</h1>
      </header>

      <Card>
        <form onSubmit={handleSubmit} noValidate>
          {formError && <ErrorState message={formError} />}

          <Input
            label="E-posta"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
            autoComplete="off"
          />

          <div className="ft-field">
            <label className="ft-field__label" htmlFor={roleFieldId}>
              Rol
            </label>
            <select
              id={roleFieldId}
              className="ft-input"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {/* Seçenekler Role tipiyle sınırlı; başka bir değer backend'de
                  zaten Rule::enum ile reddedilir. */}
              <option value="member">Üye</option>
              <option value="owner">Sahip</option>
            </select>
          </div>

          <div className="ft-form__actions">
            <Button type="submit" loading={submitting}>
              Davet gönder
            </Button>
            <Link className="ft-button ft-button--ghost" to="/app/invitations">
              Vazgeç
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
