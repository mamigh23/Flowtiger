import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Badge, Button, Card, ErrorState, Skeleton } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';
import type { Invitation, Paginated } from '@/types/api';
import { invitationErrorMessage, invitationStatusLabel } from './invitationErrors';

/**
 * Davet listesi ve iptal.
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
 */
export function InvitationListPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<Invitation> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  /** İptal fiiline özgü hata — liste hatasından ayrı tutulur. */
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Invitation | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      setResult(await endpoints.invitations.list(api, { page: requestedPage }));
    } catch (caught) {
      // 401 merkezî olarak ApiClient'ta ele alınır.
      setError(caught);
      setResult(null);
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

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">Davetler</h1>
        <Link className="ft-button ft-button--primary" to="/app/invitations/new">
          Davet gönder
        </Link>
      </header>

      {revokeError !== null && <ErrorState message={revokeError} />}

      {confirming !== null && (
        <Card>
          <p data-testid="revoke-confirm">
            <strong>{confirming.email}</strong> adresine gönderilen davet iptal edilecek.
          </p>
          <div className="ft-form__actions">
            <Button onClick={() => void handleRevoke(confirming)} loading={revoking}>
              Evet, iptal et
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Vazgeç
            </Button>
          </div>
        </Card>
      )}

      {loading && (
        <Card>
          <div data-testid="invitations-loading" className="ft-stack">
            <Skeleton />
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </div>
        </Card>
      )}

      {!loading && error !== null && (
        <Card>
          <ErrorState message={invitationErrorMessage(error)} />
          <Button variant="secondary" onClick={() => void load(page)}>
            Tekrar dene
          </Button>
        </Card>
      )}

      {!loading && !error && result && result.data.length === 0 && (
        <Card>
          <div className="ft-empty">
            <p>Henüz davet yok.</p>
            <p className="ft-muted">Ekibe katılmasını istediğiniz kişiyi davet edin.</p>
          </div>
        </Card>
      )}

      {!loading && !error && result && result.data.length > 0 && (
        <>
          <Card>
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
                {result.data.map((invitation) => (
                  <tr key={invitation.id}>
                    {/* Maskeli adres olduğu gibi gösterilir. */}
                    <td>{invitation.email}</td>
                    <td>{roleLabel(invitation.role)}</td>
                    <td>
                      <Badge tone={invitation.status === 'pending' ? 'accent' : 'neutral'}>
                        {invitationStatusLabel(invitation.status)}
                      </Badge>
                    </td>
                    <td>{invitation.expires_at ?? '—'}</td>
                    <td>
                      {/* Durum istemcide değerlendirilmez; 410 backend'in cevabı. */}
                      <Button variant="ghost" onClick={() => setConfirming(invitation)}>
                        İptal et
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {result.meta.last_page > 1 && (
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
