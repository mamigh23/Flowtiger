import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { ApiError, api, endpoints } from '@/lib/api';
import {
  Button,
  Card,
  ErrorState,
  Input,
  LoadingScreen,
  PasswordInput,
  useFocusFirstInvalidFieldOnError,
} from '@/components/ui';
import { FlowTigerMark } from '@/features/brand/FlowTigerMark';
import { roleLabel } from '@/lib/company/roleLabel';
import type { Invitation } from '@/types/api';
import { acceptInvitationErrorMessage, acceptInvitationFieldError } from './invitationAcceptErrors';

/**
 * Davet KABUL ekranı — herkese açık (`/invitations/accept`).
 *
 * GİRİŞ NOKTASI DAVET BAĞLANTISIDIR. Davet e-postası
 * (`resources/views/mail/invitation.blade.php`) artık ham kod değil,
 * `config('flowtiger.invitations.accept_url')` ile kurulan bir bağlantı
 * gönderiyor: `FRONTEND_URL/invitations/accept?token=…`. Ekran token'ı
 * sorgu parametresinden okur ve "Davet kodu" alanına yerleştirir; alan
 * yine de düzenlenebilir kalır (bağlantısı bozulan ya da kodu elle
 * yapıştıran kullanıcı için).
 *
 * ÖNİZLEME UCU YOKTUR. Backend'de token ile davet okuyan bir GET ucu
 * bulunmuyor; davetin geçersiz/süresi dolmuş/iptal edilmiş olduğu ancak
 * kabul isteğinin yanıtından öğrenilir. İstemci bunu "tahmin" etmez ve
 * yeni bir uç uydurmaz: durum, POST'un 404/410 yanıtıyla gösterilir.
 *
 * KİMLİK DALLANMASI BACKEND'İN AYNASI:
 *   giriş yapmamış  → ad + parola da gönderilir (bu istek aynı zamanda
 *                     kayıt formudur), `authenticated: false`
 *   giriş yapmış    → yalnızca token gönderilir, `authenticated: true`
 *                     (Bearer token eklenir)
 * Bu ayrım `InvitationAcceptRequest`teki `requiredIf`/`prohibitedIf`
 * kurallarının BİREBİR karşılığıdır (bkz. backend). Misafir /register'a
 * GÖNDERİLMEZ: o uç yeni bir şirket kurar; davetlinin hesabı bu formla,
 * davetin e-posta adresiyle açılır.
 *
 * 403'LER ÇIKMAZ SOKAK DEĞİL:
 *   invitation_requires_authentication → "Giriş yapın" bağlantısı,
 *     dönüş adresi olarak bu ekranı (`state.from`) taşır; giriş sonrası
 *     LoginPage `safeRedirect` ile buraya geri döner ve kullanıcı daveti
 *     o hesapla onaylar.
 *   invitation_email_mismatch → "Farklı hesapla devam et" mevcut
 *     `logout()`'u çağırır; ekran misafir dalına düşer, token state'te
 *     kalır.
 * Hangi hesabın uygun olduğuna istemci KARAR VERMEZ; yalnızca backend'in
 * verdiği kararın sonraki adımını sunar.
 *
 * 410 (iptal/kabul edilmiş/süresi dolmuş) SON DURUMDUR: aynı token'la
 * yeniden denemek anlamsız olduğu için form yerine yönlendirici bir kart
 * gösterilir. 404 ise formu korur (kod yanlış yazılmış olabilir).
 *
 * BAŞARI SONRASI:
 *   misafir  → yanıtta token/oturum alanı YOKTUR ve e-posta maskeli gelir;
 *              istemci kendi kendine giriş yapamaz. "Şimdi giriş yapın"
 *              kartı gösterilir (AYRI bir `/auth/login` çağrısı).
 *   kimlikli → `useCompanies().reload()` ve `/app`. Aktif şirket backend
 *              tarafından DEĞİŞTİRİLMEZ; hangi şirketin seçileceğine
 *              mevcut `RequireActiveCompany` / `CompanySelectPage` mantığı
 *              karar verir. İstemci YENİ bir seçim/rol kararı ÜRETMEZ.
 *
 * Token React state'inde yaşar; localStorage'a YAZILMAZ, konsola
 * LOGLANMAZ. Giriş dönüşü için yalnızca kullanıcının zaten açtığı
 * bağlantı adresi (aynı `?token=`) router state'ine konur — yeni bir
 * URL'e ya da elle yazılmış bir koda taşınmaz.
 */
