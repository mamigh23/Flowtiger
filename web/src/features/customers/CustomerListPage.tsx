import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ErrorState, Skeleton } from '@/components/ui';
import type { Customer, Paginated } from '@/types/api';
import { customerErrorMessage } from './customerErrors';

/**
 * Müşteri listesi.
 *
 * Sıralama backend'de SABİT: customer_no artan. Uçta sort/search/filter
 * parametresi yok, bu yüzden arayüzde de arama kutusu ya da sıralama
 * kontrolü YOK — olsaydı çalışmayan bir özellik göstermiş olurduk
 * (playbook §11).
 *
 * per_page gönderilmez: backend'in kendi varsayılanı (15) kullanılır.
 * İstemcinin sayfa boyutunu dayatması için bir sebep yok.
 */
export function CustomerListPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<Customer> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      setResult(await endpoints.customers.list(api, { page: requestedPage }));
    } catch (caught) {
      // 401 merkezî olarak ApiClient'ta ele alınır: token temizlenir ve
      // AuthContext oturumu düşürür. Burada ayrıca bir şey yapılmaz.
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
        <h1 className="ft-page__title">Müşteriler</h1>
        <Link className="ft-button ft-button--primary" to="/app/customers/new">
          Yeni müşteri
        </Link>
      </header>

      {loading && (
        <Card>
          <div data-testid="customers-loading" className="ft-stack">
            <Skeleton />
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </div>
        </Card>
      )}

      {!loading && error !== null && (
        <Card>
          <ErrorState message={customerErrorMessage(error)} />
          <Button variant="secondary" onClick={() => void load(page)}>
            Tekrar dene
          </Button>
        </Card>
      )}

      {!loading && !error && result && result.data.length === 0 && (
        <Card>
          <div className="ft-empty">
            <p>Henüz müşteri yok.</p>
            <p className="ft-muted">İlk müşteriyi ekleyerek başlayın.</p>
          </div>
        </Card>
      )}

      {!loading && !error && result && result.data.length > 0 && (
        <>
          <Card>
            <table className="ft-table" aria-label="Müşteriler">
              <thead>
                <tr>
                  <th scope="col">No</th>
                  <th scope="col">Ad</th>
                  <th scope="col">Telefon</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((customer) => (
                  <tr key={customer.id}>
                    {/* Kullanıcıya gösterilen numara customer_no'dur, id değil. */}
                    <td>{customer.customer_no}</td>
                    <td>
                      <Link to={`/app/customers/${customer.id}`}>{customer.name}</Link>
                    </td>
                    {/* Telefon yoksa uydurma değer değil, boşluk işareti. */}
                    <td>{customer.phone ?? '—'}</td>
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
