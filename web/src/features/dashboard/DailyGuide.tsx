import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui';
import { ModuleIcon } from '@/components/ui/ModuleIcon';
import type { Task } from '@/types/api';
import type { CountPanel, Panel } from './useDashboardData';

/** Öneri mevcut plandan gelir; bilinmeyen aciliyet/vade bilgisi üretilmez. */
export function DailyGuide({ tasks, total, userId }: {
  tasks: Panel<Task[]>; total: CountPanel; userId: number | null;
}) {
  const rows = tasks.status === 'ready' ? tasks.data ?? [] : [];
  const knownTotal = total.status === 'ready' ? total.data : null;
  const complete = knownTotal !== null && knownTotal === rows.length;
  const open = rows.filter((task) => !task.is_completed);
  // Her alt kümede sunucunun saat sırası korunur; kişisel atama önceliği metinde açıklanır.
  const next = open.find((task) => userId !== null && task.assigned_to?.id === userId)
    ?? open.find((task) => task.assigned_to === null);
  const finished = rows.length - open.length;

  return (
    <section className="ft-day-guide" aria-labelledby="ft-day-guide-title" data-testid="daily-guide">
      <div className="ft-day-guide__eyebrow"><ModuleIcon name="tasks" /> Günün yol haritası</div>
      <h2 id="ft-day-guide-title">Sıradaki adım</h2>
      {tasks.status === 'loading' ? (
        <div className="ft-day-guide__loading" aria-label="Günlük yönlendirme yükleniyor"><Skeleton /><Skeleton width="70%" /></div>
      ) : tasks.status === 'error' ? (
        <>
          <p className="ft-day-guide__title">Günlük plan şu anda alınamadı.</p>
          <p>İşlerin tamamlandığını doğrulayamadık. Planı açıp yeniden kontrol edebilirsin.</p>
          <Link className="ft-button" to="/app/tasks/today">Günlük planı aç</Link>
        </>
      ) : tasks.status === 'forbidden' ? (
        <p>Günlük planı görme yetkin yok. Şirket yöneticinle görüşebilirsin.</p>
      ) : next ? (
        <>
          <p className="ft-day-guide__reason">{next.assigned_to ? 'Bugün sana atanan açık işlerden biri' : 'Bugünün planında henüz kimseye atanmamış bir iş'}</p>
          <h3 className="ft-day-guide__title">{next.title}</h3>
          <div className="ft-day-guide__context">
            {next.scheduled_time && <span>Planlanan saat: {next.scheduled_time}</span>}
            {next.customer && <span>{next.customer.name}</span>}
          </div>
          <div className="ft-day-guide__actions">
            <Link className="ft-button" to={`/app/tasks/${next.id}`}>Bu işe geç <span aria-hidden="true">→</span></Link>
            <Link className="ft-day-guide__secondary" to="/app/tasks/today">Bugünün planını gör</Link>
          </div>
        </>
      ) : complete && rows.length === 0 ? (
        <>
          <p className="ft-day-guide__title">Güne bir iş planlayarak başla.</p>
          <p>Bugüne planlanmış bir iş yok. Yapacağın işi, tarihini ve kime ait olduğunu belirle; planın burada görünsün.</p>
          <Link className="ft-button" to="/app/tasks/new">İlk işini planla</Link>
        </>
      ) : complete && open.length === 0 ? (
        <>
          <p className="ft-day-guide__title">Bugüne planlanan işler tamamlandı.</p>
          <p>İstersen sonraki işini planlayabilir veya tamamlananları gözden geçirebilirsin.</p>
          <div className="ft-day-guide__actions">
            <Link className="ft-button" to="/app/tasks/new">Yeni iş planla</Link>
            <Link className="ft-day-guide__secondary" to="/app/tasks/today">Günün planını incele</Link>
          </div>
        </>
      ) : (
        <>
          <p className="ft-day-guide__title">Günün planını gözden geçir.</p>
          <p>{complete ? 'Sana atanmış veya atanmamış açık bir iş yok. Ekibin günlük planına bakabilirsin.' : 'Görevlerin yalnızca bir bölümü burada. Diğer işlerini görmek için günlük planı aç.'}</p>
          <Link className="ft-button" to="/app/tasks/today">Günlük planı aç</Link>
        </>
      )}
      {tasks.status === 'ready' && knownTotal !== null && knownTotal > 0 && (
        <div className="ft-day-guide__progress">
          <p>{complete ? `Şirketin günlük planı: ${knownTotal} işin ${finished} tanesi tamamlandı.` : `Bugüne planlı ${knownTotal} iş var; bu bölümde ${rows.length} tanesi gösteriliyor.`}</p>
          {complete && <progress aria-label="Şirketin günlük planında tamamlanan işler" value={finished} max={knownTotal} />}
        </div>
      )}
    </section>
  );
}
