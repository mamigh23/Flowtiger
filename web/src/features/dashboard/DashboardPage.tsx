import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { formatToday } from './greeting';
import { DashboardWelcome } from './DashboardWelcome';
import { TodayPlan } from './TodayPlan';
import { RecentActivity } from './RecentActivity';
import { useDashboardData } from './useDashboardData';

/**
 * Ana ekran — "bugün ne yapmam gerekiyor?" sorusunun cevabı.
 *
 * BU BİR YÖNETİM PANELİ DEĞİL. Müşteri sayısı, ekip sayısı ve hızlı
 * erişim listesi bilinçli olarak yok: hepsi doğru bilgilerdi ama hiçbiri
 * bugüne dair bir şey söylemiyordu. Sayılar kendi ekranlarında duruyor.
 *
 * REFERANS TASARIMDAN ALINAN: yerleşim, yüzey dili, tipografi hiyerarşisi,
 * timeline ve boşluk kullanımı.
 * ALINMAYAN: veri. Referanstaki dört bloktan üçünün (plan kalemleri,
 * görev listesi, "dikkat gerekenler" uyarıları, gün özeti yüzdesi)
 * backend'de karşılığı YOK.
 *
 * "DİKKAT GEREKENLER" HİÇ RENDER EDİLMEZ. Mevcut API "kaç ödeme kontrol
 * bekliyor" sorusuna cevap vermiyor; sayfalanmış bir listenin ilk
 * sayfasını sayıp uyarı üretmek eksik bir sayıyı gerçekmiş gibi
 * göstermek olurdu. Boş bir "her şey yolunda" kutusu da yanlış olurdu:
 * bilmediğimiz bir şey hakkında güvence vermek.
 *
 * "GÜN ÖZETİ" DE YOK: tamamlanan iş sayısı ve ilerleme yüzdesi ancak bir
 * görev ucu varsa hesaplanabilir. İstemcide üretilen bir yüzde,
 * kullanıcının kendi gününe dair uydurma bir not olurdu.
 *
 * Bölümler ayrı dosyalarda çünkü her biri kendi kuralını taşıyor;
 * bir arada tek dosyada, o kuralların hangisinin nereye ait olduğu
 * kaybolurdu.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompanies();
  const { todayTasks, recentActivity } = useDashboardData(activeCompanyId);

  const now = new Date();

  return (
    <div className="ft-dashboard">
      <DashboardWelcome name={user?.name ?? null} hour={now.getHours()} />

      <div className="ft-dashboard__grid">
        {/*
          `formatToday(now)` yalnızca BAŞLIKTAKİ tarih metnidir. Hangi
          günün işlerinin geleceğini o belirlemiyor — onu backend, şirketin
          saat diliminde belirliyor (`GET /tasks/today`).
        */}
        <TodayPlan today={formatToday(now)} panel={todayTasks} />
        <RecentActivity panel={recentActivity} />
      </div>
    </div>
  );
}
