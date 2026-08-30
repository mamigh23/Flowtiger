import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Badge, Button, Card, ErrorState, Skeleton } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';
import type { Member, Paginated } from '@/types/api';
import { memberErrorMessage } from './memberErrors';

/**
 * Ekip listesi.
 *
 * İSTEMCİDE YETKİ KARARI YOK: kullanıcının rolüne bakıp isteği
 * engellemiyoruz. Ekip uçları owner'a özeldir ama bunu backend söyler —
 * istek yapılır, 403 gelirse açıklanır. Rolü istemcide kontrol etseydik
 * yetki kuralı iki ayrı yerde tanımlı olur ve zamanla ayrışırdı
 * (playbook §3.1).
 *
 * Arama/sıralama/filtre YOK: uçta böyle bir parametre yok.
 *
 * Yeni üye ekleme burada YOK: POST /members owner'ın başkasının
 * parolasını belirlemesini gerektiriyor ve davet akışıyla çakışıyor.
 * Bu faz kapsamı dışında bırakıldı.
 */
export function MemberListPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<Member> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      setResult(await endpoints.members.list(api, { page: requestedPage }));
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

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">Ekip</h1>
      </header>

      {loading && (
        <Card>
          <div data-testid="members-loading" className="ft-stack">
            <Skeleton />
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </div>
        </Card>
      )}

      {!loading && error !== null && (
        <Card>
          <ErrorState message={memberErrorMessage(error)} />
          <Button variant="secondary" onClick={() => void load(page)}>
            Tekrar dene
          </Button>
        </Card>
      )}

      {!loading && !error && result && result.data.length === 0 && (
        <Card>
          <div className="ft-empty">
            <p>Ekipte görüntülenecek üye yok.</p>
          </div>
        </Card>
      )}

      {!loading && !error && result && result.data.length > 0 && (
        <>
          <Card>
            {/* Dar viewportta yalnızca tablo yatayda kayar; kart sayfayı taşırmaz. */}
            <div className="ft-table-scroll">
              <table className="ft-table" aria-label="Ekip üyeleri">
                <thead>
                  <tr>
                    <th scope="col">Ad</th>
                    <th scope="col">E-posta</th>
                    <th scope="col">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <Link to={`/app/team/${member.id}`}>{member.name}</Link>
                      </td>
                      <td>{member.email}</td>
                      <td>
                        {/* Yalnızca görüntüleme; bu değerle yetki kararı verilmez. */}
                        <Badge tone={member.role === 'owner' ? 'accent' : 'neutral'}>
                          {roleLabel(member.role)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
