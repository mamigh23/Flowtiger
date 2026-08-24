import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ErrorState, Input, LoadingScreen } from '@/components/ui';
import { formatMoney } from '@/lib/finance/money';
import type { FinanceEntry } from '@/types/api';
/*
 * Zaman damgası biçimlendiricisi denetim özelliğinden alınır.
 *
 * Uygulamadaki TEK tarih-saat biçimlendiricisi odur ve Intl kullanmaz
 * (Node'un ICU derlemesi ortama göre değişir). Buraya ikinci bir kopya
 * yazmak, aynı verinin iki farklı biçimde görünmesi demek olurdu.
 */
import { formatDateTime } from '@/features/audit/auditLabels';
import {
  basisLabel,
  directionLabel,
  formatFinancialDate,
  roundingLabel,
  vatApplicableLabel,
  vatRateLabel,
} from './financeLabels';
import { financeErrorMessage } from './financeErrors';

/**
 * Finans kaydı ayrıntısı ve iptal.
 *
 * SİLME YOKTUR, İPTAL VARDIR. Backend'de DELETE ucu yok: silinmiş bir
 * gelir kaydı geçmiş bir dönemin toplamını sessizce değiştirirdi. İptal
 * ise kaydı yerinde bırakır ve neden iptal edildiğini saklar.
 *
 * İPTAL TERMİNALDİR. İptal edilmiş kayıtta ne "Düzenle" ne "İptal et"
 * gösterilir — backend ikisini de 422 ile reddediyor ve gösterip 422
 * almak, kullanıcıya çalışmayan bir düğme göstermektir.
 *
 * İPTALDEN SONRA İKİNCİ BİR GET ATILMAZ: uç 204 değil 200 döner ve kaydın
 * yeni hâlini taşır. Yeniden okumak, aynı bilgiyi ikinci kez istemek
 * olurdu — ve iki yanıt arasında fark çıkarsa hangisinin doğru olduğu
 * belirsizleşirdi.
 *
 * BU EKRAN HESAP YAPMAZ: net, KDV ve brüt sunucudan gelir.
 */
export function FinanceEntryDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [entry, setEntry] = useState<FinanceEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setEntry(await endpoints.financeEntries.get(api, Number(id)));
    } catch (caught) {
      setError(caught);
      setEntry(null);
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

      const voided = await endpoints.financeEntries.void(api, Number(id), {
        // Sebep alanı HER ZAMAN gövdede: "bazen gönder, bazen gönderme"
        // iki farklı gövde şekli demektir ve biri er ya da geç test
        // edilmemiş kalır.
        reason: trimmed === '' ? null : trimmed,
      });

      setEntry(voided);
      setConfirming(false);
      setReason('');
    } catch (caught) {
      // Kayıt başka bir oturumda iptal edilmiş olabilir → 422 +
      // finance_entry_already_voided. Backend'in metni gösterilir.
      setError(caught);
      setConfirming(false);
    } finally {
      setVoiding(false);
    }
  }

  if (loading) return <LoadingScreen />;

  if (error !== null && entry === null) {
    return (
      <div className="ft-page">
        <Card>
          <ErrorState message={financeErrorMessage(error)} />
          <Link className="ft-button ft-button--secondary" to="/app/finance">
            Finans kayıtlarına dön
          </Link>
        </Card>
      </div>
    );
  }

  if (entry === null) return null;

  const voided = entry.voided_at !== null;

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">{directionLabel(entry.direction)} kaydı</h1>

        {/* İptal edilmiş kayıtta hiçbir yazma eylemi sunulmaz. */}
        {!voided && (
          <div className="ft-page__actions">
            <Link className="ft-button ft-button--secondary" to={`/app/finance/${entry.id}/edit`}>
              Düzenle
            </Link>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              İptal et
            </Button>
          </div>
        )}
      </header>

      {error !== null && <ErrorState message={financeErrorMessage(error)} />}

      <Card>
        <dl className="ft-details">
          <dt>Durum</dt>
          <dd data-testid="finance-status">{voided ? 'İptal edildi' : 'Aktif'}</dd>

          <dt>Tarih</dt>
          <dd data-testid="finance-date">{formatFinancialDate(entry.financial_date) ?? '—'}</dd>

          <dt>Net</dt>
          <dd data-testid="finance-net">{formatMoney(entry.net_minor, entry.currency)}</dd>

          <dt>KDV oranı</dt>
          <dd data-testid="finance-vat-rate">{vatRateLabel(entry.vat_rate_bp)}</dd>

          <dt>KDV</dt>
          <dd data-testid="finance-vat">{formatMoney(entry.vat_minor, entry.currency)}</dd>

          <dt>Brüt</dt>
          <dd data-testid="finance-gross">{formatMoney(entry.gross_minor, entry.currency)}</dd>

          {/*
            AÇIKLANABİLİRLİK: sonucun nasıl çıktığı. Blok backend'de
            saklanmaz, her okumada hesaplanır; arayüz yalnızca yansıtır.
          */}
          <dt>Hesaplama</dt>
          <dd data-testid="finance-calculation">
            {basisLabel(entry.calculation.basis)} · {roundingLabel(entry.calculation.rounding)} ·{' '}
            {vatApplicableLabel(entry.calculation.vat_applicable)}
          </dd>

          <dt>Müşteri</dt>
          <dd data-testid="finance-customer">
            {entry.customer ? `#${entry.customer.customer_no} ${entry.customer.name}` : '—'}
          </dd>

          <dt>Kategori</dt>
          <dd data-testid="finance-category">{entry.category ?? '—'}</dd>

          <dt>Not</dt>
          <dd data-testid="finance-note">{entry.note ?? '—'}</dd>

          <dt>Oluşturulma</dt>
          <dd>{formatDateTime(entry.created_at) ?? '—'}</dd>

          <dt>Son güncelleme</dt>
          <dd>{formatDateTime(entry.updated_at) ?? '—'}</dd>

          {voided && (
            <>
              <dt>İptal tarihi</dt>
              <dd data-testid="finance-voided-at">{formatDateTime(entry.voided_at) ?? '—'}</dd>

              <dt>İptal sebebi</dt>
              <dd data-testid="finance-void-reason">{entry.void_reason ?? '—'}</dd>
            </>
          )}
        </dl>
      </Card>

      {confirming && (
        <Card>
          {/*
            testid ONAY KUTUSUNUN TAMAMINDA: metin, sebep alanı ve iki
            düğme aynı kabuğun içinde. Yalnızca metne konsaydı "onay
            kutusundaki Vazgeç" gibi bir sorgu, sayfadaki başka bir
            Vazgeç'i yakalayabilirdi.
          */}
          <div data-testid="finance-void-confirm">
            <p>
              Bu finans kaydı iptal edilecek ve geri alınamayacak. Kayıt silinmez; iptal edilmiş
              olarak kalır.
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

      <Link className="ft-button ft-button--ghost" to="/app/finance">
        Finans kayıtlarına dön
      </Link>
    </div>
  );
}