export function AcceptInvitationPage() {
  const { status: authStatus, user, logout } = useAuth();
  const { reload: reloadCompanies } = useCompanies();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Bağlantıdan gelen token İLK render'da okunur ve sabit kalır: giriş
  // dönüş adresi yalnızca bu değerden kurulur, alana elle yazılandan
  // DEĞİL.
  const [linkToken] = useState(() => searchParams.get('token')?.trim() ?? '');
  const [token, setToken] = useState(() => searchParams.get('token') ?? '');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<Invitation | null>(null);

  // P1-06: submit başarısız olduğunda odağı ilk geçersiz alana taşır.
  useFocusFirstInvalidFieldOnError(error);

  // Çift gönderim koruması: state güncellemesi asenkrondur, hızlı iki
  // tıklama arasında henüz uygulanmamış olabilir (bkz. InviteMemberPage).
  const inFlight = useRef(false);

  // 'loading' sırasında form gösterilmez: o an giriş yapmış mı değil mi
  // bilinmeden ad/parola alanlarını göstermek ya da gizlemek yanlış
  // dallanma olurdu.
  if (authStatus === 'loading') {
    return <LoadingScreen />;
  }

  const isAuthenticated = authStatus === 'authenticated';

  // Giriş ekranına giderken dönüş adresi: bu ekranın kendisi. Değer
  // yalnızca uygulama içi bir yol olabilir ve LoginPage onu yine
  // `safeRedirect`ten geçirir.
  const returnTo = linkToken
    ? `/invitations/accept?token=${encodeURIComponent(linkToken)}`
    : '/invitations/accept';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current) return;
    inFlight.current = true;

    setSubmitting(true);
    setError(null);

    // Backend'in kendi dallanma anahtarı `$request->user('sanctum')`;
    // burada AYNI anı yakalayan yerel karşılığı kullanılır. Sunucudan
    // dönen 200/201 farkına bakılmaz (ApiClient zaten bunu dışarı
    // sızdırmaz) — ikisi de aynı gövdeyi taşır.
    const wasAuthenticated = isAuthenticated;

    try {
      const accepted = await endpoints.invitations.accept(
        api,
        wasAuthenticated
          ? { token: token.trim() }
          : { token: token.trim(), name: name.trim(), password },
        wasAuthenticated,
      );

      if (wasAuthenticated) {
        try {
          await reloadCompanies();
        } catch {
          // Yeniden yükleme başarısız olsa bile kabul zaten tamamlandı;
          // hata CompanyContext'in kendi durumunda (seçim ekranında)
          // gösterilir, burada kabul BAŞARISIZ gibi gösterilmez.
        }

        navigate('/app', { replace: true });
      } else {
        setResult(accepted);
      }
    } catch (caught) {
      setError(caught);

      // Parola arayüzde bırakılmaz — LoginPage'deki aynı gerekçe:
      // başarısız denemeden sonra ekranda asılı kalan bir parola, omuz
      // üstü okumaya ve otomatik doldurmanın yanlış kaydetmesine açıktır.
      setPassword('');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  /**
   * "Farklı hesapla devam et": mevcut çıkış akışı (AuthContext.logout).
   * Yerel oturum sunucu yanıtından bağımsız kapanır; `status`
   * 'unauthenticated' olunca ekran misafir dalına düşer. Token state'te
   * kalır, kullanıcı aynı daveti yeni hesapla ya da doğru hesapla
   * sürdürebilir.
   */
  async function handleSwitchAccount() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSwitching(true);

    try {
      await logout();
    } finally {
      inFlight.current = false;
      setSwitching(false);
      setError(null);
      setPassword('');
    }
  }

  // Başarı — YALNIZCA misafir dalında gösterilir: kimlikli dal zaten
  // /app'e yönlendirdi, buraya hiç düşmez (ya da bir an düşse de hemen
  // yerini yeni rotaya bırakır).
  if (result) {
    return (
      <div className="ft-auth ft-invite-accept">
        <Card className="ft-auth__card">
          <div className="ft-stack">
            <header className="ft-auth__header">
              <FlowTigerMark size="md" />
              <h1 className="ft-auth__title">Daveti kabul et</h1>
            </header>

            <p role="status" className="ft-invite-accept__success">
              Hesabınız oluşturuldu ve daveti kabul ettiniz. Devam etmek için şimdi giriş yapın.
            </p>

            {/*
              Yanıtta ne varsa o: maskeli e-posta ve rol. Maskeli adres,
              kullanıcının hangi e-postayla giriş yapacağını hatırlatır;
              tam adres backend'den zaten gelmez.
            */}
            <dl className="ft-invite-accept__facts">
              <div className="ft-invite-accept__fact">
                <dt>Giriş e-postası</dt>
                <dd>{result.email}</dd>
              </div>
              <div className="ft-invite-accept__fact">
                <dt>Rol</dt>
                <dd>{roleLabel(result.role)}</dd>
              </div>
            </dl>

            <Link className="ft-button ft-button--primary" to="/login">
              Giriş yap
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // 410: davet artık kullanılamaz (iptal / kabul edilmiş / süresi dolmuş).
  // Form gösterilmez — aynı token'la yeniden denemek yalnızca aynı hatayı
  // döndürür.
  if (error instanceof ApiError && error.status === 410) {
    return (
      <div className="ft-auth ft-invite-accept">
        <Card className="ft-auth__card">
          <div className="ft-stack">
            <header className="ft-auth__header">
              <FlowTigerMark size="md" />
              <h1 className="ft-auth__title">Davet kullanılamıyor</h1>
            </header>

            <ErrorState message={acceptInvitationErrorMessage(error)} />

            <p className="ft-muted ft-invite-accept__lead">
              {error.code === 'invitation_accepted'
                ? 'Daveti daha önce kabul ettiyseniz hesabınızla giriş yaparak devam edebilirsiniz.'
                : 'Yeni bir davet için sizi davet eden şirket sahibiyle iletişime geçin.'}
            </p>

            <div className="ft-invite-accept__actions">
              {isAuthenticated ? (
                <Link className="ft-button ft-button--primary" to="/app">
                  Uygulamaya git
                </Link>
              ) : (
                <Link className="ft-button ft-button--primary" to="/login">
                  Giriş sayfasına git
                </Link>
              )}

              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setToken('');
                }}
              >
                Başka bir davet kodu gir
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const tokenError = acceptInvitationFieldError(error, 'token');
  const nameError = acceptInvitationFieldError(error, 'name');
  const passwordError = acceptInvitationFieldError(error, 'password');
  const hasFieldError = Boolean(tokenError || nameError || passwordError);

  // `invitation_already_member` gibi `errors` taşımayan 422'ler ve
  // 403/404 form seviyesinde gösterilir (bkz. InviteMemberPage'deki
  // aynı desen).
  const formError = error && !hasFieldError ? acceptInvitationErrorMessage(error) : null;
  const errorCode = error instanceof ApiError ? error.code : undefined;
  const needsLogin =
    Boolean(formError) && errorCode === 'invitation_requires_authentication' && !isAuthenticated;

  const loginLink = (label: string) => (
    <Link className="ft-invite-accept__link" to="/login" state={{ from: returnTo }}>
      {label}
    </Link>
  );

  return (
    <div className="ft-auth ft-invite-accept">
      <Card className="ft-auth__card">
        <form className="ft-stack" onSubmit={handleSubmit} noValidate>
          <header className="ft-auth__header">
            <FlowTigerMark size="md" />
            <span className="ft-invite-accept__eyebrow">Ekip daveti</span>
            <h1 className="ft-auth__title">Daveti kabul et</h1>
            <p className="ft-muted">
              {isAuthenticated
                ? 'Şirkete bu hesapla katılmak için daveti onaylayın.'
                : linkToken
                  ? 'Şirkete katılmak için hesabınızı oluşturun.'
                  : 'Davet kodunuzu ve hesap bilgilerinizi girin.'}
            </p>
          </header>

          {/*
            Kimlikli dalda HANGİ hesapla kabul edileceği açıkça görünür:
            davet yalnızca gönderildiği e-postayla kabul edilir ve
            yanlış hesapta olduğunu fark etmeyen kullanıcı yalnızca bir
            403 görürdü.
          */}
          {isAuthenticated && user && (
            <div className="ft-invite-accept__account">
              <span className="ft-invite-accept__avatar" aria-hidden="true">
                {initials(user.name)}
              </span>
              <div className="ft-invite-accept__account-text">
                <span className="ft-invite-accept__account-label">Giriş yapılan hesap</span>
                <span className="ft-invite-accept__account-name">{user.name}</span>
                <span className="ft-invite-accept__account-email">{user.email}</span>
              </div>
            </div>
          )}

          {formError && <ErrorState message={formError} />}

          {/* 403 sonrası atılacak adım — hatanın hemen altında. */}
          {needsLogin && (
            <p className="ft-invite-accept__next">
              {loginLink('Giriş yapın')} — giriş yaptıktan sonra bu davete geri dönersiniz.
            </p>
          )}

          {formError && errorCode === 'invitation_email_mismatch' && isAuthenticated && (
            <p className="ft-invite-accept__next">
              Daveti kabul etmek için davetin gönderildiği e-postayla giriş yapın.
            </p>
          )}

          <Input
            label="Davet kodu"
            name="token"
            autoComplete="off"
            autoFocus={!linkToken}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            error={tokenError}
            required
          />

          {/*
            Ad ve parola YALNIZCA giriş yapmamış davetli için: backend
            bunları kimlikli istekte `prohibited` ile reddediyor
            (InvitationAcceptRequest). Alanları burada göstermemek, o
            reddi tetikleyecek bir gövde kurmayı baştan engeller.
          */}
          {!isAuthenticated && (
            <>
              <Input
                label="Ad Soyad"
                name="name"
                autoComplete="name"
                autoFocus={Boolean(linkToken)}
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={nameError}
                required
              />

              <PasswordInput
                label="Parola"
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={passwordError}
                required
              />

              <p className="ft-muted ft-invite-accept__hint">
                Hesabınız davetin gönderildiği e-posta adresiyle oluşturulur.
              </p>
            </>
          )}

          <Button type="submit" loading={submitting} disabled={switching}>
            Daveti kabul et
          </Button>

          {isAuthenticated ? (
            <Button
              type="button"
              variant="secondary"
              loading={switching}
              disabled={submitting}
              onClick={() => void handleSwitchAccount()}
            >
              Farklı hesapla devam et
            </Button>
          ) : (
            // 403 sonrası aynı bağlantı yukarıda zaten var; ikinci kez
            // gösterilmez.
            !needsLogin && (
              <p className="ft-muted ft-invite-accept__footer">
                Bu e-postayla zaten hesabınız var mı? {loginLink('Giriş yapın')}
              </p>
            )
          )}
        </form>
      </Card>
    </div>
  );
}

/** Ad baş harfleri — profil/ekip ekranlarındaki rozetle aynı kural. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('tr-TR');
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toLocaleUpperCase('tr-TR');
}
