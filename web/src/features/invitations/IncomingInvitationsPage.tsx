import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { api, endpoints } from '@/lib/api';
import { Badge, Button, Card, ErrorState, Skeleton, LoadingScreen } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';
import { formatDateTime } from '@/features/audit/auditLabels';
import type { IncomingInvitation, Paginated } from '@/types/api';
import {
  VERIFICATION_ALREADY_DONE,
  VERIFICATION_SENT,
  incomingListErrorMessage,
  isEmailVerificationRequired,
  unusableInvitationMessage,
} from './incomingInvitationErrors';

/**
 * GELEN DAVETLER — kullanıcının KENDİSİNE gönderilen davetler.
 *
 * AKTİF ŞİRKET GEREKMEZ. Rota `ProtectedRoute` altındadır ama
 * `RequireActiveCompany` DIŞINDADIR: davetli henüz hiçbir şirkete üye
 * olmadığı için aktif şirket seçemez — seçemeyeceği için de bu ekranı
 * göremezse akış hiç çalışmaz. Bu, `/app/company-select` ile aynı
 * gerekçedir.
 *
 * Ekip içindeki Gelen davetler görünümü bu bileşeni kullanır. GÖNDERİLEN
 * davetlerdir (owner, aktif şirket bağlamı). Burası kişinin ALDIĞI
 * davetlerdir. İki farklı soru, iki ayrı ekran, iki ayrı uç.
 *
 * TOKEN YOKTUR — ne DOM'da, ne URL'de, ne depolamada. Kabul, davetin
 * kimliğiyle yapılır ve sahiplik sunucuda, oturumdaki e-postadan
 * doğrulanır. Bu ekran bir token hiç görmez.
 *
 * KABUL AKTİF ŞİRKETİ DEĞİŞTİRMEZ. Üyelik eklenir; "hangi şirkette
 * çalışıyorum" sorusu kullanıcıya aittir ve yalnızca AÇIK "Şirkete geç"
 * tıklamasıyla, mevcut güvenli `select()` akışı üzerinden verilir.
 *
 * OTURUM DEĞİŞİMİNDE DURUM TAŞINMAZ. Davetler kişiye özeldir; çıkış
 * yapıp başka biri girdiğinde önceki kullanıcının listesi ya da GECİKMİŞ
 * bir yanıtı yeni kullanıcıya görünmemelidir. Bunu `user.id` anahtarlı
 * sıfırlama + istek nesli sağlar (bkz. `generation`).
 */

/**
 * Kabul isteğinin sonucu — SAYFA düzeyinde gösterilir.
 *
 * Satıra değil sayfaya bağlıdır çünkü başarılı bir kabul, o satırı
 * listeden DÜŞÜRÜR (davet artık bekleyen değildir). Sonuç satıra bağlı
 * kalsaydı tazelemeden sonra görünmez olurdu.
 */
type AcceptOutcome =
  | { kind: 'accepted'; invitationId: number; companyId: number | null; companyName: string | null }
  | { kind: 'unusable'; invitationId: number; message: string };

export function IncomingInvitationsPage({ embedded = false }: { embedded?: boolean }) {
  const { activeCompanyId, status } = useCompanies();
  if (!embedded && (status === 'idle' || status === 'loading')) return <LoadingScreen />;
  if (!embedded && activeCompanyId !== null) {
    return <Navigate to="/app/team/invitations?view=incoming" replace />;
  }
  return <IncomingInvitationsContent embedded={embedded} />;
}

