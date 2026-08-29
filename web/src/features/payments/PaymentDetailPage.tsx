import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ErrorState, Input, LoadingScreen } from '@/components/ui';
import { formatMoney } from '@/lib/finance/money';
import { formatFinancialDate } from '@/features/finance/financeLabels';
/*
 * Zaman damgası biçimlendiricisi denetim özelliğinden alınır: uygulamadaki
 * TEK tarih-saat biçimlendiricisi odur ve Intl kullanmaz (Node'un ICU
 * derlemesi ortama göre değişir). İkinci bir kopya, aynı verinin iki farklı
 * biçimde görünmesi demek olurdu.
 */
import { formatDateTime } from '@/features/audit/auditLabels';
import type { Payment } from '@/types/api';
import { financeEntryLabel } from './paymentFormat';
import { paymentErrorMessage } from './paymentErrors';

/**
 * Ödeme ayrıntısı ve iptal.
 *
 * SİLME YOKTUR, İPTAL VARDIR. İPTAL DAĞITIMLARI SİLMEZ: "bu para neye
 * sayılmıştı" sorusu iptalden sonra da cevaplanabilmeli. Raporlarda
 * sayılmaması iptal işaretinden gelir, satırların yok olmasından değil —
 * bu yüzden arayüz de onları gizlemez.
 *
 * İPTAL TERMİNALDİR: iptal edilmiş ödemede ne "Düzenle" ne "İptal et"
 * gösterilir. Backend ikisini de 422 ile reddediyor; gösterip 422 almak,
 * kullanıcıya çalışmayan bir düğme göstermektir.
 *
 * İPTALDEN SONRA İKİNCİ BİR GET ATILMAZ: uç 204 değil 200 döner ve kaydın
 * yeni hâlini taşır. Yeniden okumak aynı bilgiyi ikinci kez istemek olurdu
 * — ve iki yanıt arasında fark çıkarsa hangisinin doğru olduğu
 * belirsizleşirdi.
 *
 * BU EKRAN HESAP YAPMAZ: üç tutar da yanıttan gelir.
 */
export function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setPayment(await endpoints.payments.get(api, Number(id)));
    } catch (caught) {
      setError(caught);
      setPayment(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleVoid() {
    setVoiding(true);
    setError(null);

    try {
      const trimmed = reason.trim();

      const voided = await endpoints.payments.void(api, Number(id), {
        // Sebep alanı HER ZAMAN gövdede: "bazen gönder, bazen gönderme"
        // iki farklı gövde şekli demektir ve biri er ya da geç test
        // edilmemiş kalır.
        reason: trimmed === '' ? null : trimmed,
      });

      setPayment(voided);
      setConfirming(false);
      setReason('');
    } catch (caught) {
      // Kayıt başka bir oturumda iptal edilmiş olabilir → 422 +
      // payment_already_voided. Backend'in metni gösterilir.
      setError(caught);
      setConfirming(false);
    } finally {
      setVoiding(false);
    }
  }

  if (loading) return <LoadingScreen />;

  if (error !== null && payment === null) {
    return (
      <div className="ft-page">
        <Card>
          <ErrorState message={paymentErrorMessage(error)} />
          <Link className="ft-button ft-button--secondary" to="/app/payments">
            Ödemelere dön
          </Link>
        </Card>
      </div>
    );
  }

  if (payment === null) return null;

  const voided = payment.voided_at !== null;

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">Ödeme</h1>

        {!voided && (
          <div className="ft-page__actions">
            <Link className="ft-button ft-button--secondary" to={`/app/payments/${payment.id}/edit`}>
              Düzenle
            </Link>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              İptal et
            </Button>
          </div>
        )}
      </header>

      {error !== null && <ErrorState message={paymentErrorMessage(error)} />}

      <Card>
        <dl className="ft-details">
          <dt>Durum</dt>
          <dd data-testid="payment-status">{voided ? 'İptal edildi' : 'Aktif'}</dd>

          <dt>Tarih</dt>
          <dd data-testid="payment-date">{formatFinancialDate(payment.financial_date) ?? '—'}</dd>

          <dt>Tutar</dt>
          <dd data-testid="payment-amount">
            {formatMoney(payment.amount_minor, payment.currency)}
          </dd>

          {/* İkisi de backend'de hesaplanır; burada yalnızca gösterilir. */}
          <dt>Dağıtılan</dt>
          <dd data-testid="payment-allocated">
            {formatMoney(payment.allocated_minor, payment.currency)}
          </dd>

          <dt>Kalan</dt>
          <dd data-testid="payment-remaining">
            {formatMoney(payment.remaining_minor, payment.currency)}
          </dd>

          <dt>Yöntem</dt>
          <dd data-testid="payment-method">{payment.method ?? '—'}</dd>

          <dt>Müşteri</dt>
          <dd data-testid="payment-customer">
            {payment.customer ? `#${payment.customer.customer_no} ${payment.customer.name}` : '—'}
          </dd>

          <dt>Not</dt>
          <dd data-testid="payment-note">{payment.note ?? '—'}</dd>

          <dt>Oluşturulma</dt>
          <dd>{formatDateTime(payment.created_at) ?? '—'}</dd>

          <dt>Son güncelleme</dt>
          <dd>{formatDateTime(payment.updated_at) ?? '—'}</dd>

          {voided && (
            <>
              <dt>İptal tarihi</dt>
              <dd data-testid="payment-voided-at">{formatDateTime(payment.voided_at) ?? '—'}</dd>

              <dt>İptal sebebi</dt>
              <dd data-testid="payment-void-reason">{payment.void_reason ?? '—'}</dd>
            </>
          )}
        </dl>
      </Card>

      <Card>
        <h2 className="ft-section__title">Dağıtımlar</h2>

        {payment.allocations.length === 0 ? (
          // Hedefsiz avans geçerli bir durumdur; hata gibi gösterilmez.
          <div className="ft-empty">
            <p>Bu ödeme henüz bir kayda dağıtılmadı.</p>
          </div>
        ) : (
          <table className="ft-table" aria-label="Dağıtımlar">
            <thead>
              <tr>
                <th scope="col">Hedef</th>
                <th scope="col">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {payment.allocations.map((allocation) => (
                <tr key={allocation.id} data-testid={`allocation-row-${allocation.id}`}>
                  {/*
                    Hedefin tutarı ÖDEMENİN para birimiyle biçimlenir:
                    `finance_entry` özeti `currency` taşımıyor. Backend çok
                    para birimini desteklediğinde özete `currency`
                    eklenmelidir.
                  */}
                  <td data-testid="allocation-target">
                    {financeEntryLabel(allocation.finance_entry, payment.currency)}
                  </td>
                  <td data-testid="allocation-amount">
                    {formatMoney(allocation.amount_minor, payment.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {confirming && (
        <Card>
          {/*
            testid ONAY KUTUSUNUN TAMAMINDA: metin, sebep alanı ve iki
            düğme aynı kabuğun içinde.
          */}
          <div data-testid="payment-void-confirm">
            <p>
              Bu ödeme iptal edilecek ve geri alınamayacak. Kayıt silinmez; dağıtımları da yerinde
              kalır.
            </p>

            {/* Sebep isteğe bağlı: backend `sometimes|nullable` diyor. */}
            <Input
              label="İptal sebebi"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              autoComplete="off"
            />

            <div className="ft-form__actions">
              <Button onClick={() => void handleVoid()} loading={voiding}>
                Evet, iptal et
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Vazgeç
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Link className="ft-button ft-button--ghost" to="/app/payments">
        Ödemelere dön
      </Link>
    </div>
  );
}
