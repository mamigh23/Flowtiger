import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { MembersSection } from './MemberListPage';
import { InvitationsSection } from '@/features/invitations/InvitationListPage';

/**
 * EKİP — ÜYELER VE DAVETLERİN TEK EKRANI.
 *
 * Eskiden iki ayrı ekran ve kenar çubuğunda iki ayrı madde vardı: "Ekip"
 * ve "Davetler". İkisi de aynı soruyu yanıtlıyor — "şirkete kimler
 * erişiyor ya da erişecek" — ve davet, ekibe girişin kapısı. Artık tek
 * bir "Ekip" ekranı var; iki bölüm aynı başlığın, aynı özetin ve aynı
 * yüzeyin altında duruyor. Mimari Finans ekranıyla (FinanceHubPage)
 * AYNI.
 *
 * İKİ BÖLÜM AYNI ANDA DEĞİL, SIRAYLA GÖSTERİLİR: alt alta konsalardı
 * ekranda iki "Sayfalama" gezintisi, iki "Önceki/Sonraki" çifti ve iki
 * "Tekrar dene" düğmesi olurdu. Aynı adı taşıyan iki kontrol, ekran
 * okuyucuda hangisinin hangi listeye ait olduğunu belirsizleştirir.
 *
 * Bölüm seçimi URL'DEDİR: `/app/team` üyeleri, `/app/team/invitations`
 * davetleri açar. Eski `/app/invitations` rotası korunur ve buraya
 * yönlendirir (bkz. App.tsx) — mevcut bağlantılar kırılmaz.
 *
 * İKİ KAPSAM, İKİ YER:
 *
 *   ÜSTTEKİ ÖZET ŞİRKET GENELİDİR: iki kart da backend'in `meta.total`
 *   değerini taşır — sayfadaki satır sayısı DEĞİL, tüm kayıtlar.
 *
 *   BÖLÜM İÇİNDEKİ DAĞILIM SAYFA KAPSAMLIDIR: "Sahip/Üye rolü" ve
 *   "Bekleyen/Kabul edilen" yalnızca açık sayfayı sayar ve notları bunu
 *   açıkça söyler. Rol ya da durum dağılımını veren bir uç yok; ilk
 *   sayfayı sayıp şirket geneliymiş gibi göstermek eksik bir sayıyı
 *   gerçek gibi sunmak olurdu.
 *
 * AÇIK BÖLÜMÜN TOPLAMI İKİNCİ BİR İSTEK YAPILMADAN OKUNUR: zaten
 * yüklenen liste yanıtının `meta.total` değeri yukarı taşınır. Yalnızca
 * KAPALI bölümün sayısı için `per_page=1` ile tek bir istek atılır.
 *
 * İSTEMCİDE ROL KAPISI YOK: iki uç da owner-only ama bu karar backend'de
 * verilir (playbook §3.1). Kapalı bölümün sayımı 403 ya da başka bir
 * hata alırsa kart "—" gösterir; ekranda ayrıca bir uyarı çıkmaz — açık
 * bölümün kendi hatası zaten anlatılıyor.
 */
export type TeamSegment = 'members' | 'invitations';

interface TeamHubPageProps {
  segment: TeamSegment;
}

