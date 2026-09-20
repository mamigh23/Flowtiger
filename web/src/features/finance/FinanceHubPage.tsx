import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { FinanceEntriesSection } from './FinanceEntryListPage';
import { PaymentsSection } from '@/features/payments/PaymentListPage';

/**
 * FİNANS — GELİR/GİDER KAYITLARI VE TAHSİLATLARIN TEK EKRANI.
 *
 * Eskiden iki ayrı ekran vardı: "Finans" (gelir/gider) ve "Ödemeler"
 * (tahsilat + dağıtım). İkisi de aynı soruyu yanıtlıyor — "para nereye
 * gitti, nereden geldi" — ama kullanıcıyı kenar çubuğunda iki ayrı
 * maddeye bölüyordu. Artık tek bir "Finans" ekranı var; iki bölüm aynı
 * başlığın, aynı özetin ve aynı yüzeyin altında duruyor.
 *
 * İKİ BÖLÜM AYNI ANDA DEĞİL, SIRAYLA GÖSTERİLİR — ve bu bilinçli:
 *
 *   1. İki sayfalanmış liste alt alta konsaydı ekranda İKİ "Sayfalama"
 *      gezintisi, iki "Önceki/Sonraki" çifti ve iki "Tekrar dene"
 *      düğmesi olurdu. Aynı adı taşıyan iki kontrol, ekran okuyucuda
 *      hangisinin hangi listeye ait olduğunu belirsizleştirir.
 *   2. Her bölüm kendi ucundan sayfalanır; ikisini aynı anda açmak,
 *      kullanıcı bir listeyi gezerken diğerinin sayfasını da ekranda
 *      tutmak demekti.
 *
 * Bölüm seçimi URL'DEDİR, bir state değil: `/app/finance` kayıtları,
 * `/app/finance/payments` ödemeleri açar. Böylece bölüm paylaşılabilir,
 * yer imlenebilir ve tarayıcı geri tuşu çalışır. Eski `/app/payments`
 * rotası korunur ve bu ekranın ödemeler bölümüne yönlendirir (bkz.
 * App.tsx) — mevcut bağlantılar kırılmaz.
 *
 * ÖZET SAYILARI `meta.total`DIR, PARA TOPLAMI DEĞİL.
 *
 * Backend'de summary/stats/totals ucu YOK (routes/api.php). Sayfalanmış
 * bir listenin ilk sayfasını toplayıp "bu ay ₺84.250 gelir" yazmak,
 * eksik bir tutarı gerçek gibi göstermek olurdu — ana ekranın aynı
 * kararı için bkz. useDashboardData. Bu yüzden kartlar KAYIT SAYISI
 * taşır ve etiketleri bunu açıkça söyler.
 *
 * AÇIK BÖLÜMÜN SAYISI İKİNCİ BİR İSTEK YAPILMADAN OKUNUR: zaten
 * yüklenen liste yanıtının `meta.total` değeri yukarı taşınır. Yalnızca
 * KAPALI bölümün sayısı için `per_page=1` ile tek bir istek atılır.
 *
 * İSTEMCİDE ROL KAPISI YOK: iki uç da owner-only ama bu karar
 * backend'de verilir (playbook §3.1). Kapalı bölümün sayımı 403 ya da
 * başka bir hata alırsa kart "—" gösterir; ekranda ayrıca bir uyarı
 * çıkmaz — açık bölümün kendi hatası zaten anlatılıyor.
 */
export type FinanceSegment = 'entries' | 'payments';

interface FinanceHubPageProps {
  segment: FinanceSegment;
}

