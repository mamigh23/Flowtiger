import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, ErrorState } from '@/components/ui';
import { formatMoney } from '@/lib/finance/money';
import { formatFinancialDate } from '@/features/finance/financeLabels';
import type { Paginated, Payment } from '@/types/api';
import { paymentErrorMessage } from './paymentErrors';

/**
 * Ödemeler — birleşik Finans ekranının TAHSİLAT BÖLÜMÜ.
 *
 * Bu dosya eskiden `/app/payments` rotasının kendisiydi. Artık bölüm;
 * başlık, özet kartları ve bölüm seçimi `FinanceHubPage`in elinde ve
 * eski rota oraya yönlendiriliyor (bkz. App.tsx) — mevcut bağlantılar
 * kırılmadı. BURADA DEĞİŞEN TEK ŞEY ÇERÇEVE:
 *
 *   - veri akışı aynı: `GET /payments?page=N`, aynı state, aynı
 *     hata/boş/yükleme durumları;
 *   - `per_page` hâlâ gönderilmez, backend'in varsayılanı (15) geçerli;
 *   - tablo, satır kancaları ve sayfalama aynı;
 *   - `h1` yerine `h2` — ekranda zaten bir `h1` ("Finans") var.
 *
 * Ödeme oluşturma, ayrıntı, düzenleme ve İPTAL (void) akışları KENDİ
 * ekranlarında kaldı: `/app/payments/new`, `/app/payments/:id`,
 * `/app/payments/:id/edit`. Bir tahsilatı iptal etmek geri alınamaz ve
 * dağıtımlarını yerinde bırakır; bu kararı bir liste satırının içine
 * sıkıştırmak, yanlışlıkla tıklanacak bir yıkıcı eylem üretirdi.
 *
 * SIRALAMA BACKEND'İNDİR: financial_date DESC, id DESC. Uçta
 * sort/search/filter parametresi yok, bu yüzden arayüzde de arama kutusu
 * ya da sıralama kontrolü YOK.
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
interface PaymentsSectionProps {
  /**
   * Yüklenen sayfanın `meta.total` değeri — üstteki özet kartı için.
   * Sayı ikinci bir istekle DEĞİL, zaten gelen yanıttan okunur.
   */
  onTotal?: (total: number | null) => void;
}

export function PaymentsSection({ onTotal }: PaymentsSectionProps) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<Payment> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  /* Geri çağrı ref'te: `load` bir efekt bağımlılığı (bkz. finans bölümü). */
  const onTotalRef = useRef(onTotal);
  onTotalRef.current = onTotal;

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      const page = await endpoints.payments.list(api, { page: requestedPage });
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

  return (
    <section className="ft-finance-section" aria-labelledby="ft-finance-payments-title">
      <div className="ft-finance-section__head">
        <h2 className="ft-finance-section__title" id="ft-finance-payments-title">
          Ödemeler
        </h2>
        <p className="ft-finance-section__lead">
          Tahsilatlar ve finans kayıtlarına dağıtılan tutarlar.
        </p>
      </div>

      {loading && (
        <div className="ft-finance-panel" data-testid="payments-loading" aria-hidden="true">
          <span className="ft-skeleton ft-finance-skeleton__head" />
          <span className="ft-skeleton ft-finance-skeleton__row" />
          <span className="ft-skeleton ft-finance-skeleton__row" />
          <span className="ft-skeleton ft-finance-skeleton__row" />
        </div>
      )}

      {!loading && error !== null && (
        <div className="ft-finance-panel ft-finance-panel--notice">
          <ErrorState message={paymentErrorMessage(error)} />
          <Button
            className="ft-finance-action"
            variant="secondary"
            onClick={() => void load(page)}
          >
            Tekrar dene
          </Button>
        </div>
      )}

      {!loading && !error && result && result.data.length === 0 && (
        <div className="ft-finance-panel ft-finance-empty">
          <p className="ft-finance-empty__title">Henüz ödeme yok.</p>
          <p className="ft-finance-empty__note">İlk tahsilatı ekleyerek başlayın.</p>
        </div>
      )}

      {!loading && !error && result && result.data.length > 0 && (
        <>
          <div className="ft-finance-panel ft-finance-panel--table">
            {/* Dar viewportta yalnızca tablo yatayda kayar; panel sayfayı taşırmaz. */}
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
                        <td className="ft-finance-amount" data-testid="payment-row-amount">
                          {formatMoney(payment.amount_minor, payment.currency)}
                        </td>
                        <td className="ft-finance-amount" data-testid="payment-row-allocated">
                          {formatMoney(payment.allocated_minor, payment.currency)}
                        </td>
                        {/*
                          KALAN VURGULANIR: "bu tahsilattan ne kadarı hâlâ
                          dağıtılmadı" sorusu, listedeki asıl sorudur.
                        */}
                        <td
                          className="ft-finance-amount ft-finance-amount--strong"
                          data-testid="payment-row-remaining"
                        >
                          {formatMoney(payment.remaining_minor, payment.currency)}
                        </td>
                        <td>
                          {voided ? (
                            <span className="ft-finance-state ft-finance-state--voided">
                              İptal edildi
                            </span>
                          ) : (
                            <span className="ft-finance-state">Aktif</span>
                          )}
                        </td>
                        <td>
                          {/* Altı çizili bağlantı yok. */}
                          <Link className="ft-finance-link" to={`/app/payments/${payment.id}`}>
                            Ayrıntılar
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {result.meta.last_page > 1 && (
            <nav className="ft-finance-pager" aria-label="Sayfalama">
              <Button
                className="ft-finance-action"
                variant="secondary"
                onClick={() => setPage((current) => current - 1)}
                disabled={result.meta.current_page <= 1}
              >
                Önceki
              </Button>

              <span className="ft-finance-pager__status">
                Sayfa {result.meta.current_page} / {result.meta.last_page}
              </span>

              <Button
                className="ft-finance-action"
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
