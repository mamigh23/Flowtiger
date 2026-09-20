import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, ErrorState } from '@/components/ui';
import { formatMoney } from '@/lib/finance/money';
import type { FinanceEntry, Paginated } from '@/types/api';
import { directionLabel, formatFinancialDate, vatRateLabel } from './financeLabels';
import { financeErrorMessage } from './financeErrors';

/**
 * Finans kayıtları — birleşik Finans ekranının GELİR/GİDER BÖLÜMÜ.
 *
 * Bu dosya eskiden `/app/finance` rotasının kendisiydi ve kendi
 * `ft-page` sarmalayıcısını, kendi `h1`ini ve kendi eylem düğmelerini
 * taşıyordu. Artık bölüm; başlık, özet kartları ve bölüm seçimi
 * `FinanceHubPage`in elinde. BURADA DEĞİŞEN TEK ŞEY ÇERÇEVE:
 *
 *   - veri akışı aynı: `GET /finance-entries?page=N`, aynı state,
 *     aynı hata/boş/yükleme durumları;
 *   - `per_page` hâlâ gönderilmez, backend'in varsayılanı (15) geçerli;
 *   - tablo, satır kancaları ve sayfalama aynı;
 *   - `h1` yerine `h2` — ekranda zaten bir `h1` ("Finans") var ve iki
 *     `h1`, ekran okuyucuda sayfanın iki ayrı sayfa olduğunu söylerdi.
 *
 * SIRALAMA BACKEND'İNDİR: financial_date DESC, id DESC. Uçta
 * sort/search/filter parametresi yok, bu yüzden arayüzde de arama kutusu
 * ya da sıralama kontrolü YOK — olsaydı çalışmayan bir özellik vaat
 * ederdik (playbook §11).
 *
 * LİSTEDE GÖSTERİLEN TUTAR BRÜTTÜR: kasadan gerçekten giren/çıkan para
 * odur. Net ve KDV ayrımı ayrıntı ekranına ait; listede üç sayıyı yan yana
 * koymak hangisinin "asıl" olduğunu belirsizleştirir.
 *
 * SİLME YOKTUR: backend'de DELETE ucu yok, kayıt iptal edilir. Silinmiş
 * bir gelir kaydı geçmiş bir dönemin toplamını sessizce değiştirirdi.
 *
 * İSTEMCİDE ROL KAPISI YOK: uç owner-only ama bu karar backend'de verilir.
 * Member kullanıcı da bu bölümü açar, istek yapılır ve 403 gelirse
 * açıklanır (playbook §3.1).
 */
interface FinanceEntriesSectionProps {
  /**
   * Yüklenen sayfanın `meta.total` değeri — üstteki özet kartı için.
   * Sayı ikinci bir istekle DEĞİL, zaten gelen yanıttan okunur; böylece
   * karttaki sayı ile listedeki kayıtlar asla çelişemez.
   */
  onTotal?: (total: number | null) => void;
}

export function FinanceEntriesSection({ onTotal }: FinanceEntriesSectionProps) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<FinanceEntry> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  /*
   * Geri çağrı REF'TE TUTULUR, bağımlılıkta değil. `load` bir
   * `useEffect` bağımlılığı; prop olarak satır içi bir fonksiyon
   * geçilseydi her render yeni bir kimlik üretir ve liste sonsuz döngüye
   * girerdi.
   */
  const onTotalRef = useRef(onTotal);
  onTotalRef.current = onTotal;

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      const page = await endpoints.financeEntries.list(api, { page: requestedPage });
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
    <section className="ft-finance-section" aria-labelledby="ft-finance-entries-title">
      <div className="ft-finance-section__head">
        <h2 className="ft-finance-section__title" id="ft-finance-entries-title">
          Finans kayıtları
        </h2>
        <p className="ft-finance-section__lead">
          Gelir ve gider kayıtları; en yeni tarihli kayıt üstte.
        </p>
      </div>

      {loading && (
        <div className="ft-finance-panel" data-testid="finance-loading" aria-hidden="true">
          <span className="ft-skeleton ft-finance-skeleton__head" />
          <span className="ft-skeleton ft-finance-skeleton__row" />
          <span className="ft-skeleton ft-finance-skeleton__row" />
          <span className="ft-skeleton ft-finance-skeleton__row" />
        </div>
      )}

      {!loading && error !== null && (
        <div className="ft-finance-panel ft-finance-panel--notice">
          <ErrorState message={financeErrorMessage(error)} />
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
          <p className="ft-finance-empty__title">Henüz finans kaydı yok.</p>
          <p className="ft-finance-empty__note">
            İlk gelir ya da gider kaydını ekleyerek başlayın.
          </p>
        </div>
      )}

      {!loading && !error && result && result.data.length > 0 && (
        <>
          <div className="ft-finance-panel ft-finance-panel--table">
            {/*
              Dar viewportta yalnızca tablo yatayda kayar; panel sayfayı
              taşırmaz. Bu tablo 8 kolonludur (uygulamadaki en geniş
              tablo) — sarmalayıcı en çok burada işe yarar.
            */}
            <div className="ft-table-scroll">
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
                        <td>
                          <span
                            className={`ft-finance-chip ft-finance-chip--${
                              entry.direction === 'in' ? 'in' : 'out'
                            }`}
                          >
                            {directionLabel(entry.direction)}
                          </span>
                        </td>
                        <td data-testid="finance-row-customer">{entry.customer?.name ?? '—'}</td>
                        <td>{entry.category ?? '—'}</td>
                        {/* Ham kuruş asla gösterilmez. */}
                        <td className="ft-finance-amount">
                          {formatMoney(entry.gross_minor, entry.currency)}
                        </td>
                        <td>{vatRateLabel(entry.vat_rate_bp)}</td>
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
                          {/* Altı çizili bağlantı yok: liste içindeki bir
                              eylem, düz metin değil bir kontrol gibi
                              görünmeli. */}
                          <Link className="ft-finance-link" to={`/app/finance/${entry.id}`}>
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
