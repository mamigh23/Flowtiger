import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError, toUserMessage } from '@/lib/api';
import { Button, Card, ErrorState, Input, PasswordInput, useFocusFirstInvalidFieldOnError } from '@/components/ui';
import { FlowTigerMark } from '@/features/brand/FlowTigerMark';

/**
 * Kayıt ekranı (P0-03) — self-servis kayıt + ilk şirket kurulumu.
 *
 * LoginPage ile AYNI iskelet ve AYNI hata kuralları kullanılır; tek fark
 * 401 yerine `email_already_registered`in var olmasıdır:
 *
 *   422 + `errors`                         → alan bazlı hatalar
 *   422 + `email_already_registered` (errors YOK) → backend'in kendi,
 *     gösterime uygun mesajı form seviyesinde (bkz.
 *     backend/app/Exceptions/RegistrationException.php — mesajları TAM
 *     BU AMAÇLA yazıldı, token/e-posta/kullanıcı kimliği içermezler)
 *   429                                     → Retry-After ile bekleme
 *     mesajı (merkezi kural, `toUserMessage`)
 *   5xx / ağ hatası                         → nötr mesaj (merkezi kural)
 *
 * BACKEND AUTHORITATIVE'DİR: gövde yalnızca name/email/password/
 * company_name taşır. role, company_id, active_company_id istemciden
 * hiç GÖNDERİLMEZ — `RegisterRequest` bunları zaten tanımlamıyor,
 * gönderilse de sessizce yok sayılırdı. Yanıttaki `user.active_company_id`
 * de olduğu gibi AuthContext'e aktarılır; istemci burada bir tenant/rol
 * kararı ÜRETMEZ (§9, §21).
 *
 * Token yalnızca `AuthContext.register` → `tokenStorage` üzerinden
 * saklanır — LoginPage'deki AYNI tek nokta. Bu bileşen storage API'sini
 * hiç doğrudan çağırmaz.
 */
export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    company_name?: string;
  }>({});

  // P1-06: submit başarısız olduğunda odağı ilk geçersiz alana taşır.
  useFocusFirstInvalidFieldOnError(fieldErrors);

  /**
   * Çift gönderim koruması — LoginPage'deki AYNI gerekçe: yalnızca
   * `submitting` state'ine güvenmek yetmez, React güncellemesi
   * asenkrondur ve hızlı iki tıklama aynı karede iki istek üretebilir.
   * Ref senkron olarak okunur.
   */
  const inFlight = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current) return;
    inFlight.current = true;

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      await register(name.trim(), email.trim(), password, companyName.trim());
      navigate('/app', { replace: true });
    } catch (error) {
      // `errors` VARSA gerçek doğrulama hatasıdır (422 + alan listesi).
      // YOKSA — `email_already_registered` tam olarak böyle gelir —
      // bir alanı işaretlemeye çalışmak yanlış bir alanı suçlardı; bu
      // durumda backend'in kendi mesajı form seviyesinde gösterilir.
      if (error instanceof ApiError && error.isValidation && error.errors) {
        setFieldErrors({
          name: error.fieldError('name'),
          email: error.fieldError('email'),
          password: error.fieldError('password'),
          company_name: error.fieldError('company_name'),
        });
      } else {
        setFormError(toUserMessage(error));
      }

      // Parola arayüzde bırakılmaz — LoginPage'deki AYNI gerekçe:
      // başarısız denemeden sonra ekranda asılı kalan bir parola, omuz
      // üstü okumaya ve otomatik doldurmanın yanlış kaydetmesine açıktır.
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
            <FlowTigerMark size="md" />
            <h1 className="ft-auth__title">FlowTiger</h1>
            <p className="ft-muted">Hesabınızı ve şirketinizi oluşturun.</p>
          </header>

          {formError && <ErrorState message={formError} />}

          <Input
            label="Ad Soyad"
            name="name"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors.name}
            required
          />

          <Input
            label="E-posta"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            required
          />

          <PasswordInput
            label="Parola"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            required
          />

          <Input
            label="Şirket Adı"
            name="company_name"
            autoComplete="organization"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            error={fieldErrors.company_name}
            required
          />

          <Button type="submit" loading={submitting}>
            Kayıt ol
          </Button>

          <p className="ft-muted">
            Zaten hesabınız var mı? <Link to="/login">Giriş yapın</Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
