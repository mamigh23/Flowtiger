import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Badge, Button, Card, ErrorState, Skeleton } from '@/components/ui';
import { formatMoney } from '@/lib/finance/money';
import { formatFinancialDate } from '@/features/finance/financeLabels';
import type { Paginated, Payment } from '@/types/api';
import { paymentErrorMessage } from './paymentErrors';

/**
 * Ödeme listesi.
 *
 * SIRALAMA BACKEND'İNDİR: financial_date DESC, id DESC. Uçta
 * sort/search/filter parametresi yok, bu yüzden arayüzde de arama kutusu
 * ya da sıralama kontrolü YOK.
 *
 * per_page GÖNDERİLMEZ: backend'in kendi varsayılanı (15) kullanılır. Üst
 * sınır (100) zaten backend'de.
 *
 * ÜÇ TUTAR DA YANITTAN GELİR. `allocated_minor` ve `remaining_minor`
 * backend'de her okumada hesaplanır; arayüz `amount - allocated` yapmaz.
 * Yapsaydı, backend kuralı değiştirdiği gün (ör. iptal edilmiş dağıtımları
 * dışlarsa) istemcideki kopya sessizce yanlış sonuç verirdi.
 *
 * SİLME YOKTUR: backend'de DELETE ucu yok, ödeme iptal edilir ve
 * dağıtımları yerinde kalır.
 *
 * İSTEMCİDE ROL KAPISI YOK: uç owner-only ama karar backend'de verilir.
 */
export function PaymentListPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<Payment> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      setResult(await endpoints.payments.list(api, { page: requestedPage }));
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
        <h1 className="ft-page__title">Ödemeler</h1>
        <div className="ft-page__actions">
          <Link className="ft-button ft-button--primary" to="/app/payments/new">
            Yeni ödeme
          </Link>
        </div>
      </header>

      {loading && (
        <Card>
          <div data-testid="payments-loading" className="ft-stack">
            <Skeleton />
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </div>
        </Card>
      )}

      {!loading && error !== null && (
        <Card>
          <ErrorState message={paymentErrorMessage(error)} />
          <Button variant="secondary" onClick={() => void load(page)}>
            Tekrar dene
          </Button>
        </Card>
      )}

      {!loading && !error && result && result.data.length === 0 && (
        <Card>
          <div className="ft-empty">
            <p>Henüz ödeme yok.</p>
            <p className="ft-muted">İlk tahsilatı ekleyerek başlayın.</p>
          </div>
        </Card>
      )}

      {!loading && !error && result && result.data.length > 0 && (
        <>
          <Card>
            {/* Dar viewportta yalnızca tablo yatayda kayar; kart sayfayı taşırmaz. */}
            <div className="ft-table-scroll">
              <table className="ft-table" aria-label="Ödemeler">
                <thead>
                  <tr>
                    <th scope="col">Tarih</th>
                    <th scope="col">Müşteri</th>
                    <th scope="col">Yöntem</th>
                    <th scope="col">Tutar</th>
                    <th scope="col">Dağıtılan</th>
                    <th scope="col">Kalan</th>
                    <th scope="col">Durum</th>
                    <th scope="col">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((payment) => {
                    const voided = payment.voided_at !== null;

                    return (
                      <tr
                        key={payment.id}
                        data-testid={`payment-row-${payment.id}`}
                        // Yalnızca stil kancası; kullanıcıya görünen işaret
                        // Durum sütunundaki rozettir.
                        data-voided={voided ? 'true' : 'false'}
                      >
                        {/* Takvim günü Date'e çevrilmeden biçimlenir. */}
                        <td>{formatFinancialDate(payment.financial_date) ?? '—'}</td>
                        <td data-testid="payment-row-customer">{payment.customer?.name ?? '—'}</td>
                        {/* `method` serbest metindir; ne gelirse yazılır. */}
                        <td data-testid="payment-row-method">{payment.method ?? '—'}</td>
                        <td data-testid="payment-row-amount">
                          {formatMoney(payment.amount_minor, payment.currency)}
                        </td>
                        <td data-testid="payment-row-allocated">
                          {formatMoney(payment.allocated_minor, payment.currency)}
                        </td>
                        <td data-testid="payment-row-remaining">
                          {formatMoney(payment.remaining_minor, payment.currency)}
                        </td>
                        <td>{voided ? <Badge>İptal edildi</Badge> : 'Aktif'}</td>
                        <td>
                          <Link to={`/app/payments/${payment.id}`}>Ayrıntılar</Link>
                        </td>
                      </tr>
                    );
                  })}
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
