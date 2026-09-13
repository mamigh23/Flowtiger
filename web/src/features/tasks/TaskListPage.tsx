import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { ErrorState } from '@/components/ui';
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
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * Sınıflar `ft-tasks-*` önekiyle BU SAYFAYA ÖZELDİR ve Müşteriler
 * listesiyle aynı dili paylaşır: aynı hero, aynı özet kartı, aynı panel,
 * aynı hairline ve gölge. Paylaşılan `.ft-button` / `.ft-page__header`
 * kuralları ve Panel ekranının `.ft-task-*` (tekil) sınıfları
 * DEĞİŞTİRİLMEZ — onlar başka ekranlarda kullanılıyor.
 *
 * TABLO DEĞİL, LİSTE. Tablo satırları KARŞILAŞTIRMAK için iyidir; görev
 * listesinde karşılaştırılacak bir şey yok, okunacak bir sıra var. Yedi
 * kolonluk bir tablo aynı bilgiyi daha fazla gürültüyle anlatır ve dar
 * ekranda hücreler okunamayacak kadar sıkışırdı.
 *
 * VERİ VE İSTEK SÖZLEŞMESİ AYNI: aynı uç, aynı sayfalama, aynı alanlar,
 * aynı sıralama.
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

  /*
   * ÖZET KARTLARI YALNIZCA GERÇEKTEN HESAPLANABİLEN DEĞERLERİ GÖSTERİR.
   *
   * `meta.total` tüm kayıtları kapsar. Açık/tamamlanmış sayımı ise
   * yalnızca AÇIK SAYFADAN çıkarılabilir: uçta durum filtresi yok ve tüm
   * sayfaları çekmek, bir özet kartı için N istek atmak olurdu. Kapsam
   * kartın altında yazılıdır; tek sayfa varsa sayfa zaten tamamıdır.
   *
   * "Bugünün görevleri" ve "geciken görev" BİLEREK YOK: liste `?date=`
   * filtresi olmadan tüm günleri getiriyor, dolayısıyla bugüne ait
   * görevlerin hepsi açık sayfada olmayabilir — sayfadan sayılan bir
   * "bugün" rakamı kullanıcıyı yanıltırdı. "Geciken" ise ürünün
   * tanımlamadığı yeni bir kavram olurdu (V1 kapsamı değişmez).
   */
  const rows = result?.data ?? [];
  const completedCount = rows.filter((task) => task.is_completed).length;
  const openCount = rows.length - completedCount;
  const singlePage = result !== null && result.meta.last_page <= 1;
  const scopeNote = singlePage ? 'tüm görevler' : 'bu sayfada';

  return (
    <div className="ft-page ft-tasks">
      {/* ----------------------------------------------------- başlık */}
      <header className="ft-tasks-hero">
        <div className="ft-tasks-hero__text">
          <h1 className="ft-tasks-hero__title">Görevler</h1>
          <p className="ft-tasks-hero__lead">
            Ekibin işlerini tek bir yerden planlayın ve takip edin.
          </p>
        </div>

        {/* İşaret `aria-hidden`: bağlantının erişilebilir adı
            "Yeni görev" olarak kalmalı. */}
        <Link className="ft-tasks-cta" to="/app/tasks/new">
          <span aria-hidden="true">+</span> Yeni görev
        </Link>
      </header>

      {/* ------------------------------------------------------- özet */}
      {!loading && !error && result && rows.length > 0 && (
        <section className="ft-tasks-summary" aria-labelledby="ft-tasks-summary-title">
          <h2 className="ft-visually-hidden" id="ft-tasks-summary-title">
            Görev özeti
          </h2>

          <article className="ft-tasks-stat" data-testid="tasks-summary-total">
            <span className="ft-tasks-stat__label">Toplam görev</span>
            <span className="ft-tasks-stat__value">{result.meta.total}</span>
            <span className="ft-tasks-stat__note">tüm kayıtlar</span>
          </article>

          <article className="ft-tasks-stat ft-tasks-stat--open" data-testid="tasks-summary-open">
            <span className="ft-tasks-stat__label">Açık görev</span>
            <span className="ft-tasks-stat__value">{openCount}</span>
            <span className="ft-tasks-stat__note">
              {rows.length} kayıttan · {scopeNote}
            </span>
          </article>

          <article className="ft-tasks-stat ft-tasks-stat--done" data-testid="tasks-summary-completed">
            <span className="ft-tasks-stat__label">Tamamlanan</span>
            <span className="ft-tasks-stat__value">{completedCount}</span>
            <span className="ft-tasks-stat__note">
              {rows.length} kayıttan · {scopeNote}
            </span>
          </article>

          <article className="ft-tasks-stat" data-testid="tasks-summary-page">
            <span className="ft-tasks-stat__label">Sayfa</span>
            <span className="ft-tasks-stat__value">
              {result.meta.current_page}
              <span className="ft-tasks-stat__suffix">/{result.meta.last_page}</span>
            </span>
            <span className="ft-tasks-stat__note">sayfa başına {result.meta.per_page}</span>
          </article>
        </section>
      )}

      {/* ---------------------------------------------------- yükleme */}
      {loading && (
        <div className="ft-tasks-panel" data-testid="tasks-loading" aria-hidden="true">
          <div className="ft-tasks-panel__head">
            <span className="ft-skeleton ft-tasks-skeleton__head" />
          </div>
          {/*
            İskelet gerçek satırın ızgarasını taklit eder: solda saat,
            ortada başlık + bağlam, sağda durum. Veri gelince içerik
            yerinde belirir, liste zıplamaz.
          */}
          <ul className="ft-tasks-skeleton-rows">
            {[0, 1, 2].map((index) => (
              <li key={index} className="ft-tasks-skeleton-row">
                <span className="ft-skeleton ft-tasks-skeleton__time" />
                <span className="ft-tasks-skeleton-row__text">
                  <span className="ft-skeleton" style={{ width: index === 0 ? '46%' : '34%' }} />
                  <span className="ft-skeleton" style={{ width: '28%' }} />
                </span>
                <span className="ft-skeleton ft-tasks-skeleton__state" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ------------------------------------------------------- hata */}
      {!loading && error !== null && (
        <div className="ft-tasks-panel ft-tasks-panel--message">
          {/* Ham backend metni değil; taskErrors.ts'in kararı. */}
          <ErrorState message={taskErrorMessage(error)} />
          <button type="button" className="ft-tasks-action" onClick={() => void load(page)}>
            Tekrar dene
          </button>
        </div>
      )}

      {/* -------------------------------------------------- boş durum */}
      {!loading && !error && result && rows.length === 0 && (
        <div className="ft-tasks-empty">
          <span className="ft-tasks-empty__icon" aria-hidden="true">
            ✓
          </span>
          {/* Metin AYNEN korunur: boş durumun davranışı bu turda değişmedi. */}
          <h2 className="ft-tasks-empty__title">Henüz görev yok.</h2>
          <p className="ft-tasks-empty__text">
            İlk görevi ekleyerek günü planlamaya başlayın. Eklediğiniz görevler burada saati,
            tarihi ve durumuyla listelenir.
          </p>
          {/*
            Başlıktaki CTA ile AYNI ADI taşımaz: iki "Yeni görev"
            bağlantısı ekran okuyucuda ayırt edilemez olurdu.
          */}
          <Link className="ft-tasks-cta" to="/app/tasks/new">
            <span aria-hidden="true">+</span> İlk görevi ekle
          </Link>
        </div>
      )}

      {/* ------------------------------------------------------ liste */}
      {!loading && !error && result && rows.length > 0 && (
        <>
          <section className="ft-tasks-panel" aria-labelledby="ft-tasks-list-title">
            <div className="ft-tasks-panel__head">
              <h2 className="ft-tasks-panel__title" id="ft-tasks-list-title">
                Görev listesi
              </h2>
              {/*
                Toplam sayı GERÇEK backend verisidir (`meta.total`):
                sayfada 15 kayıt görünürken toplamın kaç olduğunu bilmek,
                kullanıcının sayfalamaya bakmadan nerede olduğunu anlamasını
                sağlar. Veri yoksa hiç yazılmaz — uydurulmaz.
              */}
              <span className="ft-tasks-panel__count" data-testid="tasks-total">
                {result.meta.total} görev
              </span>
            </div>

            <ul className="ft-tasks-list" aria-label="Görevler">
              {rows.map((task) => (
                <li
                  key={task.id}
                  className="ft-tasks-row"
                  data-testid={`task-row-${task.id}`}
                  // Durum YANITTAN okunur. Nitelik stil ve test kancası;
                  // kullanıcıya görünen işaret sağdaki rozettir.
                  data-completed={task.is_completed ? 'true' : 'false'}
                >
                  {/*
                    Saat SABİT SÜTUNDA durur ve saatsiz görevde boşluk
                    işaretiyle hizalanır. Boş bırakılsaydı satırlar
                    birbirine göre kayar ve göz saatleri dikey olarak takip
                    edemezdi. "—" bir saat değil, saatin yokluğunun işareti;
                    hiçbir koşulda saat uydurulmaz.
                  */}
                  <span className="ft-tasks-row__time" data-testid="task-row-time">
                    {task.scheduled_time ?? '—'}
                  </span>

                  <span className="ft-tasks-row__body">
                    {/*
                      BAŞLIĞIN KENDİSİ BAĞLANTIDIR ve satırdaki TEK
                      bağlantıdır. Ayrı bir "Ayrıntılar" düğmesi kullanıcıyı
                      zaten okuduğu başlıktan satırın sonuna göndermek
                      olurdu; Panel ekranındaki desen de bu.
                    */}
                    <Link className="ft-tasks-row__title" to={`/app/tasks/${task.id}`}>
                      {task.title}
                    </Link>

                    {/*
                      Tek satırlık bağlam: tarih · müşteri · atanan.
                      OLMAYAN BİLGİ YER KAPLAMAZ — tabloda her hücre dolmak
                      zorundaydı, listede değil.
                    */}
                    <span className="ft-tasks-row__meta">
                      {/* Takvim günü Date'e çevrilmeden biçimlenir. */}
                      <span className="ft-tasks-chip">
                        <span className="ft-tasks-chip__mark" aria-hidden="true">
                          ▣
                        </span>
                        <span>{formatFinancialDate(task.scheduled_date) ?? '—'}</span>
                      </span>

                      {task.customer !== null && (
                        <span className="ft-tasks-chip">
                          <span className="ft-tasks-chip__mark" aria-hidden="true">
                            ☺
                          </span>
                          <span data-testid="task-row-customer">{task.customer.name}</span>
                        </span>
                      )}

                      {task.assigned_to !== null && (
                        <span className="ft-tasks-chip">
                          <span className="ft-tasks-chip__mark" aria-hidden="true">
                            ◎
                          </span>
                          <span data-testid="task-row-assignee">{task.assigned_to.name}</span>
                        </span>
                      )}
                    </span>
                  </span>

                  {/*
                    DURUM HER SATIRDA YAZILI. Sönükleşen satır tek başına
                    anlam taşımamalı: rengi ayırt edemeyen ya da ekran
                    okuyucu kullanan biri de açığı tamamlanmıştan
                    ayırabilmeli. Metin taskLabels'tan gelir — liste ve
                    ayrıntı ekranı aynı kelimeyi kullanır.
                  */}
                  <span
                    className={`ft-tasks-state ft-tasks-state--${
                      task.is_completed ? 'done' : 'open'
                    }`}
                  >
                    {taskStatusLabel(task.is_completed)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {result.meta.last_page > 1 && (
            <nav className="ft-tasks-pager" aria-label="Sayfalama">
              <button
                type="button"
                className="ft-tasks-action"
                onClick={() => setPage((current) => current - 1)}
                disabled={result.meta.current_page <= 1}
              >
                Önceki
              </button>

              <span className="ft-tasks-pager__status">
                Sayfa {result.meta.current_page} / {result.meta.last_page}
              </span>

              <button
                type="button"
                className="ft-tasks-action"
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
