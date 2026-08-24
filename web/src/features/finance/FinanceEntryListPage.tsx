import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Badge, Button, Card, ErrorState, Skeleton } from '@/components/ui';
import { formatMoney } from '@/lib/finance/money';
import type { FinanceEntry, Paginated } from '@/types/api';
import { directionLabel, formatFinancialDate, vatRateLabel } from './financeLabels';
import { financeErrorMessage } from './financeErrors';

/**
 * Finans kayıtları listesi.
 *
 * SIRALAMA BACKEND'İNDİR: financial_date DESC, id DESC. Uçta
 * sort/search/filter parametresi yok, bu yüzden arayüzde de arama kutusu
 * ya da sıralama kontrolü YOK — olsaydı çalışmayan bir özellik vaat
 * ederdik (playbook §11).
 *
 * per_page gönderilmez: backend'in kendi varsayılanı (15) kullanılır.
 *
 * LİSTEDE GÖSTERİLEN TUTAR BRÜTTÜR: kasadan gerçekten giren/çıkan para
 * odur. Net ve KDV ayrımı ayrıntı ekranına ait; listede üç sayıyı yan yana
 * koymak hangisinin "asıl" olduğunu belirsizleştirir.
 *
 * SİLME YOKTUR: backend'de DELETE ucu yok, kayıt iptal edilir. Silinmiş
 * bir gelir kaydı geçmiş bir dönemin toplamını sessizce değiştirirdi.
 *
 * İSTEMCİDE ROL KAPISI YOK: uç owner-only ama bu karar backend'de verilir.
 * Member kullanıcı da bu sayfayı açar, istek yapılır ve 403 gelirse
 * açıklanır (playbook §3.1).
 */
export function FinanceEntryListPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<FinanceEntry> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      setResult(await endpoints.financeEntries.list(api, { page: requestedPage }));
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
        <h1 className="ft-page__title">Finans</h1>
        <div className="ft-page__actions">
          <Link className="ft-button ft-button--primary" to="/app/finance/new/income">
            Yeni gelir
          </Link>
          <Link className="ft-button ft-button--secondary" to="/app/finance/new/expense">
            Yeni gider
          </Link>
        </div>
      </header>

      {loading && (
        <Card>
          <div data-testid="finance-loading" className="ft-stack">
            <Skeleton />
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </div>
        </Card>
      )}

      {!loading && error !== null && (
        <Card>
          <ErrorState message={financeErrorMessage(error)} />
          <Button variant="secondary" onClick={() => void load(page)}>
            Tekrar dene
          </Button>
        </Card>
      )}

      {!loading && !error && result && result.data.length === 0 && (
        <Card>
          <div className="ft-empty">
            <p>Henüz finans kaydı yok.</p>
            <p className="ft-muted">İlk gelir ya da gider kaydını ekleyerek başlayın.</p>
          </div>
        </Card>
      )}

      {!loading && !error && result && result.data.length > 0 && (
        <>
          <Card>
            <table className="ft-table" aria-label="Finans kayıtları">
              <thead>
                <tr>
                  <th scope="col">Tarih</th>
                  <th scope="col">Yön</th>
                  <th scope="col">Müşteri</th>
                  <th scope="col">Kategori</th>
                  <th scope="col">Brüt tutar</th>
                  <th scope="col">KDV</th>
                  <th scope="col">Durum</th>
                  <th scope="col">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((entry) => {
                  const voided = entry.voided_at !== null;

                  return (
                    <tr
                      key={entry.id}
                      data-testid={`finance-row-${entry.id}`}
                      // Yalnızca stil kancası; kullanıcıya görünen işaret
                      // Durum sütunundaki rozettir.
                      data-voided={voided ? 'true' : 'false'}
                    >
                      {/* Takvim günü Date'e çevrilmeden biçimlenir. */}
                      <td>{formatFinancialDate(entry.financial_date) ?? '—'}</td>
                      <td>{directionLabel(entry.direction)}</td>
                      <td data-testid="finance-row-customer">{entry.customer?.name ?? '—'}</td>
                      <td>{entry.category ?? '—'}</td>
                      {/* Ham kuruş asla gösterilmez. */}
                      <td>{formatMoney(entry.gross_minor, entry.currency)}</td>
                      <td>{vatRateLabel(entry.vat_rate_bp)}</td>
                      <td>{voided ? <Badge>İptal edildi</Badge> : 'Aktif'}</td>
                      <td>
                        <Link to={`/app/finance/${entry.id}`}>Ayrıntılar</Link>
                      </td>
                    </tr>
                  );
                })}
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
