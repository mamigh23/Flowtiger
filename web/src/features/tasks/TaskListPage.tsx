import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Badge, Button, Card, ErrorState, Skeleton } from '@/components/ui';
import { formatFinancialDate } from '@/features/finance/financeLabels';
import type { Paginated, Task } from '@/types/api';
import { taskStatusLabel } from './taskLabels';
import { taskErrorMessage } from './taskErrors';

/**
 * Görev listesi.
 *
 * SIRALAMA BACKEND'İNDİR: `scheduled_time ASC NULLS LAST, id ASC`.
 * Arayüz yeniden sıralamaz — saatsiz işler backend'de günün SONUNA
 * konuyor; istemci sıralasaydı "bir ara yapılacak" bir iş 09:00
 * randevusunun önüne geçerdi.
 *
 * per_page GÖNDERİLMEZ: backend'in kendi varsayılanı (15) kullanılır.
 *
 * DURUM YANITTAN OKUNUR: `is_completed` backend'de `completed_at`ten
 * türetiliyor; ikinci bir hesap bir gün iki farklı cevap demek olurdu.
 *
 * SİLME BU EKRANDA YOK: geri alınamaz bir işlem, onay adımıyla birlikte
 * ayrıntı ekranına ait.
 */
export function TaskListPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<Task> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      setResult(await endpoints.tasks.list(api, { page: requestedPage }));
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
        <div>
          <h1 className="ft-page__title">Görevler</h1>
          {/*
            Toplam sayı GERÇEK backend verisidir (`meta.total`) ve listenin
            bağlamını açıklar: sayfada 15 kayıt görünürken toplamın kaç
            olduğunu bilmek, kullanıcının sayfalamaya bakmadan da nerede
            olduğunu anlamasını sağlar.

            KPI kartı DEĞİL: büyük sayı yok, grafik yok, kutu yok. Veri
            yoksa hiç yazılmaz — uydurulmaz.
          */}
          {result && (
            <p className="ft-muted" data-testid="tasks-total">
              {result.meta.total} görev
            </p>
          )}
        </div>

        <div className="ft-page__actions">
          <Link className="ft-button ft-button--primary" to="/app/tasks/new">
            Yeni görev
          </Link>
        </div>
      </header>

      {loading && (
        <Card>
          <div data-testid="tasks-loading" className="ft-stack">
            <Skeleton />
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </div>
        </Card>
      )}

      {!loading && error !== null && (
        <Card>
          <ErrorState message={taskErrorMessage(error)} />
          <Button variant="secondary" onClick={() => void load(page)}>
            Tekrar dene
          </Button>
        </Card>
      )}

      {!loading && !error && result && result.data.length === 0 && (
        <Card>
          <div className="ft-empty">
            <p>Henüz görev yok.</p>
            <p className="ft-muted">İlk görevi ekleyerek günü planlamaya başlayın.</p>
          </div>
        </Card>
      )}

      {!loading && !error && result && result.data.length > 0 && (
        <>
          <Card>
            {/*
              TABLO DEĞİL, LİSTE — ve sınıflar Dashboard'ın `ft-task-list`
              deseninden geliyor, yeniden yazılmadı.

              Tablo satırları KARŞILAŞTIRMAK için iyidir. Görev listesinde
              karşılaştırılacak bir şey yok; okunacak bir sıra var. Yedi
              kolonluk bir tablo aynı bilgiyi daha fazla gürültüyle
              anlatıyordu ve dar ekranda hücreler okunamayacak kadar
              sıkışıyordu.
            */}
            <ul className="ft-task-list" aria-label="Görevler">
              {result.data.map((task) => (
                <li
                  key={task.id}
                  className="ft-task"
                  data-testid={`task-row-${task.id}`}
                  // Durum YANITTAN okunur. Nitelik stil ve test kancası;
                  // kullanıcıya görünen işaret sönükleşen satır ve rozet.
                  data-completed={task.is_completed ? 'true' : 'false'}
                >
                  {/*
                    Saat SABİT SÜTUNDA durur ve saatsiz görevde boşluk
                    işaretiyle hizalanır. Boş bırakılsaydı satırlar
                    birbirine göre kayar ve göz saatleri dikey olarak takip
                    edemezdi. "—" bir saat değil, saatin yokluğunun işareti;
                    hiçbir koşulda saat uydurulmaz.
                  */}
                  <span className="ft-task__time" data-testid="task-row-time">
                    {task.scheduled_time ?? '—'}
                  </span>

                  <span className="ft-task__body">
                    <Link className="ft-task__title" to={`/app/tasks/${task.id}`}>
                      {task.title}
                    </Link>

                    {/*
                      Tek satırlık bağlam: tarih · müşteri · atanan · durum.
                      Olmayan bilgi YER KAPLAMAZ — tabloda her hücre dolmak
                      zorundaydı, listede değil.
                    */}
                    <span className="ft-task__meta ft-muted">
                      {/* Takvim günü Date'e çevrilmeden biçimlenir. */}
                      <span>{formatFinancialDate(task.scheduled_date) ?? '—'}</span>

                      {task.customer !== null && (
                        <>
                          {' · '}
                          <span data-testid="task-row-customer">{task.customer.name}</span>
                        </>
                      )}

                      {task.assigned_to !== null && (
                        <>
                          {' · '}
                          <span data-testid="task-row-assignee">{task.assigned_to.name}</span>
                        </>
                      )}

                      {/*
                        Durum sönükleşen satırın yanında AYRICA yazılır:
                        renk ve opaklık tek başına anlam taşımamalı.
                      */}
                      {task.is_completed && (
                        <>
                          {' · '}
                          <Badge>{taskStatusLabel(true)}</Badge>
                        </>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
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
