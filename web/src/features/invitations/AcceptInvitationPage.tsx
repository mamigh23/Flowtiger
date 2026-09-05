import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { api, endpoints } from '@/lib/api';
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
import type { Invitation } from '@/types/api';
import { acceptInvitationErrorMessage, acceptInvitationFieldError } from './invitationAcceptErrors';

/**
 * Davet KABUL ekranı — herkese açık (AŞAMA 4'ün ertelenen parçası).
 *
 * BEKLENEN "davet linki" AKIŞI DEĞİL. Mevcut davet e-postası
 * (`resources/views/mail/invitation.blade.php`) bir bağlantı değil, elle
 * girilecek ham bir kod gönderiyor; şablonun kendi yorumu bunu "frontend
 * gelene kadarki geçici çözüm" olarak işaretliyor. Bu yüzden ekran bir
 * TIKLANABİLİR LİNK hedefi değil, bir KOD GİRİŞ FORMUDUR. `?token=`
 * sorgu parametresi yalnızca ileride bir bağlantı akışı eklendiğinde
 * dolduruculuk için okunur — zorunlu ya da varsayılan yol DEĞİLDİR.
 *
 * KİMLİK DALLANMASI BACKEND'İN AYNASI:
 *   giriş yapmamış  → ad + parola da gönderilir (bu istek aynı zamanda
 *                     kayıt formudur), `authenticated: false`
 *   giriş yapmış    → yalnızca token gönderilir, `authenticated: true`
 *                     (Bearer token eklenir)
 * Bu ayrım `InvitationAcceptRequest`teki `requiredIf`/`prohibitedIf`
 * kurallarının BİREBİR karşılığıdır (bkz. backend).
 *
 * 200 mü 201 mi olduğunu `ApiClient` göstermez (zarf açılır, durum kodu
 * dışarı sızmaz) — buna zaten ihtiyaç yok: hangi dalın izlendiği zaten
 * İSTEMCİDE biliniyor (`wasAuthenticated`, tam olarak backend'in kendi
 * `$authenticated === null` kontrolünün yansıması).
 *
 * BAŞARI SONRASI OTURUM AÇMA YOK. Yanıtta token/oturum alanı YOKTUR ve
 * e-posta maskeli gelir — istemcinin kendi kendine giriş yapacak hiçbir
 * bilgisi yok. Yeni hesap için doğru sonraki adım AYRI bir `/auth/login`
 * çağrısıdır (backend'in kendi testi bunu kanıtlıyor); burada yalnızca
 * "şimdi giriş yapın" ekranı gösterilir.
 *
 * Giriş yapmış kullanıcı için ise `useCompanies().reload()` çağrılır ve
 * `/app`'e gidilir — hangi şirketin seçileceğine (tek şirketse otomatik,
 * birden fazlaysa seçim ekranı) mevcut `RequireActiveCompany` /
 * `CompanySelectPage` mantığı karar verir. İstemci burada YENİ bir
 * seçim/rol kararı ÜRETMEZ.
 *
 * Token React state'inde yaşar; localStorage'a YAZILMAZ, konsola
 * LOGLANMAZ, yeni bir URL'e TAŞINMAZ — yalnızca POST gövdesinde,
 * `endpoints.invitations.accept` üzerinden gönderilir.
 */
export function AcceptInvitationPage() {
  const { status: authStatus } = useAuth();
  const { reload: reloadCompanies } = useCompanies();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [token, setToken] = useState(() => searchParams.get('token') ?? '');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
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

  // Başarı — YALNIZCA misafir dalında gösterilir: kimlikli dal zaten
  // /app'e yönlendirdi, buraya hiç düşmez (ya da bir an düşse de hemen
  // yerini yeni rotaya bırakır).
  if (result) {
    return (
      <div className="ft-auth">
        <Card className="ft-auth__card">
          <div className="ft-stack">
            <header className="ft-auth__header">
              <FlowTigerMark size="md" />
              <h1 className="ft-auth__title">Daveti kabul et</h1>
            </header>

            <p role="status">
              Hesabınız oluşturuldu ve daveti kabul ettiniz. Devam etmek için şimdi giriş yapın.
            </p>

            <Link className="ft-button ft-button--primary" to="/login">
              Giriş yap
            </Link>
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
  // 403/404/410 form seviyesinde gösterilir (bkz. InviteMemberPage'deki
  // aynı desen).
  const formError = error && !hasFieldError ? acceptInvitationErrorMessage(error) : null;

  return (
    <div className="ft-auth">
      <Card className="ft-auth__card">
        <form className="ft-stack" onSubmit={handleSubmit} noValidate>
          <header className="ft-auth__header">
            <FlowTigerMark size="md" />
            <h1 className="ft-auth__title">Daveti kabul et</h1>
            <p className="ft-muted">
              {isAuthenticated
                ? 'Şirkete katılmak için davet kodunuzu girin.'
                : 'Davet kodunuzu ve hesap bilgilerinizi girin.'}
            </p>
          </header>

          {formError && <ErrorState message={formError} />}

          <Input
            label="Davet kodu"
            name="token"
            autoComplete="off"
            autoFocus
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
            </>
          )}

          <Button type="submit" loading={submitting}>
            Daveti kabul et
          </Button>
        </form>
      </Card>
    </div>
  );
}
