import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, ErrorState } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';
import type { Member, Paginated } from '@/types/api';
import { memberErrorMessage } from './memberErrors';

/**
 * Ekip listesi.
 *
 * İSTEMCİDE YETKİ KARARI YOK: kullanıcının rolüne bakıp isteği
 * engellemiyoruz. Ekip uçları owner'a özeldir ama bunu backend söyler —
 * istek yapılır, 403 gelirse açıklanır. Rolü istemcide kontrol etseydik
 * yetki kuralı iki ayrı yerde tanımlı olur ve zamanla ayrışırdı
 * (playbook §3.1).
 *
 * Arama/sıralama/filtre YOK: uçta böyle bir parametre yok.
 *
 * Yeni üye ekleme burada YOK: POST /members owner'ın başkasının
 * parolasını belirlemesini gerektiriyor ve davet akışıyla çakışıyor.
 * Bu faz kapsamı dışında bırakıldı.
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * Sınıflar `ft-team-*` önekiyle BU EKRANA özeldir ve görev/müşteri
 * listeleriyle aynı dili paylaşır: hero ışığı, yükseltilmiş kart yüzeyi,
 * hairline kenar, yumuşak gölge. Paylaşılan `.ft-table`, `.ft-button`,
 * `.ft-skeleton` kuralları DEĞİŞTİRİLMEZ; üzerlerine yalnızca bu ekranın
 * kapsamında yazılır.
 *
 * VERİ, İSTEK VE ROTA AKIŞI AYNI: aynı uç (`GET /members?page=N`), aynı
 * sayfalama, aynı hata/boş/yükleme durumları, aynı üye ayrıntı
 * bağlantısı. `per_page` hâlâ gönderilmez.
 *
 * TABLO TABLO OLARAK KALIR. Satırlar kart gibi görünüyor ama işaretleme
 * hâlâ `<table>`: üç sütun (ad, e-posta, rol) başlıklarıyla birlikte
 * okunuyor ve ekran okuyucu "Rol: Sahip" diyebiliyor. `div`lere
 * çevirseydik görünüm aynı kalır, anlam kaybolurdu.
 *
 * ÖZET ŞERİDİ İKİ FARKLI KAPSAMI AYIRIR:
 *   "Toplam üye" `meta.total`dır — TÜM kayıtlar, backend'in saydığı.
 *   "Sahip" ve "Üye" YALNIZCA AÇIK SAYFADAKİ kayıtları sayar ve kartın
 *   altındaki not bunu açıkça söyler. Sayfalanmış bir listenin ilk
 *   sayfasını sayıp "şirkette 2 sahip var" demek, eksik bir sayıyı
 *   gerçek gibi göstermek olurdu — rol dağılımını veren bir uç yok.
 *
 * DAVET AKIŞI DEĞİŞMEDİ: davetler kendi ekranında (`/app/invitations`)
 * yönetiliyor. Hero'daki bağlantı yeni bir akış değil, var olana giden
 * ikinci bir kapı — ekip ekranına gelen kullanıcının "yeni birini nasıl
 * eklerim" sorusunun cevabı kenar çubuğunda saklı kalmasın.
 */
