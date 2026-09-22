import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, api, endpoints, toUserMessage } from '@/lib/api';
import { Button, Card, ErrorState, Input, useFocusFirstInvalidFieldOnError } from '@/components/ui';
import { FlowTigerMark } from '@/features/brand/FlowTigerMark';

/**
 * "Parolamı unuttum" — sıfırlama bağlantısı isteme (herkese açık).
 *
 * SÖZLEŞME (backend: PasswordResetController::sendResetLink,
 * ForgotPasswordRequest):
 *   POST /auth/password/forgot   gövde: { email }
 *   200 → { message, code: 'password_reset_link_requested' }
 *   422 → `errors.email` (zorunlu / biçim / en fazla 255)
 *   429 → throttle:password-forgot (e-posta + IP, dakikada 5)
 *
 * YANIT HESABIN VAR OLUP OLMADIĞINI SÖYLEMEZ ve bu ekran da söylemez.
 * Backend kayıtlı ve kayıtsız adres için BİRE BİR aynı 200'ü döndürür
 * (enumeration koruması). Burada "e-posta gönderildi" gibi kesin bir
 * cümle kurmak, backend'in bilerek saklamadığı bir bilgiyi uydurmak
 * olurdu; gösterilen metin backend'in kendi koşullu cümlesidir ("... bir
 * hesap varsa ...").
 *
 * E-posta trim edilir, küçük harfe ÇEVRİLMEZ: normalizasyon backend'in
 * tek noktasıdır (ForgotPasswordRequest::prepareForValidation).
 *
 * Giriş ekranında yazılmış bir adres varsa router state'iyle gelir ve
 * alanı doldurur — yalnızca kolaylık; hiçbir yere kalıcı yazılmaz.
 */
export function ForgotPasswordPage() {
  const location = useLocation();

  const [email, setEmail] = useState(() => initialEmail(location.state));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  // P1-06: submit başarısız olduğunda odağı ilk geçersiz alana taşır.
  useFocusFirstInvalidFieldOnError(error);

  // Çift gönderim koruması (bkz. LoginPage): state asenkron, ref senkron.
  const inFlight = useRef(false);

  const emailError =
    error instanceof ApiError && error.isValidation ? error.fieldError('email') : undefined;
  const formError = error !== null && !emailError ? toUserMessage(error) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current) return;
    inFlight.current = true;

    setSubmitting(true);
    setError(null);

    try {
      const result = await endpoints.auth.forgotPassword(api, email.trim());
      setSentMessage(result.message);
    } catch (caught) {
      setError(caught);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (sentMessage !== null) {
    return (
      <div className="ft-auth ft-recovery">
        <Card className="ft-auth__card">
          <div className="ft-stack">
            <header className="ft-auth__header">
              <FlowTigerMark size="md" />
              <span className="ft-recovery__eyebrow">Parola sıfırlama</span>
              <h1 className="ft-auth__title">Gelen kutunuzu kontrol edin</h1>
            </header>

            {/* Başarı bir ALERT DEĞİLDİR: role="alert" yalnızca gerçek hataya ait. */}
            <p className="ft-notice" role="status">
              {sentMessage}
            </p>

            <p className="ft-muted ft-recovery__lead">
              Bağlantı birkaç dakika içinde gelmezse istenmeyen e-posta klasörünü kontrol edin.
              Bağlantı sınırlı bir süre geçerlidir ve yalnızca bir kez kullanılabilir.
            </p>

            <div className="ft-recovery__actions">
              <Link className="ft-button ft-button--primary" to="/login">
                Giriş sayfasına dön
              </Link>

              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSentMessage(null);
                  setError(null);
                }}
              >
                Başka bir e-posta gir
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="ft-auth ft-recovery">
      <Card className="ft-auth__card">
        <form className="ft-stack" onSubmit={handleSubmit} noValidate>
          <header className="ft-auth__header">
            <FlowTigerMark size="md" />
            <span className="ft-recovery__eyebrow">Parola sıfırlama</span>
            <h1 className="ft-auth__title">Parolanızı mı unuttunuz?</h1>
            <p className="ft-muted">
              Hesabınızın e-posta adresini girin; parolanızı sıfırlamanız için bir bağlantı
              gönderelim.
            </p>
          </header>

          {formError && <ErrorState message={formError} />}

          <Input
            label="E-posta"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
            required
          />

          <Button type="submit" loading={submitting}>
            Sıfırlama bağlantısı gönder
          </Button>

          <p className="ft-muted ft-recovery__footer">
            Parolanızı hatırladınız mı? <Link to="/login">Giriş yapın</Link>
          </p>
        </form>
      </Card>
    </div>
  );
}

/** Giriş ekranından router state'iyle gelen adres; yalnızca string kabul edilir. */
function initialEmail(state: unknown): string {
  const email = (state as { email?: unknown } | null)?.email;
  return typeof email === 'string' ? email : '';
}