export function TeamHubPage({ segment }: TeamHubPageProps) {
  /** Açık bölümün toplamı — kendi liste yanıtından gelir. */
  const [activeTotal, setActiveTotal] = useState<number | null>(null);

  /** Kapalı bölümün toplamı — tek bir `per_page=1` isteğiyle. */
  const counterpartTotal = useCounterpartTotal(segment);

  const membersTotal = segment === 'members' ? activeTotal : counterpartTotal;
  const invitationsTotal = segment === 'invitations' ? activeTotal : counterpartTotal;

  return (
    <div className="ft-page ft-team-hub">
      {/* --------------------------------------------------- başlık */}
      <header className="ft-team-hero">
        <div className="ft-team-hero__text">
          <span className="ft-team-hero__eyebrow">Şirket</span>
          <h1 className="ft-team-hero__title">Ekip</h1>
          <p className="ft-team-hero__lead">
            Şirkete erişimi olan kişiler, rolleri ve gönderilen davetler.
          </p>
        </div>

        {/*
          "DAVET GÖNDER" İKİ BÖLÜMDE DE DURUR: ekibe yeni biri ancak davetle
          girer ve bu ekranın asıl eylemi o. İşaret `aria-hidden`:
          bağlantının erişilebilir adı "Davet gönder" olarak kalmalı.
        */}
        <Link className="ft-invitations-cta" to="/app/invitations/new">
          <span aria-hidden="true">+</span> Davet gönder
        </Link>
      </header>

      {/* ------------------------------------------------ şirket özeti */}
      <section className="ft-team-summary" aria-labelledby="ft-team-hub-summary-title">
        <h2 className="ft-visually-hidden" id="ft-team-hub-summary-title">
          Ekip özeti
        </h2>

        <SummaryStat
          testId="team-hub-summary-members"
          label="Ekip üyesi"
          total={membersTotal}
        />
        <SummaryStat
          testId="team-hub-summary-invitations"
          label="Davet"
          total={invitationsTotal}
        />
      </section>

      {/* -------------------------------------------------- bölümler */}
      {/*
        Gezinme adı "Sayfalama" DEĞİL: bu ekranda bir de liste
        sayfalaması var ve aynı adı taşıyan iki gezinme, ekran
        okuyucuda ayırt edilemezdi.
      */}
      <nav className="ft-team-hub__segments" aria-label="Ekip bölümleri">
        <NavLink
          end
          to="/app/team"
          className={({ isActive }) =>
            `ft-team-hub__segment${isActive ? ' ft-team-hub__segment--active' : ''}`
          }
        >
          Üyeler
        </NavLink>
        <NavLink
          to="/app/team/invitations"
          className={({ isActive }) =>
            `ft-team-hub__segment${isActive ? ' ft-team-hub__segment--active' : ''}`
          }
        >
          Davetler
        </NavLink>
      </nav>

      {/* ---------------------------------------------- açık bölüm */}
      {segment === 'members' ? (
        <MembersSection onTotal={setActiveTotal} />
      ) : (
        <InvitationsSection onTotal={setActiveTotal} />
      )}
    </div>
  );
}

/**
 * Şirket geneli sayım kartı.
 *
 * SAYI YOKSA "0" DEĞİL "—" YAZILIR: sıfır bir ölçümdür, bilinmeyen
 * değildir. Yetkisi olmayan ya da isteği başarısız olan bir kullanıcıya
 * "0 davet" göstermek, olmayan bir bilgiyi gerçek gibi sunmak olurdu.
 */
function SummaryStat({
  testId,
  label,
  total,
}: {
  testId: string;
  label: string;
  total: number | null;
}) {
  const known = typeof total === 'number';

  return (
    <article className="ft-team-stat" data-testid={testId}>
      <span className="ft-team-stat__label">{label}</span>
      <span className="ft-team-stat__value">{known ? total : '—'}</span>
      <span className="ft-team-stat__note">{known ? 'tüm kayıtlar' : 'şu an alınamadı'}</span>
    </article>
  );
}

/**
 * Kapalı bölümün kayıt sayısı.
 *
 * `per_page=1` İLE İSTENİR: ekranda tek bir sayı görünüyor; `meta.total`
 * sayfa boyutundan bağımsızdır ve her zaman TÜM kayıtları sayar.
 *
 * HATA YUTULUR AMA GİZLENMEZ: kart "—" gösterir. 403 de buraya düşer —
 * üye rolündeki kullanıcı için beklenen bir sonuçtur.
 */
function useCounterpartTotal(segment: TeamSegment): number | null {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    setTotal(null);

    const request =
      segment === 'members'
        ? endpoints.invitations.list(api, { per_page: 1 })
        : endpoints.members.list(api, { per_page: 1 });

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
