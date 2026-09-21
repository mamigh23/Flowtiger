import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api, endpoints } from '@/lib/api';
import { Button, ConfirmPanel, ErrorState } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';
import { formatDateTime } from '@/features/audit/auditLabels';
import type { Invitation, Paginated } from '@/types/api';
import { invitationErrorMessage, invitationStatusLabel } from './invitationErrors';

/**
 * Davetler — birleşik Ekip ekranının DAVET BÖLÜMÜ.
 *
 * Bu dosya eskiden `/app/invitations` rotasının kendisiydi. Artık bölüm;
 * başlık, şirket geneli özet, "Davet gönder" eylemi ve bölüm seçimi
 * `TeamHubPage`in elinde ve eski rota oraya yönlendiriliyor (bkz.
 * App.tsx) — mevcut bağlantılar kırılmadı. BURADA DEĞİŞEN TEK ŞEY
 * ÇERÇEVE:
 *
 *   - veri akışı aynı: `GET /invitations?page=N`, aynı state, aynı
 *     hata/boş/yükleme durumları; `per_page` hâlâ gönderilmez;
 *   - iptal akışı, `ConfirmPanel` (odak yönetimi, Escape, odak dönüşü),
 *     410 ayrıştırması ve hata metinleri aynı;
 *   - `h1` yerine `h2` — ekranda zaten bir `h1` ("Ekip") var.
 *
 * İSTEMCİDE YETKİ KARARI YOK: kullanıcının rolüne bakıp isteği
 * engellemiyoruz. Uçlar owner'a özeldir ama bunu backend söyler.
 *
 * İPTAL DÜĞMESİ HER SATIRDA VARDIR — yalnızca `pending` olanlarda değil.
 * Durumu istemcide değerlendirip düğmeyi gizlemek, geçerlilik kararını
 * istemciye taşımak olurdu; üstelik liste ile istek arasında geçen
 * sürede durum değişebilir. Karar backend'e ait, 410 da onun cevabı.
 *
 * `email` MASKELİ gelir ("a***@example.com"); arayüz maskeyi çözmeye
 * çalışmaz, olduğu gibi gösterir.
 *
 * Arama/sıralama/durum filtresi YOK: uçta böyle bir parametre yok.
 *
 * ONAY SATIRI TETİKLEYİCİ SATIRIN HEMEN ARDINDA: ikinci bir `<tr>`
 * olarak eklenir. Panel tablodan önce render edilseydi ileri Tab akışı
 * tetikleyici düğmeden onay düğmelerine hiç ulaşmazdı.
 *
 * DURUM DAĞILIMI SAYFA KAPSAMLIDIR: "Bekleyen" ve "Kabul edilen" YALNIZCA
 * AÇIK SAYFAYI sayar ve kartın notu bunu söyler; şirket geneli toplam
 * (`meta.total`) üstteki özette durur.
 *
 * GEÇERLİLİK BİÇİMLENDİRİLİR: ham ISO metni yerine denetim ekranıyla
 * AYNI `formatDateTime` (Intl kullanmaz).
 */
interface InvitationsSectionProps {
  /**
   * Yüklenen sayfanın `meta.total` değeri — üstteki şirket özeti için.
   * Sayı ikinci bir istekle DEĞİL, zaten gelen yanıttan okunur.
   */
  onTotal?: (total: number | null) => void;
}