export function MemberListPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<Member> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      setResult(await endpoints.members.list(api, { page: requestedPage }));
    } catch (caught) {
      // 401 merkezî olarak ApiClient'ta ele alınır.
      setError(caught);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const rows = result?.data ?? [];
  const ownerCount = rows.filter((member) => member.role === 'owner').length;
  const memberCount = rows.length - ownerCount;

  /*
   * Tek sayfalık bir listede "bu sayfada" demek gereksiz bir çekince
   * olurdu: sayfa zaten tüm kayıtları taşıyor.
   */
  const singlePage = result !== null && result.meta.last_page <= 1;
  const scopeNote = singlePage ? 'tüm üyeler' : 'bu sayfada';

  return (
    <div className="ft-page ft-team">
      {/* ----------------------------------------------------- başlık */}
      <header className="ft-team-hero">
        <div className="ft-team-hero__text">
          <span className="ft-team-hero__eyebrow">Şirket</span>
          <h1 className="ft-team-hero__title">Ekip</h1>
          <p className="ft-team-hero__lead">
            Şirkete erişimi olan kişiler ve rolleri.
          </p>
        </div>

        {/* İşaret `aria-hidden`: bağlantının erişilebilir adı
            "Davetleri yönet" olarak kalmalı. */}
        <Link className="ft-team-cta" to="/app/invitations">
          <span aria-hidden="true">✉</span> Davetleri yönet
        </Link>
      </header>

      {/* ------------------------------------------------------- özet */}
      {!loading && !error && result && rows.length > 0 && (
        <section className="ft-team-summary" aria-labelledby="ft-team-summary-title">
          <h2 className="ft-visually-hidden" id="ft-team-summary-title">
            Ekip özeti
          </h2>

          <article className="ft-team-stat" data-testid="team-summary-total">
            <span className="ft-team-stat__label">Toplam üye</span>
            <span className="ft-team-stat__value">{result.meta.total}</span>
            <span className="ft-team-stat__note">tüm kayıtlar</span>
          </article>

          <article className="ft-team-stat ft-team-stat--owner" data-testid="team-summary-owners">
            <span className="ft-team-stat__label">Sahip rolü</span>
            <span className="ft-team-stat__value">{ownerCount}</span>
            <span className="ft-team-stat__note">
              {rows.length} kayıttan · {scopeNote}
            </span>
          </article>

          <article className="ft-team-stat" data-testid="team-summary-members">
            <span className="ft-team-stat__label">Üye rolü</span>
            <span className="ft-team-stat__value">{memberCount}</span>
            <span className="ft-team-stat__note">
              {rows.length} kayıttan · {scopeNote}
            </span>
          </article>
        </section>
      )}

      {/* ---------------------------------------------------- yükleme */}
      {loading && (
        <div className="ft-team-panel" data-testid="members-loading" aria-hidden="true">
          <span className="ft-skeleton ft-team-skeleton__head" />
          <span className="ft-skeleton ft-team-skeleton__row" />
          <span className="ft-skeleton ft-team-skeleton__row" />
          <span className="ft-skeleton ft-team-skeleton__row" />
        </div>
      )}

      {/* ------------------------------------------------------- hata */}
      {!loading && error !== null && (
        <div className="ft-team-panel ft-team-panel--notice">
          <ErrorState message={memberErrorMessage(error)} />
          <Button className="ft-team-action" variant="secondary" onClick={() => void load(page)}>
            Tekrar dene
          </Button>
        </div>
      )}

      {/* -------------------------------------------------------- boş */}
      {!loading && !error && result && rows.length === 0 && (
        <div className="ft-team-panel ft-team-empty">
          <p className="ft-team-empty__title">Ekipte görüntülenecek üye yok.</p>
          <p className="ft-team-empty__note">
            Yeni kişileri davet ederek ekibi büyütebilirsiniz.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------ liste */}
      {!loading && !error && result && rows.length > 0 && (
        <>
          <div className="ft-team-panel ft-team-panel--table">
            {/*
              Dar viewportta yalnızca tablo yatayda kayar; panel sayfayı
              taşırmaz. Sarmalayıcı tablonun DOĞRUDAN ebeveyni olmalı.
            */}
            <div className="ft-table-scroll">
              <table className="ft-table" aria-label="Ekip üyeleri">
                <thead>
                  <tr>
                    <th scope="col">Ad</th>
                    <th scope="col">E-posta</th>
                    <th scope="col">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((member) => (
                    <tr key={member.id} data-role={member.role}>
                      <td>
                        {/*
                          Baş harfler yalnızca GÖRSEL bir işaret;
                          `aria-hidden` ile sunulur, çünkü bağlantının
                          erişilebilir adı üyenin adı olmalı.
                        */}
                        <Link className="ft-team-person" to={`/app/team/${member.id}`}>
                          <span className="ft-team-person__avatar" aria-hidden="true">
                            {initials(member.name)}
                          </span>
                          <span className="ft-team-person__name">{member.name}</span>
                        </Link>
                      </td>
                      <td className="ft-team-email">{member.email}</td>
                      <td>
                        {/* Yalnızca görüntüleme; bu değerle yetki kararı verilmez. */}
                        <span
                          className={`ft-team-role${
                            member.role === 'owner' ? ' ft-team-role--owner' : ''
                          }`}
                        >
                          {roleLabel(member.role)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.meta.last_page > 1 && (
            <nav className="ft-team-pager" aria-label="Sayfalama">
              <Button
                className="ft-team-action"
                variant="secondary"
                onClick={() => setPage((current) => current - 1)}
                disabled={result.meta.current_page <= 1}
              >
                Önceki
              </Button>

              <span className="ft-team-pager__status">
                Sayfa {result.meta.current_page} / {result.meta.last_page}
              </span>

              <Button
                className="ft-team-action"
                variant="secondary"
                onClick={() => setPage((current) => current + 1)}
                disabled={result.meta.current_page >= result.meta.last_page}
              >
                Sonraki
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Ad baş harfleri — müşteri listesindeki rozetle AYNI kural.
 *
 * Tek kelimelik adda ilk iki harf, birden fazlada ilk ve son kelimenin
 * baş harfleri. `toLocaleUpperCase('tr-TR')`: "istanbul" → "İS", "IS"
 * değil.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('tr-TR');
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toLocaleUpperCase('tr-TR');
}
