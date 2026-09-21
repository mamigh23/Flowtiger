import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, endpoints } from '@/lib/api';
import { Button, ErrorState } from '@/components/ui';
import type { AuditLog, Paginated } from '@/types/api';
import { auditActionLabel, auditableTypeLabel, formatDateTime } from './auditLabels';
import { auditErrorMessage } from './auditErrors';
import { describeChanges, hasVisibleDetails, visibleMetadata } from './auditFormat';

/**
 * Denetim kayıtları.
 *
 * SALT OKUNUR EKRAN. Backend'de audit için yalnızca GET /audit-logs
 * vardır; store/update/destroy yoktur ve POST 405 döner. Audit kaydı
 * yalnızca domain işlemlerinin yan etkisi olarak doğar — API üzerinden
 * yazılabilseydi iz uydurmak mümkün olurdu. Bu yüzden burada hiçbir
 * yazma eylemi, dışa aktarma ya da silme düğmesi yok.
 *
 * ARAMA / FİLTRE / SIRALAMA YOK. Uç yalnızca `page` ve `per_page`
 * tanıyor; başka bir parametre sessizce yok sayılır. Bir filtre kutusu
 * koymak, çalışmayan bir özelliği varmış gibi göstermek olurdu.
 * Sıralama backend'de SABİT: created_at DESC, id DESC.
 *
 * İSTEMCİDE YETKİ KARARI YOK (playbook §3.1). Uç owner'a özeldir
 * (AuditLogPolicy → Role::viewsAuditLogs()) ama arayüz kullanıcının
 * rolüne bakıp isteği engellemez; isteği yapar, backend 403 dönerse
 * açıklar.
 *
 * "GİRİŞ GEÇMİŞİ" BURADA YOKTUR ve vaat edilmez. login/logout gibi
 * kayıtların company_id'si NULL'dur; AuditLog modelindeki CompanyScope
 * onları bu uçtan tamamen dışarıda bırakır. Ekran yalnızca aktif
 * şirkette olan biteni gösterir.
 *
 * AYRI DETAY ROTASI YOK. Backend'de tekil audit ucu yok; /app/audit/:id
 * gibi bir rota ancak listedeki nesneyi taşıyarak ya da uydurma bir
 * istekle çalışırdı. Ayrıntı satırın içinde açılır.
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * Sınıflar `ft-audit-*` önekiyle BU EKRANA özeldir ve ekip/davet
 * ekranlarıyla aynı dili paylaşır: hero ışığı, yükseltilmiş kart yüzeyi,
 * hairline kenar, yumuşak gölge, pill rozetler. Paylaşılan `.ft-table`,
 * `.ft-details`, `.ft-button`, `.ft-skeleton` kuralları DEĞİŞTİRİLMEZ;
 * üzerlerine yalnızca bu ekranın kapsamında yazılır.
 *
 * VERİ AYNEN GÖSTERİLİR. Hangi alanın görüneceğine hâlâ `auditFormat`
 * karar veriyor (izin listesi, hassas anahtarlar, JSON dökülmez) ve bu
 * tur ona DOKUNMADI. Arayüze yeni bir alan eklenmedi: e-posta, token,
 * user_agent ya da ham metadata hiçbir yerde görünmez.
 *
 * ÖZET TEK SAYI TAŞIR: `meta.total` — backend'in saydığı, bu şirketteki
 * tüm denetim kayıtları. Eylem ya da kişi dağılımı veren bir uç yok;
 * sayfanın kayıtlarını sayıp "bu hafta 12 silme" demek eksik bir sayıyı
 * gerçek gibi göstermek olurdu.
 *
 * TABLODA BAĞLANTI YOK: nesne sütunu bir kaydın kimliğini söyler ama
 * ona gitmez — silinmiş bir müşterinin kaydı da burada durur ve oraya
 * giden bir bağlantı 404'e açılırdı.
 */