export function InvitationsSection({ onTotal }: InvitationsSectionProps) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<Invitation> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  /** İptal fiiline özgü hata — liste hatasından ayrı tutulur. */
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Invitation | null>(null);
  const [revoking, setRevoking] = useState(false);

  /** Onay paneli kapanınca odağın döneceği düğme. */
  const revokeTriggerRef = useRef<HTMLElement | null>(null);

  /* Geri çağrı ref'te: `load` bir efekt bağımlılığı (bkz. üye bölümü). */
  const onTotalRef = useRef(onTotal);
  onTotalRef.current = onTotal;

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    // İptale özgü hata da burada temizlenir: bir önceki sayfada başarısız
    // olan iptal denemesinin banner'ı, kullanıcı sayfa değiştirdiğinde
    // (ya da "Tekrar dene" ile listeyi yeniden yüklediğinde) ekranda asılı
    // KALMAMALI — artık üzerinde durduğu satır bile görünürde değil.
    setRevokeError(null);

    try {
      const page = await endpoints.invitations.list(api, { page: requestedPage });
      setResult(page);
      onTotalRef.current?.(page.meta.total);
    } catch (caught) {
      // 401 merkezî olarak ApiClient'ta ele alınır.
      setError(caught);
      setResult(null);
      onTotalRef.current?.(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  async function handleRevoke(invitation: Invitation) {
    setRevoking(true);
    setRevokeError(null);

    try {
      await endpoints.invitations.revoke(api, invitation.id);
      setConfirming(null);
      await load(page);
    } catch (caught) {
      // 410 buraya düşer: davet zaten iptal/kabul edilmiş ya da süresi
      // dolmuş. Mesaj koda göre ayrışır.
      setRevokeError(invitationErrorMessage(caught));
      setConfirming(null);
    } finally {
      setRevoking(false);
    }
  }

  const rows = result?.data ?? [];
  const pendingCount = rows.filter((invitation) => invitation.status === 'pending').length;
  const acceptedCount = rows.filter((invitation) => invitation.status === 'accepted').length;

  /*
   * Tek sayfalık bir listede "bu sayfada" demek gereksiz bir çekince
   * olurdu: sayfa zaten tüm kayıtları taşıyor.
   */
  const singlePage = result !== null && result.meta.last_page <= 1;
  const scopeNote = singlePage ? 'tüm davetler' : 'bu sayfada';

  return (
    <section
      className="ft-invitations ft-team-hub__section"
      aria-labelledby="ft-team-invitations-title"
    >
      <div className="ft-team-hub__section-head">
        <h2 className="ft-team-hub__section-title" id="ft-team-invitations-title">
          Davetler
        </h2>
        <p className="ft-team-hub__section-lead">Gönderilen davetler ve durumları.</p>
      </div>

      {/*
        İptal hatası listenin ÜSTÜNDE ve kendi yüzeyinde durur: bir
        satırın altına sıkıştırılsaydı, liste yeniden yüklendiğinde
        hangi satıra ait olduğu kaybolurdu.
      */}
      {revokeError !== null && (
        <div className="ft-invitations-panel ft-invitations-panel--notice">
          <ErrorState message={revokeError} />
        </div>
      )}

      {/*
        DURUM DAĞILIMI SAYFA KAPSAMLIDIR — şirket geneli toplam üstteki
        özette (`meta.total`). Buradaki iki kart yalnızca açık sayfayı
        sayar ve notları bunu söyler.
      */}
      {!loading && !error && result && rows.length > 0 && (
        <div className="ft-invitations-summary" data-testid="invitations-status-breakdown">
          <article
            className="ft-invitations-stat ft-invitations-stat--pending"
            data-testid="invitations-summary-pending"
          >
            <span className="ft-invitations-stat__label">Bekleyen</span>
            <span className="ft-invitations-stat__value">{pendingCount}</span>
            <span className="ft-invitations-stat__note">
              {rows.length} kayıttan · {scopeNote}
            </span>
          </article>

          <article className="ft-invitations-stat" data-testid="invitations-summary-accepted">
            <span className="ft-invitations-stat__label">Kabul edilen</span>
            <span className="ft-invitations-stat__value">{acceptedCount}</span>
            <span className="ft-invitations-stat__note">
              {rows.length} kayıttan · {scopeNote}
            </span>
          </article>
        </div>
      )}

      {/* ---------------------------------------------------- yükleme */}
      {loading && (
        <div className="ft-invitations-panel" data-testid="invitations-loading" aria-hidden="true">
          <span className="ft-skeleton ft-invitations-skeleton__head" />
          <span className="ft-skeleton ft-invitations-skeleton__row" />
          <span className="ft-skeleton ft-invitations-skeleton__row" />
          <span className="ft-skeleton ft-invitations-skeleton__row" />
        </div>
      )}

      {/* ------------------------------------------------- hata / 403 */}
      {!loading && error !== null && (
        <div className="ft-invitations-panel ft-invitations-panel--notice">
          <ErrorState message={invitationErrorMessage(error)} />
          <Button
            className="ft-invitations-action"
            variant="secondary"
            onClick={() => void load(page)}
          >
            Tekrar dene
          </Button>
        </div>
      )}

      {/* -------------------------------------------------------- boş */}
      {!loading && !error && result && rows.length === 0 && (
        <div className="ft-invitations-panel ft-invitations-empty">
          <p className="ft-invitations-empty__title">Henüz davet yok.</p>
          <p className="ft-invitations-empty__note">
            Ekibe katılmasını istediğiniz kişiyi davet edin.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------ liste */}
      {!loading && !error && result && rows.length > 0 && (
        <>
          <div className="ft-invitations-panel ft-invitations-panel--table">
            {/* Dar viewportta yalnızca tablo yatayda kayar; panel sayfayı taşırmaz. */}
            <div className="ft-table-scroll">
              <table className="ft-table" aria-label="Davetler">
                <thead>
                  <tr>
                    <th scope="col">E-posta</th>
                    <th scope="col">Rol</th>
                    <th scope="col">Durum</th>
                    <th scope="col">Geçerlilik</th>
                    <th scope="col">
                      <span className="ft-visually-hidden">İşlemler</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((invitation) => {
                    // Onay AYNI SATIRIN hemen ardına, ikinci bir <tr> olarak
                    // eklenir (AuditLogListPage'deki ayrıntı satırıyla aynı
                    // örüntü). Tek bir kart içinde tablodan ÖNCE render
                    // etmek, ileri Tab akışının tetikleyici düğmeden onay
                    // düğmelerine hiç ulaşmamasına yol açıyordu — DOM'da
                    // geriden geliyordu. Burada onay, tam olarak tetikleyici
                    // satırdan sonra geldiği için doğal ileri Tab sırasına
                    // girer.
                    const open = confirming?.id === invitation.id;

                    return (
                      <Fragment key={invitation.id}>
                        <tr data-status={invitation.status}>
                          {/* Maskeli adres olduğu gibi gösterilir. */}
                          <td className="ft-invitations-email">{invitation.email}</td>
                          <td>
                            <span
                              className={`ft-invitations-role${
                                invitation.role === 'owner' ? ' ft-invitations-role--owner' : ''
                              }`}
                            >
                              {roleLabel(invitation.role)}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`ft-invitations-status ft-invitations-status--${invitation.status}`}
                            >
                              {invitationStatusLabel(invitation.status)}
                            </span>
                          </td>
                          {/*
                            Ham ISO metni kullanıcıya gösterilmez; tarih
                            denetim ekranıyla aynı biçimde okunur.
                          */}
                          <td className="ft-invitations-expiry">
                            {formatDateTime(invitation.expires_at) ?? '—'}
                          </td>
                          <td className="ft-invitations-row-action">
                            {/* Durum istemcide değerlendirilmez; 410 backend'in cevabı. */}
                            <Button
                              className="ft-invitations-action ft-invitations-action--danger"
                              variant="ghost"
                              onClick={(event) => {
                                revokeTriggerRef.current = event.currentTarget;
                                setConfirming(invitation);
                              }}
                            >
                              İptal et
                            </Button>
                          </td>
                        </tr>

                        {open && (
                          <tr className="ft-invitations-confirm-row">
                            <td colSpan={5}>
                              <ConfirmPanel
                                className="ft-invitations-confirm"
                                data-testid="revoke-confirm-panel"
                                triggerRef={revokeTriggerRef}
                                onCancel={() => setConfirming(null)}
                              >
                                <p
                                  data-testid="revoke-confirm"
                                  className="ft-invitations-confirm__text"
                                >
                                  <strong>{invitation.email}</strong> adresine gönderilen davet
                                  iptal edilecek.
                                </p>
                                <div className="ft-invitations-confirm__actions">
                                  {/* Vazgeç ilk kontrol: yıkıcı aksiyon Tab
                                      sırasında ilk durak olmamalı. */}
                                  <Button
                                    className="ft-invitations-action"
                                    variant="ghost"
                                    onClick={() => setConfirming(null)}
                                  >
                                    Vazgeç
                                  </Button>
                                  <Button
                                    className="ft-invitations-action ft-invitations-action--confirm"
                                    onClick={() => void handleRevoke(invitation)}
                                    loading={revoking}
                                  >
                                    Evet, iptal et
                                  </Button>
                                </div>
                              </ConfirmPanel>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {result.meta.last_page > 1 && (
            <nav className="ft-invitations-pager" aria-label="Sayfalama">
              <Button
                className="ft-invitations-action"
                variant="secondary"
                onClick={() => setPage((current) => current - 1)}
                disabled={result.meta.current_page <= 1}
              >
                Önceki
              </Button>

              <span className="ft-invitations-pager__status">
                Sayfa {result.meta.current_page} / {result.meta.last_page}
              </span>

              <Button
                className="ft-invitations-action"
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
    </section>
  );
}
