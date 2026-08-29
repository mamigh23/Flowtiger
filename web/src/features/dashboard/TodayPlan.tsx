import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui';
import type { Task } from '@/types/api';
import type { Panel } from './useDashboardData';

/**
 * Bugünün Planı — ana ekranın odak alanı.
 *
 * VERİ `GET /tasks/today`TEN GELİR. Arayüz kendi "bugün"ünü hesaplayıp
 * `?date=` göndermez: saat dilimi şirketinkinden farklı bir kullanıcı
 * yanlış günün işlerini görürdü. "Bu işletme için bugün hangi gün"
 * sorusunun cevabı backend'e aittir (playbook §3.1).
 *
 * ÜÇ ŞEY BURADA HESAPLANMAZ:
 *   saat        → `scheduled_time` null ise saat GÖSTERİLMEZ; uydurulan
 *                 bir saat listede gerçek bir randevu gibi görünürdü
 *   durum       → `is_completed` yanıttan okunur, `completed_at`ten
 *                 türetilmez; iki kaynak bir gün iki cevap demektir
 *   sıra        → backend `scheduled_time ASC NULLS LAST, id ASC`
 *                 sıralıyor; yeniden sıralamak saatsiz işleri randevuların
 *                 önüne geçirirdi
 *
 * BOŞ DURUM YERİNİ ŞİMDİDEN TUTAR: görevler geldiğinde ekranın dengesi
 * değişmesin. Ama bir hata gibi de görünmez — kırmızı yok, ünlem yok.
 */
export function TodayPlan({ today, panel }: { today: string; panel: Panel<Task[]> }) {
  return (
    <section className="ft-panel ft-panel--focus" aria-labelledby="ft-plan-title">
      <div className="ft-panel__head">
        <h2 id="ft-plan-title" className="ft-panel__title">
          Bugünün Planı
        </h2>
        <p className="ft-panel__meta">{today}</p>
      </div>

      <PlanBody panel={panel} />
    </section>
  );
}

function PlanBody({ panel }: { panel: Panel<Task[]> }) {
  if (panel.status === 'loading') {
    return (
      <div className="ft-stack" data-testid="plan-loading">
        <Skeleton />
        <Skeleton width="80%" />
        <Skeleton width="60%" />
      </div>
    );
  }

  // Yetki eksikliği bir arıza DEĞİL. Uyarı kutusu gösterilseydi kullanıcı
  // arızalı bir ekran gördüğünü sanırdı.
  if (panel.status === 'forbidden') {
    return (
      <p className="ft-dashboard__empty" data-testid="plan-forbidden">
        <span className="ft-dashboard__empty-dot" aria-hidden="true" />
        Bu bölümü görme yetkiniz yok.
      </p>
    );
  }

  if (panel.status === 'error') {
    return (
      <p className="ft-dashboard__empty" data-testid="plan-error">
        <span className="ft-dashboard__empty-dot" aria-hidden="true" />
        Alınamadı. Daha sonra tekrar deneyin.
      </p>
    );
  }

  if (!panel.data || panel.data.length === 0) {
    return (
      <div className="ft-plan-empty" data-testid="plan-empty">
        <span className="ft-plan-empty__glyph" aria-hidden="true" />
        <p className="ft-plan-empty__title">Bugün için planlanmış bir iş yok.</p>
        <p className="ft-plan-empty__hint">
          Planlama hazır olduğunda günün işleri burada sırasıyla görünecek.
        </p>
      </div>
    );
  }

  return (
    <ul className="ft-task-list">
      {panel.data.map((task) => (
        <li
          key={task.id}
          className="ft-task"
          data-testid={`task-${task.id}`}
          // Durum YANITTAN okunur. Nitelik yalnızca stil ve test kancası;
          // kullanıcıya görünen işaret satırın kendi görünümü.
          data-completed={task.is_completed ? 'true' : 'false'}
        >
          {/*
            Saat yalnızca VARSA yazılır. Yer tutucu bir tire ya da 00:00
            koymak, saatsiz bir işi zamanlanmış gibi gösterirdi.
          */}
          {task.scheduled_time !== null && (
            <span className="ft-task__time" data-testid="task-time">
              {task.scheduled_time}
            </span>
          )}

          <span className="ft-task__body">
            {/*
              Başlık, görevin ayrıntısına götüren SADE bir bağlantı.
              Dashboard yalnızca günlük planın OKUMA yüzeyi: burada
              tamamla/düzenle/sil kontrolü yok, o eylemler ayrıntı
              ekranına ait.
            */}
            <Link className="ft-task__title" to={`/app/tasks/${task.id}`} data-testid="task-title">
              {task.title}
            </Link>

            {task.customer !== null && (
              <span className="ft-task__meta ft-muted" data-testid="task-customer">
                {task.customer.name}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