export function FinanceHubPage({ segment }: FinanceHubPageProps) {
  /** Açık bölümün toplamı — kendi liste yanıtından gelir. */
  const [activeTotal, setActiveTotal] = useState<number | null>(null);

  /** Kapalı bölümün toplamı — tek bir `per_page=1` isteğiyle. */
  const counterpartTotal = useCounterpartTotal(segment);

  const entriesTotal = segment === 'entries' ? activeTotal : counterpartTotal;
  const paymentsTotal = segment === 'payments' ? activeTotal : counterpartTotal;

  return (
    <div className="ft-page ft-finance-hub">
      {/* --------------------------------------------------- başlık */}
      <header className="ft-finance-hub__hero">
        <div className="ft-finance-hub__hero-text">
          <span className="ft-finance-hub__eyebrow">Para akışı</span>
          <h1 className="ft-finance-hub__title">Finans</h1>
          <p className="ft-finance-hub__lead">
            Gelir–gider kayıtları ve tahsilatlar tek ekranda.
          </p>
        </div>

        {/*
          EYLEMLER AÇIK BÖLÜME AİTTİR. Dört düğmeyi (gelir, gider,
          ödeme ve ötesi) her zaman yan yana koymak, kullanıcının o an
          baktığı listeyle ilgisi olmayan iki kontrolü de öne çıkarırdı.
          İşaretler `aria-hidden`: bağlantıların erişilebilir adı
          "Yeni gelir" / "Yeni gider" / "Yeni ödeme" olarak kalmalı.
        */}
        <div className="ft-finance-hub__actions">
          {segment === 'entries' ? (
            <>
              <Link
                className="ft-finance-hub__cta ft-finance-hub__cta--primary"
                to="/app/finance/new/income"
              >
                <span aria-hidden="true">+</span> Yeni gelir
              </Link>
              <Link className="ft-finance-hub__cta" to="/app/finance/new/expense">
                <span aria-hidden="true">+</span> Yeni gider
              </Link>
            </>
          ) : (
            <Link
              className="ft-finance-hub__cta ft-finance-hub__cta--primary"
              to="/app/payments/new"
            >
              <span aria-hidden="true">+</span> Yeni ödeme
            </Link>
          )}
        </div>
      </header>

      {/* ----------------------------------------------------- özet */}
      <section className="ft-finance-hub__summary" aria-labelledby="ft-finance-summary-title">
        <h2 className="ft-visually-hidden" id="ft-finance-summary-title">
          Finans özeti
        </h2>

        <SummaryStat
          testId="finance-summary-entries"
          label="Finans kaydı"
          total={entriesTotal}
          note="gelir + gider"
        />
        <SummaryStat
          testId="finance-summary-payments"
          label="Ödeme"
          total={paymentsTotal}
          note="tahsilat kaydı"
        />
      </section>

      {/* -------------------------------------------------- bölümler */}
      {/*
        Gezinme adı "Sayfalama" DEĞİL: bu ekranda bir de liste
        sayfalaması var ve aynı adı taşıyan iki gezinme, ekran
        okuyucuda ayırt edilemezdi.
      */}
      <nav className="ft-finance-hub__segments" aria-label="Finans bölümleri">
        <NavLink
          end
          to="/app/finance"
          className={({ isActive }) =>
            `ft-finance-hub__segment${isActive ? ' ft-finance-hub__segment--active' : ''}`
          }
        >
          Finans kayıtları
        </NavLink>
        <NavLink
          to="/app/finance/payments"
          className={({ isActive }) =>
            `ft-finance-hub__segment${isActive ? ' ft-finance-hub__segment--active' : ''}`
          }
        >
          Ödemeler
        </NavLink>
      </nav>

      {/* ---------------------------------------------- açık bölüm */}
      {segment === 'entries' ? (
        <FinanceEntriesSection onTotal={setActiveTotal} />
      ) : (
        <PaymentsSection onTotal={setActiveTotal} />
      )}
    </div>
  );
}

/**
 * Sayım kartı.
 *
 * SAYI YOKSA "0" DEĞİL "—" YAZILIR: sıfır bir ölçümdür, bilinmeyen
 * değildir. Yetkisi olmayan ya da isteği başarısız olan bir kullanıcıya
 * "0 ödeme" göstermek, olmayan bir bilgiyi gerçek gibi sunmak olurdu.
 */
function SummaryStat({
  testId,
  label,
  total,
  note,
}: {
  testId: string;
  label: string;
  total: number | null;
  note: string;
}) {
  const known = typeof total === 'number';

  return (
    <article className="ft-finance-stat" data-testid={testId}>
      <span className="ft-finance-stat__label">{label}</span>
      <span className="ft-finance-stat__value">{known ? total : '—'}</span>
      <span className="ft-finance-stat__note">{known ? note : 'şu an alınamadı'}</span>
    </article>
  );
}

/**
 * Kapalı bölümün kayıt sayısı.
 *
 * `per_page=1` İLE İSTENİR: ekranda tek bir sayı görünüyor, on beş
 * kaydın gövdesini indirmek gereksiz. `meta.total` sayfa boyutundan
 * bağımsızdır ve her zaman TÜM kayıtları sayar (ana ekrandaki sayımlarla
 * aynı desen).
 *
 * HATA YUTULUR AMA GİZLENMEZ: kart "—" gösterir. Burada ikinci bir
 * uyarı satırı basmak, kullanıcının bakmadığı bir listenin sorununu
 * baktığı listenin hatasıyla yan yana koymak olurdu. 403 de buraya
 * düşer — üye rolündeki kullanıcı için beklenen bir sonuçtur.
 */
function useCounterpartTotal(segment: FinanceSegment): number | null {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    setTotal(null);

    const request =
      segment === 'entries'
        ? endpoints.payments.list(api, { per_page: 1 })
        : endpoints.financeEntries.list(api, { per_page: 1 });

    void request
      .then((page) => {
        if (cancelled) return;
        const value = page.meta?.total;
        setTotal(typeof value === 'number' && Number.isFinite(value) ? value : null);
      })
      .catch(() => {
        // 401 ApiClient'ta merkezî olarak ele alınır; 403 ve diğer her
        // hata burada yalnızca "sayı yok" demektir.
        if (!cancelled) setTotal(null);
      });

    return () => {
      cancelled = true;
    };
  }, [segment]);

  return total;
}
