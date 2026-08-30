import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ErrorState, Skeleton } from '@/components/ui';
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
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">Denetim</h1>
      </header>

      {loading && (
        <Card>
          <div data-testid="audit-loading" className="ft-stack">
            <Skeleton />
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </div>
        </Card>
      )}

      {!loading && error !== null && (
        <Card>
          <ErrorState message={auditErrorMessage(error)} />
          <Button variant="secondary" onClick={() => void load(page)}>
            Tekrar dene
          </Button>
        </Card>
      )}

      {!loading && !error && result && result.data.length === 0 && (
        <Card>
          <div className="ft-empty">
            <p>Henüz denetim kaydı yok.</p>
            <p className="ft-muted">
              Bu şirkette bir kayıt oluşturulduğunda, güncellendiğinde ya da bir üyelik
              değiştiğinde burada görünür.
            </p>
          </div>
        </Card>
      )}

      {!loading && !error && result && result.data.length > 0 && (
        <>
          <Card>
            {/* Dar viewportta yalnızca tablo yatayda kayar; kart sayfayı taşırmaz. */}
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
                        <tr data-testid={`audit-row-${log.id}`}>
                          {/* Tanınmayan kod uydurulmaz, ham hâliyle gösterilir. */}
                          <td>{auditActionLabel(log.action)}</td>

                          {/*
                            Aktör ÖZET olarak gelir: yalnızca id ve name.
                            E-posta backend'de bilinçli olarak dışarıda
                            bırakılmıştır; `actor` nesnesi dökülmez, sadece
                            adı okunur.

                            `actor` KOŞULLU bir alandır: user_id null olan
                            kayıtta anahtar hiç gelmez. "Sistem" gibi bir
                            metin yazmak doğrulanmamış bir varsayım olurdu.
                          */}
                          <td>{log.actor?.name ?? '—'}</td>

                          <td>
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
                          <td>{log.ip_address ?? '—'}</td>

                          <td>{formatDateTime(log.created_at) ?? '—'}</td>

                          <td>
                            {/*
                              Gösterilecek güvenli bir ayrıntı yoksa düğme
                              HİÇ ÇIKMAZ. Boş bir paneli açan düğme,
                              kullanıcıya bilgi gizlendiği izlenimi verir.
                            */}
                            {hasVisibleDetails(log) && (
                              <Button
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
                          <tr data-testid={`audit-detail-${log.id}`} id={`audit-detail-${log.id}`}>
                            <td colSpan={6}>
                              <dl className="ft-details">
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