export function AuditLogListPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<AuditLog> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  /** Açık olan tek ayrıntı; aynı anda birden fazlası açılmaz. */
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    // Sayfa değişince açık panel kapanır: yeni sayfanın satırlarıyla
    // ilgisiz bir ayrıntı açık kalmamalı.
    setExpanded(null);

    try {
      // `per_page` GÖNDERİLMEZ: backend varsayılanı 20 ve arayüzün
      // bundan farklı bir isteği yok. Göndermek, doğrulanabilir tek
      // sonucu 422 olan gereksiz bir parametre eklemek olurdu.
      setResult(await endpoints.auditLogs.list(api, { page: requestedPage }));
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
    <div className="ft-page ft-audit">
      {/* ----------------------------------------------------- başlık */}
      <header className="ft-audit-hero">
        <div className="ft-audit-hero__text">
          <span className="ft-audit-hero__eyebrow">Güvenlik</span>
          <h1 className="ft-audit-hero__title">Denetim</h1>
          <p className="ft-audit-hero__lead">
            Bu şirkette kimin, neyi, ne zaman yaptığının değiştirilemez kaydı. En yeni
            kayıt üstte.
          </p>
        </div>
      </header>

      {/* ------------------------------------------------------- özet */}
      {!loading && !error && result && result.data.length > 0 && (
        <section className="ft-audit-summary" aria-labelledby="ft-audit-summary-title">
          <h2 className="ft-visually-hidden" id="ft-audit-summary-title">
            Denetim özeti
          </h2>

          <article className="ft-audit-stat" data-testid="audit-summary-total">
            <span className="ft-audit-stat__label">Toplam kayıt</span>
            <span className="ft-audit-stat__value">{result.meta.total}</span>
            <span className="ft-audit-stat__note">bu şirketteki tüm kayıtlar</span>
          </article>

          {/*
            Kapsam kartı bir SAYI taşımaz, bir SINIR anlatır: giriş/çıkış
            kayıtları şirkete bağlı olmadığı için bu listede yoktur. Bunu
            söylemezsek kullanıcı eksik bir kayıt aradığını sanır.
          */}
          <article className="ft-audit-stat ft-audit-stat--scope" data-testid="audit-summary-scope">
            <span className="ft-audit-stat__label">Kapsam</span>
            <span className="ft-audit-stat__text">Aktif şirket · salt okunur</span>
            <span className="ft-audit-stat__note">Giriş/çıkış geçmişi bu listede yer almaz.</span>
          </article>
        </section>
      )}

      {/* ---------------------------------------------------- yükleme */}
      {loading && (
        <div className="ft-audit-panel" data-testid="audit-loading" aria-hidden="true">
          <span className="ft-skeleton ft-audit-skeleton__head" />
          <span className="ft-skeleton ft-audit-skeleton__row" />
          <span className="ft-skeleton ft-audit-skeleton__row" />
          <span className="ft-skeleton ft-audit-skeleton__row" />
        </div>
      )}

      {/* ------------------------------------------------- hata / 403 */}
      {!loading && error !== null && (
        <div className="ft-audit-panel ft-audit-panel--notice">
          <ErrorState message={auditErrorMessage(error)} />
          <Button className="ft-audit-action" variant="secondary" onClick={() => void load(page)}>
            Tekrar dene
          </Button>
        </div>
      )}

      {/* -------------------------------------------------------- boş */}
      {!loading && !error && result && result.data.length === 0 && (
        <div className="ft-audit-panel ft-audit-empty">
          <p className="ft-audit-empty__title">Henüz denetim kaydı yok.</p>
          <p className="ft-audit-empty__note">
            Bu şirkette bir kayıt oluşturulduğunda, güncellendiğinde ya da bir üyelik
            değiştiğinde burada görünür.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------ liste */}
      {!loading && !error && result && result.data.length > 0 && (
        <>
          <div className="ft-audit-panel ft-audit-panel--table">
            {/*
              Dar viewportta yalnızca tablo yatayda kayar; panel sayfayı
              taşırmaz. Sarmalayıcı tablonun DOĞRUDAN ebeveyni olmalı.
            */}
            <div className="ft-table-scroll">
              <table className="ft-table" aria-label="Denetim kayıtları">
                <thead>
                  <tr>
                    <th scope="col">Eylem</th>
                    <th scope="col">Kim</th>
                    <th scope="col">Nesne</th>
                    <th scope="col">IP</th>
                    <th scope="col">Zaman</th>
                    <th scope="col">
                      <span className="ft-visually-hidden">Ayrıntı</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((log) => {
                    const open = expanded === log.id;
                    const changes = describeChanges(log.old_values, log.new_values);
                    const metadata = visibleMetadata(log.metadata);

                    return (
                      <Fragment key={log.id}>
                        <tr
                          data-testid={`audit-row-${log.id}`}
                          className={open ? 'ft-audit-row--open' : undefined}
                        >
                          {/* Tanınmayan kod uydurulmaz, ham hâliyle gösterilir. */}
                          <td>
                            <span className="ft-audit-action-chip">
                              {auditActionLabel(log.action)}
                            </span>
                          </td>

                          {/*
                            Aktör ÖZET olarak gelir: yalnızca id ve name.
                            E-posta backend'de bilinçli olarak dışarıda
                            bırakılmıştır; `actor` nesnesi dökülmez, sadece
                            adı okunur.

                            `actor` KOŞULLU bir alandır: user_id null olan
                            kayıtta anahtar hiç gelmez. "Sistem" gibi bir
                            metin yazmak doğrulanmamış bir varsayım olurdu.

                            Baş harfler yalnızca GÖRSEL bir işaret ve
                            `aria-hidden`: ekran okuyucu adı bir kez okur.
                          */}
                          <td>
                            {log.actor ? (
                              <span className="ft-audit-actor">
                                <span className="ft-audit-actor__avatar" aria-hidden="true">
                                  {initials(log.actor.name)}
                                </span>
                                <span className="ft-audit-actor__name">{log.actor.name}</span>
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>

                          <td className="ft-audit-object">
                            {log.auditable
                              ? `${auditableTypeLabel(log.auditable.type)} #${log.auditable.id}`
                              : '—'}
                          </td>

                          {/*
                            IP, "bu işlem beklenmedik bir yerden mi
                            yapıldı" sorusunun cevabıdır ve audit'in asıl
                            işlerinden biridir. user_agent ise yanıtta hiç
                            yoktur.
                          */}
                          <td className="ft-audit-ip">{log.ip_address ?? '—'}</td>

                          {/* Ham ISO metni gösterilmez; biçim denetim ekranınınki. */}
                          <td className="ft-audit-time">{formatDateTime(log.created_at) ?? '—'}</td>

                          <td className="ft-audit-row-action">
                            {/*
                              Gösterilecek güvenli bir ayrıntı yoksa düğme
                              HİÇ ÇIKMAZ. Boş bir paneli açan düğme,
                              kullanıcıya bilgi gizlendiği izlenimi verir.
                            */}
                            {hasVisibleDetails(log) && (
                              <Button
                                className="ft-audit-action ft-audit-toggle"
                                variant="ghost"
                                aria-expanded={open}
                                aria-controls={`audit-detail-${log.id}`}
                                onClick={() => setExpanded(open ? null : log.id)}
                              >
                                Ayrıntı
                              </Button>
                            )}
                          </td>
                        </tr>

                        {open && (
                          <tr
                            className="ft-audit-detail-row"
                            data-testid={`audit-detail-${log.id}`}
                            id={`audit-detail-${log.id}`}
                          >
                            <td colSpan={6}>
                              <dl className="ft-details ft-audit-detail">
                                {changes.map((change) => (
                                  <Fragment key={`change-${change.label}`}>
                                    <dt>{change.label}</dt>
                                    <dd>
                                      {change.from !== null && change.to !== null
                                        ? `${change.from} → ${change.to}`
                                        : (change.to ?? change.from)}
                                    </dd>
                                  </Fragment>
                                ))}

                                {metadata.map((entry) => (
                                  <Fragment key={`meta-${entry.label}`}>
                                    <dt>{entry.label}</dt>
                                    <dd>{entry.value}</dd>
                                  </Fragment>
                                ))}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {result.meta.last_page > 1 && (
            <nav className="ft-audit-pager" aria-label="Sayfalama">
              <Button
                className="ft-audit-action"
                variant="secondary"
                onClick={() => setPage((current) => current - 1)}
                disabled={result.meta.current_page <= 1}
              >
                Önceki
              </Button>

              <span className="ft-audit-pager__status">
                Sayfa {result.meta.current_page} / {result.meta.last_page}
              </span>

              <Button
                className="ft-audit-action"
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

/**
 * Ad baş harfleri — ekip ve müşteri listelerindeki rozetle AYNI kural.
 * `toLocaleUpperCase('tr-TR')`: "istanbul" → "İS", "IS" değil.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('tr-TR');
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toLocaleUpperCase('tr-TR');
}
