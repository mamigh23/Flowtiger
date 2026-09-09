import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { formatToday } from './greeting';
import { DashboardWelcome } from './DashboardWelcome';
import { DashboardStats } from './DashboardStats';
import { TodayPlan } from './TodayPlan';
import type { FocusNextStop } from './TodayPlan';
import { RecentActivity } from './RecentActivity';
import type { DashboardCounts } from './useDashboardData';
import { useDashboardData } from './useDashboardData';

/**
 * Ana ekran — "bugün ne yapmam gerekiyor?" sorusunun cevabı.
 *
 * ÖZET ŞERİDİ VAR, GÖSTERGE PANELİ YOK. UI-01 sayımları kaldırmıştı;
 * ürün sahibi kararıyla geri geldiler — ama YALNIZCA sayımlar. Şerit
 * `meta.total` değerlerini taşır; para toplamı, yüzde ve dönem farkı
 * TAŞIMAZ çünkü bunları veren bir uç yok (bkz. useDashboardData).
 * Hızlı erişim listesi hâlâ yok: kenar çubuğu aynı işi yapıyor.
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
  const { todayTasks, recentActivity, counts } = useDashboardData(activeCompanyId);

  const now = new Date();

  return (
    <div className="ft-dashboard">
      <DashboardWelcome name={user?.name ?? null} hour={now.getHours()} />

      <DashboardStats counts={counts} />

      <div className="ft-dashboard__grid">
        {/*
          `formatToday(now)` yalnızca BAŞLIKTAKİ tarih metnidir. Hangi
          günün işlerinin geleceğini o belirlemiyor — onu backend, şirketin
          saat diliminde belirliyor (`GET /tasks/today`).
        */}
        <TodayPlan
          today={formatToday(now)}
          panel={todayTasks}
          nextStops={focusNextStops(counts)}
        />
        <RecentActivity panel={recentActivity} />
      </div>
    </div>
  );
}

/**
 * ÖNCELİK ZİNCİRİNİN ALT BASAMAKLARI: finans → ödemeler → ekip.
 *
 * Yalnızca YÜKLENMİŞ ve SIFIR OLMAYAN sayımlar durak olur:
 *   - yetkisi olmayan (403) bir alan zincire hiç girmez;
 *   - hiç kaydı olmayan bir alan "0 kayıt" diye gösterilmez — boş bir
 *     yere yönlendirmek, kullanıcıyı boşuna tıklatmak olurdu.
 *
 * Zincir BİR UYARI DEĞİL, BİR YÖN GÖSTERGESİDİR. "12 finans kaydı" der;
 * "3 tanesi kontrol bekliyor" DEMEZ — o soruya cevap veren bir uç yok ve
 * eksik bir sayıyı uyarıya çevirmek uydurmak olurdu.
 */
function focusNextStops(counts: DashboardCounts): FocusNextStop[] {
  const candidates: FocusNextStop[] = [
    {
      key: 'finance',
      glyph: '≡',
      label: 'Finans',
      count: countOf(counts.financeEntries),
      countLabel: 'kayıt',
      to: '/app/finance',
    },
    {
      key: 'payments',
      glyph: '⇄',
      label: 'Ödemeler',
      count: countOf(counts.payments),
      countLabel: 'kayıt',
      to: '/app/payments',
    },
    {
      key: 'team',
      glyph: '◎',
      label: 'Ekip',
      count: countOf(counts.members),
      countLabel: 'kişi',
      to: '/app/team',
    },
  ];

  return candidates.filter((stop) => stop.count > 0);
}

function countOf(panel: { status: string; data: number | null }): number {
  return panel.status === 'ready' && typeof panel.data === 'number' ? panel.data : 0;
}
