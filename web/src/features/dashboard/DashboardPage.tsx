import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { formatToday } from './greeting';
import { DashboardWelcome } from './DashboardWelcome';
import { DashboardStats } from './DashboardStats';
import { DailyGuide } from './DailyGuide';
import { TodayPlan } from './TodayPlan';
import { RecentActivity } from './RecentActivity';
import { useDashboardData } from './useDashboardData';

/** Günlük yönlendirme önce; işletme sayımları ve geçmiş ikinci planda. */
export function DashboardPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompanies();
  const { todayTasks, recentActivity, counts } = useDashboardData(activeCompanyId);
  const now = new Date();

  return (
    <div className="ft-dashboard ft-dashboard--guided">
      <DashboardWelcome name={user?.name ?? null} hour={now.getHours()} />
      <DailyGuide tasks={todayTasks} total={counts.todayTasks} userId={user?.id ?? null} />
      <div className="ft-dashboard__grid">
        {/* Gün sınırını /tasks/today şirketin saat diliminde belirler. */}
        <TodayPlan today={formatToday(now)} panel={todayTasks} />
        <RecentActivity panel={recentActivity} />
      </div>
      <div className="ft-dashboard__overview">
        <p className="ft-dashboard__overview-label">Çalışma alanına genel bakış</p>
        <DashboardStats counts={counts} />
      </div>
    </div>
  );
}
