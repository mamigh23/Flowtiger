import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError, api, endpoints, toUserMessage } from '@/lib/api';
import {
  Button,
  Card,
  ErrorState,
  Input,
  PasswordInput,
  useFocusFirstInvalidFieldOnError,
} from '@/components/ui';
import { FlowTigerMark } from '@/features/brand/FlowTigerMark';

/** Backend'in tek tip "geçersiz/süresi dolmuş/kullanılmış token" kodu. */
const INVALID_TOKEN_CODE = 'invalid_password_reset_token';

/**
 * Yeni parola belirleme — e-postadaki bağlantının hedefi (herkese açık).
 *
 * BAĞLANTI BİÇİMİ BACKEND'DEN GELİR, burada uydurulmadı:
 *   config('flowtiger.password_reset.url')
 *     = "<taban>/password/reset/{token}?email={email}"
 *   (AppServiceProvider::configurePasswordResetLink yer tutucuları
 *   doldurur; e-posta urlencode edilir). Rota bu yüzden
 *   `/password/reset/:token` ve e-posta `?email=` ile okunur.
 *
 * SÖZLEŞME (PasswordResetController::reset, ResetPasswordRequest):
 *   POST /auth/password/reset
 *   gövde: { email, token, password, password_confirmation }
 *   200 → { message, code: 'password_reset_completed' } — backend TÜM
 *         oturumları kapatır (bu cihazdaki dahil).
 *   422 + errors → alan hataları (email / token / password; `confirmed`
 *         hatası da `password` altında gelir)
 *   422 + code=invalid_password_reset_token, errors YOK → geçersiz,
 *         süresi dolmuş, kullanılmış ya da e-postayla eşleşmeyen token.
 *         Backend bunları BİLEREK ayırmaz (her ayrım hesabın varlığını
 *         sızdırırdı); ekran da ayırmaz, "yeni bağlantı isteyin" der.
 *   429 → throttle:password-reset (e-posta + IP, dakikada 5)
 *
 * ÖNİZLEME UCU YOKTUR: token'ın geçerliliği ancak gönderimde öğrenilir.
 *
 * TOKEN: yalnızca rota parametresinden okunur ve YALNIZCA POST gövdesinde
 * gönderilir. localStorage/sessionStorage'a yazılmaz, konsola yazılmaz,
 * ekranda gösterilmez, başka bir URL'e ya da router state'ine taşınmaz.
 *
 * BAŞARIDAN SONRA: bu tarayıcıda açık bir oturum varsa sunucuda zaten
 * iptal edildi; mevcut `logout()` ile yerel oturum da kapatılır (aksi
 * halde /login, PublicOnlyRoute yüzünden kullanıcıyı ölü bir oturumla
 * /app'e geri atardı). Sonra /login'e gidilir; giriş ekranı bilgi
 * notunu gösterir ve e-postayı doldurur. OTOMATİK GİRİŞ YOK: yanıtta
 * token yoktur ve olmamalıdır.
 */
export function ResetPasswordPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const { status: authStatus, logout } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // P1-06: submit başarısız olduğunda odağı ilk geçersiz alana taşır.
  useFocusFirstInvalidFieldOnError(error);

  // Çift gönderim koruması (bkz. LoginPage).
  const inFlight = useRef(false);

  const isValidation = error instanceof ApiError && error.isValidation;
  const emailError = isValidation ? error.fieldError('email') : undefined;
  const passwordError = isValidation ? error.fieldError('password') : undefined;
  // Token'ın alanı yok (gizli değer ekranda gösterilmez); hatası form
  // seviyesinde okunur.
  const tokenError = isValidation ? error.fieldError('token') : undefined;

  const invalidToken = error instanceof ApiError && error.code === INVALID_TOKEN_CODE;

  // Geçersiz token'da backend'in kendi mesajı gösterilir (toUserMessage
  // 4xx için onu döndürür); 429/5xx/ağ hataları merkezi kurallardan.
  const formError =
    error === null || emailError || passwordError ? null : (tokenError ?? toUserMessage(error));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current) return;
    inFlight.current = true;

    setSubmitting(true);
    setError(null);

    try {
      await endpoints.auth.resetPassword(api, {
        email: email.trim(),
        token,
        password,
        password_confirmation: confirmation,
      });

      // Sunucu tüm oturumları kapattı; yerel oturum da kapanır. logout()
      // sunucuya ulaşamasa bile yerel token'ı temizler.
      if (authStatus === 'authenticated') {
        await logout();
      }

      navigate('/login', {
        replace: true,
        state: { passwordReset: true, email: email.trim() },
      });
    } catch (caught) {
      setError(caught);
    } finally {
      // Parolalar arayüzde bırakılmaz (başarıda da, hatada da).
      setPassword('');
      setConfirmation('');
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="ft-auth ft-recovery">
      <Card className="ft-auth__card">
        <form className="ft-stack" onSubmit={handleSubmit} noValidate>
          <header className="ft-auth__header">
            <FlowTigerMark size="md" />
            <span className="ft-recovery__eyebrow">Parola sıfırlama</span>
            <h1 className="ft-auth__title">Yeni parola belirleyin</h1>
            <p className="ft-muted">
              Yeni parolanızı iki kez girin. Kaydettiğinizde açık tüm oturumlarınız kapatılır.
            </p>
          </header>

          {formError && <ErrorState message={formError} />}

          {/* Token işe yaramıyorsa atılacak tek anlamlı adım: yeni bağlantı. */}
          {invalidToken && (
            <p className="ft-recovery__next">
              <Link
                className="ft-recovery__link"
                to="/password/forgot"
                state={email.trim() ? { email: email.trim() } : undefined}
              >
                Yeni sıfırlama bağlantısı isteyin
              </Link>{' '}
              — bağlantılar sınırlı süre geçerlidir ve yalnızca bir kez kullanılabilir.
            </p>
          )}

          <Input
            label="E-posta"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus={!email}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
            required
          />

          <PasswordInput
            label="Yeni parola"
            name="password"
            autoComplete="new-password"
            autoFocus={Boolean(email)}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={passwordError}
            required
          />

          <PasswordInput
            label="Yeni parola (tekrar)"
            name="password_confirmation"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />

          <Button type="submit" loading={submitting}>
            Parolayı sıfırla
          </Button>

          <p className="ft-muted ft-recovery__footer">
            Parolanızı hatırladınız mı? <Link to="/login">Giriş yapın</Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
