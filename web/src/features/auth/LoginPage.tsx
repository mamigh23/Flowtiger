import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError, toUserMessage } from '@/lib/api';
import { Button, Card, ErrorState, Input, PasswordInput } from '@/components/ui';

/**
 * Giriş ekranı.
 *
 * Hata gösterimi merkezi kurallara dayanır:
 *   422 → alan bazlı hatalar
 *   429 → Retry-After ile bekleme mesajı
 *   401 → backend'in tek tip mesajı; e-posta var/yok ayrımı YAPILMAZ
 *         (backend de yapmıyor — hesap sayımını engellemek için)
 *   5xx → nötr mesaj; sunucu ayrıntısı kullanıcıya gösterilmez
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  /**
   * Çift gönderim koruması.
   *
   * Yalnızca `submitting` state'ine güvenmek yetmez: React state
   * güncellemesi asenkrondur ve hızlı iki tıklama aynı karede iki istek
   * üretebilir. Ref senkron olarak okunur.
   */
  const inFlight = useRef(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/app';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current) return;
    inFlight.current = true;

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.isValidation) {
        setFieldErrors({
          email: error.fieldError('email'),
          password: error.fieldError('password'),
        });
      } else {
        setFormError(toUserMessage(error));
      }

      // Parola arayüzde bırakılmaz: başarısız denemeden sonra ekranda
      // asılı kalan bir parola, omuz üstü okumaya ve otomatik
      // doldurmanın yanlış kaydetmesine açık kalır.
      setPassword('');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="ft-auth">
      <Card className="ft-auth__card">
        <form className="ft-stack" onSubmit={handleSubmit} noValidate>
          <header className="ft-auth__header">
            <span className="ft-auth__mark" aria-hidden="true">
              FT
            </span>
            <h1 className="ft-auth__title">FlowTiger</h1>
            <p className="ft-muted">Devam etmek için giriş yapın.</p>
          </header>

          {formError && <ErrorState message={formError} />}

          <Input
            label="E-posta"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            required
          />

          <PasswordInput
            label="Parola"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            required
          />

          <Button type="submit" loading={submitting}>
            Giriş yap
          </Button>
        </form>
      </Card>
    </div>
  );
}