function IncomingInvitationsContent({ embedded }: { embedded: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompanyId, select, reload: reloadCompanies, selectError } = useCompanies();

  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<IncomingInvitation> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  /** Kabul süren davet — çift gönderimi hem görsel hem mantıksal engeller. */
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<AcceptOutcome | null>(null);

  /**
   * Şirket listesi yenilemesi başarısız olduysa burada tutulur.
   *
   * KABUL BAŞARISINDAN AYRI TUTULUR: kabul zaten gerçekleşmiştir; onu
   * "başarısız" göstermek yanlış olurdu. Ayrıca bu hata kabul isteğinin
   * TEKRARINI tetiklemez.
   */
  const [companyRefreshFailed, setCompanyRefreshFailed] = useState(false);

  /** Şirkete geçiş süren mi (düğme kilidi). */
  const [switchingTo, setSwitchingTo] = useState<number | null>(null);

  // Doğrulama dalı.
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);

  /**
   * Çift gönderim koruması.
   *
   * State asenkrondur; hızlı iki tıklama aynı karede iki istek üretebilir.
   * Ref senkron okunur (LoginPage ile aynı desen).
   */
  const inFlight = useRef(false);

  /**
   * İSTEK NESLİ — geç gelen yanıtları etkisiz kılar.
   *
   * İki durumda artar: yeni bir yükleme başladığında ve KULLANICI
   * DEĞİŞTİĞİNDE. Nesli eşleşmeyen bir yanıt duruma yazılmaz, böylece
   * çıkıştan sonra dönen bir liste yeni kullanıcıya görünmez.
   */
  const generation = useRef(0);

  /**
   * TEK KAPILI İSTEK: her çağrı nesli ilerletir.
   *
   * Döndürdüğü `isCurrent()`, yanıt geldiğinde "bu hâlâ en son istek mi"
   * sorusunu yanıtlar; nesli eşleşmeyen yanıt duruma YAZMAZ.
   *
   * Şu an tek kullanıcısı liste yüklemesidir. Şirket tazelemesi
   * (`reloadCompanies`) bu kapıdan GEÇMEZ çünkü şirket durumu AYRI bir
   * context'in malıdır ve oradaki sıra kuralı (`companyListSeq`) kendi
   * içinde tutarlıdır — iki kaynağı aynı nesle bağlamak, gereksiz bir
   * bağımlılık yaratırdı.
   */
  const beginRequest = useCallback(() => {
    const requestGeneration = ++generation.current;

    return () => requestGeneration === generation.current;
  }, []);

  const load = useCallback(
    async (requestedPage: number) => {
      const isCurrent = beginRequest();

      setLoading(true);
      setError(null);

      try {
        const pageResult = await endpoints.invitations.incoming(api, { page: requestedPage });

        if (!isCurrent()) return;

        setResult(pageResult);
      } catch (caught) {
        if (!isCurrent()) return;

        setError(caught);
        setResult(null);
      } finally {
        /*
          YALNIZCA GÜNCEL İSTEK GÖSTERGEYİ KAPATIR.

          Bayat bir yanıtın kapatması, yerini alan YENİ isteğin yükleme
          göstergesini erken söndürürdü. Takılı kalma riski yoktur:
          nesli ilerleten her yol (yeni bir `load`, kabul akışı, oturum
          değişimi) kendi `loading` durumunu zaten kurar.
        */
        if (isCurrent()) setLoading(false);
      }
    },
    [beginRequest],
  );

  /**
   * OTURUM DEĞİŞİMİ.
   *
   * `user.id` değiştiğinde (çıkış, yeniden giriş, hesap değişimi) bekleyen
   * istekler geçersizleşir ve ekrandaki her şey — liste, kabul sonucu,
   * doğrulama mesajı — sıfırlanır. Bu olmadan, önceki kullanıcının davet
   * listesi ya da gecikmiş bir yanıtı yeni kullanıcıya taşınırdı.
   *
   * NESLİ İLERLETMEK YETMEZ: geç gelen yanıtın kendisi de duruma
   * yazmamalıdır. İkisi birlikte gerekir; `beginRequest` bunu sağlar.
   */
  useEffect(() => {
    generation.current += 1;

    setResult(null);
    setError(null);
    setLoading(true);
    setOutcome(null);
    setCompanyRefreshFailed(false);
    setVerificationMessage(null);
    setSendError(null);
    setAcceptingId(null);
    setSwitchingTo(null);
    setPage(1);
    inFlight.current = false;
  }, [user?.id]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  async function handleAccept(invitation: IncomingInvitation) {
    if (inFlight.current) return;
    inFlight.current = true;
    setAcceptingId(invitation.id);
    setOutcome(null);
    setCompanyRefreshFailed(false);

    try {
      await endpoints.invitations.acceptIncoming(api, invitation.id);

      /*
        LİSTE GÜNCELLENİR: kabul edilen davet artık "bekleyen" değildir.
        Yerel olarak satırı silmek de mümkündü ama o zaman sayfalamadaki
        toplam yanlış kalırdı; kaynağı yeniden okumak tek doğruyu verir.

        SIRA ÖNEMLİ: kabul sonucu `load`dan SONRA yazılır. `load`
        kendi neslini ilerlettiği için, sonucu önce yazsaydık gecikmiş
        bir liste yanıtı onu silebilirdi.
      */
      await load(page);

      setOutcome({
        kind: 'accepted',
        invitationId: invitation.id,
        companyId: invitation.company.id,
        companyName: invitation.company.name,
      });

      /*
        ŞİRKET LİSTESİ YENİLENİR — AMA SESSİZ SEÇİM YAPILMAZ.

        `autoSelect: false` kritik: kullanıcının ilk davetini kabul
        etmesi, onu o şirkete geçirmek anlamına GELMEZ. Varsayılan
        davranış (tek şirketli kullanıcıyı otomatik seçmek) giriş anı
        için doğrudur; burada ise kullanıcı henüz "geçmek istiyorum"
        demedi. Açık karar "Şirkete geç" düğmesine bırakılır.
      */
      // `reload` hata FIRLATMAZ (bkz. CompanyContext): başarısızlığı
      // dönüş değerinden bildirir. `try/catch` ile yakalamaya çalışmak
      // hiçbir zaman çalışmazdı ve tazeleme hatası sessizce yok olurdu.
      const refreshed = await reloadCompanies({ autoSelect: false, background: true });

      // Kabul BAŞARILI; yalnızca liste tazelenemedi. Ayrı gösterilir ve
      // kabul isteği TEKRARLANMAZ.
      setCompanyRefreshFailed(!refreshed);
    } catch (caught) {
      // 404/410: kabul edilemedi. Listeyi tazelerken satır da düşsün
      // (kaynağı yeniden okumak tek doğruyu verir).
      await load(page);

      setOutcome({
        kind: 'unusable',
        invitationId: invitation.id,
        message: unusableInvitationMessage(caught),
      });
    } finally {
      inFlight.current = false;
      setAcceptingId(null);
    }
  }

  /**
   * "Şirkete geç" — YALNIZCA kullanıcı tıkladığında.
   *
   * Mevcut güvenli akış kullanılır (`CompanyContext.select`): backend
   * üyeliği doğrular, başarısızsa hata gösterilir ve aktif şirket
   * DEĞİŞMEZ.
   */
  async function handleSwitch(companyId: number) {
    setSwitchingTo(companyId);

    try {
      await select(companyId);
      navigate('/app', { replace: true });
    } catch {
      // `select` hatayı CompanyContext durumunda tutar; burada sessizce
      // yutulur ve düğme yeniden denenebilir kalır.
    } finally {
      setSwitchingTo(null);
    }
  }

  async function handleSendVerification() {
    setSending(true);
    setSendError(null);
    setVerificationMessage(null);

    try {
      const response = await endpoints.auth.sendVerificationEmail(api);

      // Zaten doğrulanmış hesap HATA DEĞİLDİR (yanıt 200).
      setVerificationMessage(
        response.code === 'already_verified' ? VERIFICATION_ALREADY_DONE : VERIFICATION_SENT,
      );
    } catch (caught) {
      // 429 buraya düşer; toUserMessage Retry-After'ı kullanır.
      setSendError(caught);
    } finally {
      setSending(false);
    }
  }

  const needsVerification = isEmailVerificationRequired(error);

  return (
    <div className={embedded ? 'ft-incoming ft-incoming--embedded' : 'ft-page ft-incoming'}>
      <div className="ft-page__header">
        {embedded ? <h2 className="ft-team-hub__section-title">Gelen davetler</h2> : <h1 className="ft-page__title">Gelen davetler</h1>}

        {/*
          Şirketsiz kullanıcı için GERİ DÖNÜŞ YOLU. Bu ekran aktif şirket
          gerektirmediği için, kullanıcı buradan panele gidemez; gitmek
          isterse önce şirket seçmelidir. Bağlantı koşullu: aktif şirketi
          olan kullanıcıya gereksiz bir adım göstermenin anlamı yok.
        */}
        {activeCompanyId === null && (
          <Link className="ft-button ft-button--ghost" to="/app/company-select">
            Şirket seçimine dön
          </Link>
        )}
      </div>

      {selectError && <ErrorState message={selectError} />}{/* ------------------------------------------------ doğrulama dalı */}
      {needsVerification ? (
        <Card>
          <h2 className="ft-section__title">E-posta adresinizi doğrulayın</h2>

          <p className="ft-muted">
            {incomingListErrorMessage(error)}
          </p>

          {/*
            Şirket ya da davet bilgisi BURADA GÖSTERİLMEZ — sunucu da
            doğrulama tamamlanmadan hiçbir davet verisi döndürmüyor.
            İstemci bunu tahmin etmez ve uydurmaz.
          */}
          <p className="ft-muted" data-testid="incoming-verification-email">
            {user?.email}
          </p>

          {sendError !== null && <ErrorState message={incomingListErrorMessage(sendError)} />}

          {verificationMessage !== null && sendError === null && (
            <p className="ft-notice" role="status">
              {verificationMessage}
            </p>
          )}

          <div className="ft-page__actions">
            <Button
              type="button"
              variant="secondary"
              loading={sending}
              onClick={() => void handleSendVerification()}
            >
              Doğrulama bağlantısı gönder
            </Button>

            {/*
              "Doğruladım, tekrar kontrol et" SUNUCUDAN yeniler: doğrulama
              durumu mail istemcisinde tıklanırken değişir, bu sekmenin
              belleğinde değil. Yerel bir bayrağı açmak, kullanıcıya
              doğrulanmış olduğunu söyleyip listeyi hiç getirmemek olurdu.
            */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => void load(page)}
              loading={loading}
            >
              Doğruladım, tekrar kontrol et
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* ------------------------------------------------ yükleme */}
          {loading && (
            <Card>
              <div data-testid="incoming-loading" aria-hidden="true">
                <Skeleton />
                <Skeleton />
                <Skeleton />
              </div>
            </Card>
          )}

          {/* --------------------------------------------------- hata */}
          {!loading && error !== null && !needsVerification && (
            <Card>
              <ErrorState message={incomingListErrorMessage(error)} />
              <div className="ft-page__actions">
                <Button variant="secondary" onClick={() => void load(page)}>
                  Tekrar dene
                </Button>
              </div>
            </Card>
          )}

          {/* ---------------------------------------------------- boş */}
          {!loading && error === null && result && result.data.length === 0 && (
            <Card>
              <div className="ft-empty" data-testid="incoming-empty">
                <p>Şu an bekleyen bir davetiniz yok.</p>
                <p className="ft-muted">
                  Bir şirket sizi davet ettiğinde davet burada görünür ve bu ekrandan kabul
                  edebilirsiniz.
                </p>
              </div>
            </Card>
          )}

          {/*
            KABUL SONUCU SAYFA DÜZEYİNDE GÖSTERİLİR — satırın içinde DEĞİL.

            Satıra bağlamak cazipti ama YANLIŞ: kabul başarılı olur olmaz
            liste tazelenir ve o davet artık "bekleyen" olmadığı için
            satır KAYBOLUR. Sonuç satırın içinde yaşasaydı, kullanıcı
            kabul ettiğine dair hiçbir şey görmezdi — işlem başarılı,
            geri bildirim yok.

            Sayfa düzeyinde durunca hem tazelemeden sonra da görünür hem
            de "Şirkete geç" gibi SONRAKİ adım oraya bağlanabilir.
          */}
          {outcome?.kind === 'accepted' && (
            <Card>
              <p className="ft-notice" role="status" data-testid="incoming-accepted">
                {outcome.companyName
                  ? `${outcome.companyName} davetini kabul ettiniz. Artık bu şirketin üyesisiniz.`
                  : 'Daveti kabul ettiniz. Artık bu şirketin üyesisiniz.'}
              </p>

              <div className="ft-page__actions">
                {/*
                  "Şirkete geç" YALNIZCA kullanıcı tıklarsa ve o şirket
                  zaten aktif DEĞİLSE çıkar. Kabulün kendisi şirketi
                  değiştirmez — geçiş açık bir karardır.
                */}
                {outcome.companyId !== null && outcome.companyId !== activeCompanyId && (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={switchingTo === outcome.companyId}
                    disabled={switchingTo !== null}
                    onClick={() => void handleSwitch(outcome.companyId as number)}
                  >
                    Şirkete geç
                  </Button>
                )}
              </div>
            </Card>
          )}

          {outcome?.kind === 'unusable' && (
            <Card>
              <ErrorState message={outcome.message} />
            </Card>
          )}

          {/* -------------------------------------------------- liste */}
          {!loading && error === null && result && result.data.length > 0 && (
            <ul className="ft-stack" data-testid="incoming-list">
              {result.data.map((invitation) => (
                <li key={invitation.id}>
                  <Card>
                    <div className="ft-stack" data-testid={`incoming-invitation-${invitation.id}`}>
                      <div>
                        <span className="ft-section__title">
                          {invitation.company.name ?? 'Bilinmeyen şirket'}
                        </span>{' '}
                        <Badge>{roleLabel(invitation.role)}</Badge>
                      </div>

                      {/*
                        Son geçerlilik tarihi. Ham ISO GÖSTERİLMEZ;
                        biçim denetim ekranınınkiyle aynı (`formatDateTime`).
                      */}
                      <p className="ft-muted">
                        Son geçerlilik: {formatDateTime(invitation.expires_at) ?? '—'}
                      </p>

                      <div className="ft-page__actions">
                        <Button
                          type="button"
                          onClick={() => void handleAccept(invitation)}
                          loading={acceptingId === invitation.id}
                          disabled={acceptingId !== null}
                        >
                          Kabul et
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {/*
            Şirket listesi tazelenemedİ — kabul BAŞARILI, bu ayrı bir
            sorundur ve kabul isteğinin tekrarını TETİKLEMEZ.
          */}
          {companyRefreshFailed && (
            <p className="ft-muted" role="status" data-testid="incoming-company-refresh-failed">
              Davet kabul edildi, ancak şirket listeniz şu an tazelenemedi. Sayfayı
              yenilediğinizde yeni şirketinizi göreceksiniz.
            </p>
          )}

          {/* ---------------------------------------------- sayfalama */}
          {!loading && !error && result && result.meta.last_page > 1 && (
            <nav className="ft-pager" aria-label="Sayfalama">
              <Button
                variant="secondary"
                onClick={() => setPage((current) => current - 1)}
                disabled={result.meta.current_page <= 1}
              >
                Önceki
              </Button>

              <span className="ft-muted">
                Sayfa {result.meta.current_page} / {result.meta.last_page}
              </span>

              <Button
                variant="secondary"
                onClick={() => setPage((current) => current + 1)}
                disabled={result.meta.current_page >= result.meta.last_page}
              >
                Sonraki
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
