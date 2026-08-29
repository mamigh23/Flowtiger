import { Skeleton } from '@/components/ui';
import { auditActionLabel, relativeTime } from '@/features/audit/auditLabels';
import type { Panel } from './useDashboardData';

/**
 * Son hareketler — ana ekrandaki TEK gerçek veri akışı.
 *
 * Kaynak: GET /audit-logs?per_page=5. Uydurma etkinlik üretilmez.
 *
 * TABLO DEĞİL, TIMELINE: her kayıt bir andır. Tablo satırları verileri
 * karşılaştırmak için iyidir; burada karşılaştırılacak bir şey yok,
 * anlatılacak bir sıra var. Dikey çizgi ve noktalar bu sırayı gösterir.
 *
 * Sıra bilgisini <ol> taşır; noktalar dekoratiftir (aria-hidden). Renk
 * ya da nokta TEK BAŞINA anlam taşımaz — eylem adı ve zamanı metin
 * olarak zaten orada.
 *
 * "GÜN ÖZETİ" DİYE ETİKETLENMEZ: audit kayıtları "tamamlanan iş"
 * değildir. Öyle adlandırmak veriyi olmadığı bir şeye dönüştürmek olurdu.
 */
export function RecentActivity({
  panel,
}: {
  panel: Panel<{ id: number; action: string; created_at: string | null }[]>;
}) {
  return (
    <section className="ft-panel" aria-labelledby="ft-recent-title">
      <div className="ft-panel__head">
        <h2 id="ft-recent-title" className="ft-panel__title">
          Son hareketler
        </h2>
      </div>

      <div data-testid="recent-activity">
        <ActivityBody panel={panel} />
      </div>
    </section>
  );
}

function ActivityBody({
  panel,
}: {
  panel: Panel<{ id: number; action: string; created_at: string | null }[]>;
}) {
  if (panel.status === 'loading') {
    return (
      <div className="ft-stack">
        <Skeleton />
        <Skeleton width="80%" />
        <Skeleton width="60%" />
      </div>
    );
  }

  // Yetki eksikliği bir hata DEĞİL: member rolündeki kullanıcı denetim
  // kayıtlarını göremez ve bu beklenen davranıştır. Uyarı kutusu
  // gösterilseydi kullanıcı arızalı bir ekran gördüğünü sanırdı.
  if (panel.status === 'forbidden') {
    return (
      <p className="ft-muted">
        Yetkiniz yok — denetim kayıtları yalnızca şirket sahibine açıktır.
      </p>
    );
  }

  if (panel.status === 'error') {
    return <p className="ft-muted">Alınamadı. Daha sonra tekrar deneyin.</p>;
  }

  if (!panel.data || panel.data.length === 0) {
    return <p className="ft-muted">Henüz hareket yok.</p>;
  }

  return (
    <ol className="ft-timeline">
      {panel.data.map((entry) => (
        <li key={entry.id} className="ft-timeline__item">
          <span className="ft-timeline__dot" aria-hidden="true" />
          <span className="ft-timeline__label">{auditActionLabel(entry.action)}</span>
          <span className="ft-timeline__time ft-muted">{relativeTime(entry.created_at)}</span>
        </li>
      ))}
    </ol>
  );
}
