import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { Card, Skeleton } from '@/components/ui';
import { auditActionLabel, relativeTime } from './auditLabels';
import { useDashboardData } from './useDashboardData';
import type { Panel } from './useDashboardData';

/**
 * Panel — ilk gerçek ürün ekranı.
 *
 * Gösterilen her sayı gerçek bir API çağrısından gelir; uydurma
 * istatistik yoktur. Yetki gerektiren kartlar 403 aldığında bunu bir
 * arıza gibi değil, bilgi olarak gösterir.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const { activeCompany, activeCompanyId } = useCompanies();
  const { customerCount, memberCount, recentActivity } = useDashboardData(activeCompanyId);

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <div>
          <h1 className="ft-page__title">Hoş geldin, {user?.name}</h1>
          {/*
            Rol rozeti burada TEKRARLANMAZ: üst bar zaten aktif şirketi
            ve rolü kalıcı olarak gösteriyor. Aynı bilgiyi iki yerde
            göstermek hem gürültü hem de erişilebilirlik açısından
            belirsizlik yaratır (aynı metni iki kez duyuran ekran okuyucu).
          */}
          <p className="ft-muted">{activeCompany?.name}</p>
        </div>
      </header>

      <section className="ft-stat-grid" aria-label="Özet">
        <StatCard
          testId="stat-customers"
          label="Müşteri"
          panel={customerCount}
          href="/app/customers"
        />
        <StatCard testId="stat-members" label="Ekip üyesi" panel={memberCount} href="/app/team" />
      </section>

      <section className="ft-panel-grid">
        <Card>
          <h2 className="ft-section__title">Son hareketler</h2>
          <div data-testid="recent-activity">
            <RecentActivity panel={recentActivity} />
          </div>
        </Card>

        <Card>
          <h2 className="ft-section__title">Hızlı erişim</h2>
          <ul className="ft-quick-links">
            <li>
              <Link to="/app/customers">Müşteriler</Link>
            </li>
            <li>
              <Link to="/app/team">Ekip</Link>
            </li>
            <li>
              <Link to="/app/invitations">Davetler</Link>
            </li>
            <li>
              <Link to="/app/profile">Profil</Link>
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  testId,
  label,
  panel,
  href,
}: {
  testId: string;
  label: string;
  panel: Panel<number>;
  href: string;
}) {
  return (
    <Card className="ft-stat">
      <div data-testid={testId}>
        <span className="ft-stat__label">{label}</span>
        <span className="ft-stat__value">
          {panel.status === 'loading' && <Skeleton width="3rem" />}
          {panel.status === 'ready' && panel.data}
          {panel.status === 'forbidden' && <span className="ft-stat__note">Yetkiniz yok</span>}
          {panel.status === 'error' && <span className="ft-stat__note">Alınamadı</span>}
        </span>
      </div>
      <Link className="ft-stat__link" to={href}>
        Görüntüle
      </Link>
    </Card>
  );
}

function RecentActivity({ panel }: { panel: Panel<{ id: number; action: string; created_at: string | null }[]> }) {
  if (panel.status === 'loading') {
    return (
      <div className="ft-stack">
        <Skeleton />
        <Skeleton width="80%" />
        <Skeleton width="60%" />
      </div>
    );
  }

  // Yetki eksikliği bir hata değil: member rolündeki kullanıcı denetim
  // kayıtlarını göremez ve bu beklenen davranıştır.
  if (panel.status === 'forbidden') {
    return <p className="ft-muted">Yetkiniz yok — denetim kayıtları yalnızca şirket sahibine açıktır.</p>;
  }

  if (panel.status === 'error') {
    return <p className="ft-muted">Alınamadı. Daha sonra tekrar deneyin.</p>;
  }

  if (!panel.data || panel.data.length === 0) {
    return <p className="ft-muted">Henüz hareket yok.</p>;
  }

  return (
    <ul className="ft-activity">
      {panel.data.map((entry) => (
        <li key={entry.id} className="ft-activity__item">
          <span>{auditActionLabel(entry.action)}</span>
          <span className="ft-muted">{relativeTime(entry.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}
