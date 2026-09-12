import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { ErrorState } from '@/components/ui';
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
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * Sınıflar `ft-customers-*` önekiyle BU SAYFAYA ÖZELDİR; paylaşılan
 * `.ft-button` / `.ft-page__header` / `.ft-table` kuralları değişmez.
 *
 * TABLO TABLO OLARAK KALIR. Dar ekranda satırları `display: block` ile
 * karta çevirmek, tarayıcıda `<table>`ın örtük ARIA rolünü de silerdi:
 * ekran okuyucu kolon başlıklarını kaybederdi. Dar ekran çözümü, mevcut
 * `.ft-table-scroll` sarmalayıcısıdır — kolon gizlemez, yalnızca tabloyu
 * kendi içinde kaydırır.
 *
 * VERİ VE İSTEK SÖZLEŞMESİ AYNI: aynı uç, aynı sayfalama, aynı alanlar.
 */

/**
 * Ad baş harfleri — yalnızca GÖRSEL bir işaret.
 *
 * `aria-hidden` ile sunulur: ekran okuyucuda "ZK Zeynep Kaya" diye iki
 * kez okunmamalı, ve müşteri bağlantısının erişilebilir adı adın tam
 * kendisi kalmalı.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('tr-TR');
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toLocaleUpperCase('tr-TR');
}

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

  /*
   * ÖZET KARTLARI YALNIZCA GERÇEKTEN HESAPLANABİLEN DEĞERLERİ GÖSTERİR.
   *
   * `meta.total` tüm kayıtları kapsar. Telefon sayımı ise yalnızca AÇIK
   * SAYFADAN çıkarılabilir: uçta filtre yok ve tüm sayfaları çekmek,
   * bir özet kartı için N istek atmak olurdu. Kapsam kartın üstünde
   * yazılıdır; tek sayfa varsa sayfa zaten tamamıdır.
   *
   * "Aktif müşteri", "bu ay eklenen" ve "son müşteri" BİLEREK YOK:
   * müşteride durum alanı yok, sıralama customer_no ASC sabit (yani ilk
   * sayfadan en yenisi bilinemez) ve "bu ay" için sunucu tarafı bir uç
   * yok. Hesaplanamayan sayı uydurulmaz.
   */
  const rows = result?.data ?? [];
  const withPhone = rows.filter((customer) => customer.phone !== null).length;
  const singlePage = result !== null && result.meta.last_page <= 1;
  const scopeNote = singlePage ? 'tüm müşteriler' : 'bu sayfada';

  return (
    <div className="ft-page ft-customers">
      {/* ----------------------------------------------------- başlık */}
      <header className="ft-customers-hero">
        <div className="ft-customers-hero__text">
          <h1 className="ft-customers-hero__title">Müşteriler</h1>
          <p className="ft-customers-hero__lead">
            Müşteri ilişkilerinizi tek bir yerden yönetin.
          </p>
        </div>

        <Link className="ft-customers-cta" to="/app/customers/new">
          <span aria-hidden="true">+</span> Yeni müşteri
        </Link>
      </header>

      {/* ------------------------------------------------------- özet */}
      {!loading && !error && result && rows.length > 0 && (
        <section className="ft-customers-summary" aria-label="Müşteri özeti">
          <article className="ft-customers-stat" data-testid="customers-summary-total">
            <span className="ft-customers-stat__label">Toplam müşteri</span>
            <span className="ft-customers-stat__value">{result.meta.total}</span>
            <span className="ft-customers-stat__note">tüm kayıtlar</span>
          </article>

          <article className="ft-customers-stat" data-testid="customers-summary-phone">
            <span className="ft-customers-stat__label">Telefonu kayıtlı</span>
            <span className="ft-customers-stat__value">{withPhone}</span>
            <span className="ft-customers-stat__note">
              {rows.length} kayıttan · {scopeNote}
            </span>
          </article>

          <article className="ft-customers-stat" data-testid="customers-summary-page">
            <span className="ft-customers-stat__label">Sayfa</span>
            <span className="ft-customers-stat__value">
              {result.meta.current_page}
              <span className="ft-customers-stat__suffix">/{result.meta.last_page}</span>
            </span>
            <span className="ft-customers-stat__note">sayfa başına {result.meta.per_page}</span>
          </article>
        </section>
      )}

      {/* ---------------------------------------------------- yükleme */}
      {loading && (
        <div className="ft-customers-panel" data-testid="customers-loading" aria-hidden="true">
          <div className="ft-customers-panel__head">
            <span className="ft-skeleton ft-customers-skeleton__head" />
          </div>
          {/*
            İskelet gerçek satırın ızgarasını taklit eder: yuvarlak avatar
            + iki metin satırı. Veri gelince içerik yerinde belirir.
          */}
          <ul className="ft-customers-skeleton-rows">
            {[0, 1, 2].map((i) => (
              <li key={i} className="ft-customers-skeleton-row">
                <span className="ft-skeleton ft-customers-skeleton__avatar" />
                <span className="ft-customers-skeleton-row__text">
                  <span className="ft-skeleton" style={{ width: i === 0 ? '40%' : '32%' }} />
                  <span className="ft-skeleton" style={{ width: '24%' }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ------------------------------------------------------- hata */}
      {!loading && error !== null && (
        <div className="ft-customers-panel ft-customers-panel--message">
          <ErrorState message={customerErrorMessage(error)} />
          <button type="button" className="ft-customers-action" onClick={() => void load(page)}>
            Tekrar dene
          </button>
        </div>
      )}

      {/* -------------------------------------------------- boş durum */}
      {!loading && !error && result && rows.length === 0 && (
        <div className="ft-customers-empty">
          <span className="ft-customers-empty__icon" aria-hidden="true">
            ☺
          </span>
          {/* Metin AYNEN korunur: boş durumun davranışı bu turda değişmedi. */}
          <h2 className="ft-customers-empty__title">Henüz müşteri yok.</h2>
          <p className="ft-customers-empty__text">
            İlk müşterinizi ekleyerek başlayın. Eklediğiniz müşteriler burada numarası ve
            iletişim bilgisiyle listelenir.
          </p>
          {/*
            Başlıktaki CTA ile AYNI ADI taşımaz: iki "Yeni müşteri"
            bağlantısı ekran okuyucuda ayırt edilemez olurdu.
          */}
          <Link className="ft-customers-cta" to="/app/customers/new">
            <span aria-hidden="true">+</span> İlk müşteriyi ekle
          </Link>
        </div>
      )}

      {/* ------------------------------------------------------ liste */}
      {!loading && !error && result && rows.length > 0 && (
        <>
          <section className="ft-customers-panel">
            <div className="ft-customers-panel__head">
              <h2 className="ft-customers-panel__title">Müşteri listesi</h2>
              <span className="ft-customers-panel__count" data-testid="customers-total">
                {result.meta.total} müşteri
              </span>
            </div>

            {/* Dar viewportta yalnızca tablo yatayda kayar; panel sayfayı taşırmaz. */}
            <div className="ft-table-scroll">
              <table className="ft-table ft-customers-table" aria-label="Müşteriler">
                <thead>
                  <tr>
                    <th scope="col">No</th>
                    <th scope="col">Müşteri</th>
                    <th scope="col">Telefon</th>
                    <th scope="col">
                      <span className="ft-visually-hidden">İşlem</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((customer) => (
                    <tr key={customer.id} data-testid={`customer-row-${customer.id}`}>
                      {/* Kullanıcıya gösterilen numara customer_no'dur, id değil. */}
                      <td className="ft-customers-table__no">{customer.customer_no}</td>

                      <td>
                        <span className="ft-customers-identity">
                          {/*
                            Baş harfler yalnızca görsel bir işaret;
                            `aria-hidden` olmasaydı bağlantının
                            erişilebilir adına karışırdı.
                          */}
                          <span className="ft-customers-avatar" aria-hidden="true">
                            {initials(customer.name)}
                          </span>
                          <Link
                            className="ft-customers-name"
                            to={`/app/customers/${customer.id}`}
                          >
                            {customer.name}
                          </Link>
                        </span>
                      </td>

                      {/* Telefon yoksa uydurma değer değil, boşluk işareti. */}
                      <td className="ft-customers-table__phone">{customer.phone ?? '—'}</td>

                      <td className="ft-customers-table__action">
                        <Link
                          className="ft-customers-action ft-customers-action--quiet"
                          to={`/app/customers/${customer.id}`}
                        >
                          Ayrıntılar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {result.meta.last_page > 1 && (
            <nav className="ft-customers-pager" aria-label="Sayfalama">
              <button
                type="button"
                className="ft-customers-action"
                onClick={() => setPage((current) => current - 1)}
                disabled={result.meta.current_page <= 1}
              >
                Önceki
              </button>

              <span className="ft-customers-pager__status">
                Sayfa {result.meta.current_page} / {result.meta.last_page}
              </span>

              <button
                type="button"
                className="ft-customers-action"
                onClick={() => setPage((current) => current + 1)}
                disabled={result.meta.current_page >= result.meta.last_page}
              >
                Sonraki
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
