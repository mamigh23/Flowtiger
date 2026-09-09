import { Link } from 'react-router-dom';
import type { CountPanel, DashboardCounts } from './useDashboardData';

/**
 * Özet şeridi — hero'nun hemen altında, işletmenin büyüklüğü bir bakışta.
 *
 * HER DEĞER GERÇEK BİR `meta.total`DIR. Sayfadaki satırlar sayılmaz,
 * istemcide hiçbir toplam hesaplanmaz.
 *
 * PARA TOPLAMI YOK, YÜZDE YOK. Referans tasarımdaki "₺84.250" ve
 * "%20 bu ay" gibi değerlerin backend'de karşılığı YOK: ne bir toplam
 * ucu var ne de bir önceki dönemin verisi. Onları üretmek uydurmak
 * olurdu. Bu yüzden Finans ve Ödemeler kartları KAYIT SAYISI taşır ve
 * alt satırları bunu açıkça söyler ("finans kaydı", "ödeme kaydı") —
 * kullanıcı sayının neyi saydığını tahmin etmek zorunda kalmaz.
 *
 * YETKİSİ OLMAYAN KART HİÇ RENDER EDİLMEZ. /finance-entries, /payments
 * ve /members owner-only'dir; member 403 alır. "Yetkiniz yok" yazan üç
 * kutu göstermek, üyeye göremeyeceği şeylerin listesini çıkarmak olurdu.
 * Aynı şey hata durumu için de geçerli: yerini "—" ile doldurmak,
 * bilinmeyen bir sayıyı sıfırmış gibi gösterirdi.
 *
 * SİMGELER KENAR ÇUBUĞUNUNKİLERLE AYNI: kullanıcı ekip sayısının
 * yanındaki işareti menüde de görür. Yeni bir simge dili icat etmek,
 * aynı şeyi iki farklı işaretle anlatmak olurdu.
 *
 * TEK İSTİSNA FİNANS. Kenar çubuğunda simgesi "₺"; burada DEĞİL. Büyük
 * bir rakamın yanındaki para işareti, kayıt sayısını tutar gibi
 * okuturdu ("₺12"). Şeridin tamamı bu yanlış anlamayı önlemek üzerine
 * kurulu; simgenin kendisi onu geri getirmemeli.
 *
 * KART BİR BAĞLANTIDIR: sayı zaten kendi ekranında ayrıntılı duruyor;
 * şerit oraya giden en kısa yol. Erişilebilir ad "Müşteriler, 128"
 * biçiminde okunur — büyük rakam tek başına anlamsız kalmaz.
 */
interface StatDefinition {
  key: string;
  /** Dekoratif; anlam METİNDE taşınır (aria-hidden). */
  glyph: string;
  title: string;
  /** Sayının NEYİ saydığını söyler. Tutar sanılmasını engeller. */
  helper: string;
  to: string;
  panel: CountPanel;
}

export function DashboardStats({ counts }: { counts: DashboardCounts }) {
  const definitions: StatDefinition[] = [
    {
      key: 'customers',
      glyph: '☺',
      title: 'Müşteriler',
      helper: 'kayıtlı müşteri',
      to: '/app/customers',
      panel: counts.customers,
    },
    {
      key: 'tasks',
      glyph: '✓',
      title: 'Görevler',
      helper: 'bugün planlanan iş',
      to: '/app/tasks',
      panel: counts.todayTasks,
    },
    {
      key: 'finance',
      glyph: '≡',
      title: 'Finans',
      helper: 'finans kaydı',
      to: '/app/finance',
      panel: counts.financeEntries,
    },
    {
      key: 'payments',
      glyph: '⇄',
      title: 'Ödemeler',
      helper: 'ödeme kaydı',
      to: '/app/payments',
      panel: counts.payments,
    },
    {
      key: 'team',
      glyph: '◎',
      title: 'Ekip',
      helper: 'ekip üyesi',
      to: '/app/team',
      panel: counts.members,
    },
  ];

  // Yükleme bitmeden şerit gizlenmez: kartlar sonradan belirip hero'yu
  // aşağı itseydi, kullanıcı okumaya başladığı satırı kaybederdi.
  const visible = definitions.filter(
    (definition) => definition.panel.status === 'loading' || definition.panel.status === 'ready',
  );

  if (visible.length === 0) return null;

  return (
    <section className="ft-kpis" aria-label="Özet" data-testid="dashboard-stats">
      {visible.map((definition) => (
        <StatCard key={definition.key} definition={definition} />
      ))}
    </section>
  );
}

function StatCard({ definition }: { definition: StatDefinition }) {
  const { glyph, title, helper, to, panel } = definition;

  if (panel.status === 'loading') {
    return (
      <div className="ft-kpi ft-kpi--loading" data-testid={`stat-${definition.key}-loading`}>
        <span className="ft-kpi__icon" aria-hidden="true">
          {glyph}
        </span>
        <span className="ft-kpi__title">{title}</span>
        <span className="ft-kpi__value ft-kpi__value--placeholder" aria-hidden="true">
          &nbsp;
        </span>
        <span className="ft-kpi__helper">{helper}</span>
      </div>
    );
  }

  return (
    <Link
      className="ft-kpi"
      to={to}
      data-testid={`stat-${definition.key}`}
      // Büyük rakam tek başına okunduğunda anlamsız kalır; erişilebilir
      // ad başlığı ve sayıyı birlikte taşır.
      aria-label={`${title}, ${panel.data ?? 0}`}
    >
      <span className="ft-kpi__icon" aria-hidden="true">
        {glyph}
      </span>
      <span className="ft-kpi__title">{title}</span>
      <span className="ft-kpi__value">{panel.data ?? 0}</span>
      <span className="ft-kpi__helper">{helper}</span>
    </Link>
  );
}
