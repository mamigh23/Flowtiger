import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError, toUserMessage } from '@/lib/api';
import { Button, Card, ErrorState, Input } from '@/components/ui';

/**
 * Giriş ekranı.
 *
 * Hata gösterimi merkezi kurallara dayanır:
 *   422 → alan bazlı hatalar
 *   429 → bekleme mesajı (Retry-After ile)
 *   401 → backend'in tek tip "kimlik bilgileri hatalı" mesajı;
 *         e-posta var mı yok mu ayrımı YAPILMAZ, backend de yapmıyor.
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/app';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.isValidation) {
        setFieldErrors({
          email: error.fieldError('email') ?? '',
          password: error.fieldError('password') ?? '',
        });
      } else {
        setFormError(toUserMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ft-centered">
      <Card>
        <form className="ft-stack" onSubmit={handleSubmit} style={{ minWidth: '20rem' }} noValidate>
          <div>
            <h1 style={{ fontSize: 'var(--ft-font-size-xl)' }}>FlowTiger</h1>
            <p className="ft-muted">Devam etmek için giriş yapın.</p>
          </div>

          {formError && <ErrorState message={formError} />}

          <Input
            label="E-posta"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email || undefined}
            required
          />

          <Input
            label="Parola"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password || undefined}
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
