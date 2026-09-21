import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, ErrorState } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';
import type { Member, Paginated } from '@/types/api';
import { memberErrorMessage } from './memberErrors';

/**
 * Üyeler — birleşik Ekip ekranının ÜYE BÖLÜMÜ.
 *
 * Bu dosya eskiden `/app/team` rotasının kendisiydi ve kendi hero'sunu,
 * `h1`ini ve şirket geneli "Toplam üye" kartını taşıyordu. Artık bölüm;
 * başlık, şirket geneli özet ve bölüm seçimi `TeamHubPage`in elinde.
 * BURADA DEĞİŞEN TEK ŞEY ÇERÇEVE:
 *
 *   - veri akışı aynı: `GET /members?page=N`, aynı state, aynı
 *     hata/boş/yükleme durumları; `per_page` hâlâ gönderilmez;
 *   - tablo, satır kancaları, üye ayrıntı bağlantısı ve sayfalama aynı;
 *   - `h1` yerine `h2` — ekranda zaten bir `h1` ("Ekip") var.
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
 * Ekibe katılım davet bölümünden yürür.
 *
 * TABLO TABLO OLARAK KALIR. Satırlar kart gibi görünüyor ama işaretleme
 * hâlâ `<table>`: üç sütun (ad, e-posta, rol) başlıklarıyla birlikte
 * okunuyor ve ekran okuyucu "Rol: Sahip" diyebiliyor.
 *
 * ROL DAĞILIMI SAYFA KAPSAMLIDIR: "Sahip rolü" ve "Üye rolü" YALNIZCA
 * AÇIK SAYFADAKİ kayıtları sayar ve kartın notu bunu açıkça söyler.
 * Şirket geneli toplam (`meta.total`) üstteki özette durur. Rol
 * dağılımını veren bir uç yok; ilk sayfayı sayıp "şirkette 2 sahip var"
 * demek eksik bir sayıyı gerçek gibi göstermek olurdu.
 */
interface MembersSectionProps {
  /**
   * Yüklenen sayfanın `meta.total` değeri — üstteki şirket özeti için.
   * Sayı ikinci bir istekle DEĞİL, zaten gelen yanıttan okunur; böylece
   * karttaki sayı ile listedeki kayıtlar asla çelişemez.
   */
  onTotal?: (total: number | null) => void;
}

export function MembersSection({ onTotal }: MembersSectionProps) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<Member> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  /*
   * Geri çağrı REF'TE TUTULUR, bağımlılıkta değil. `load` bir
   * `useEffect` bağımlılığı; prop olarak satır içi bir fonksiyon
   * geçilseydi her render yeni bir kimlik üretir ve liste sonsuz döngüye
   * girerdi.
   */
  const onTotalRef = useRef(onTotal);
  onTotalRef.current = onTotal;

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      const page = await endpoints.members.list(api, { page: requestedPage });
      setResult(page);
      onTotalRef.current?.(page.meta.total);
    } catch (caught) {
      // 401 merkezî olarak ApiClient'ta ele alınır.
      setError(caught);
      setResult(null);
      onTotalRef.current?.(null);
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
    <section className="ft-team ft-team-hub__section" aria-labelledby="ft-team-members-title">
      <div className="ft-team-hub__section-head">
        <h2 className="ft-team-hub__section-title" id="ft-team-members-title">
          Üyeler
        </h2>
        <p className="ft-team-hub__section-lead">Şirkete erişimi olan kişiler ve rolleri.</p>
      </div>

      {/*
        ROL DAĞILIMI SAYFA KAPSAMLIDIR — şirket geneli toplam üstteki
        özette (`meta.total`). Buradaki iki kart yalnızca açık sayfayı
        sayar ve notları bunu söyler.
      */}
      {!loading && !error && result && rows.length > 0 && (
        <div className="ft-team-summary" data-testid="team-role-breakdown">
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
        </div>
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
    </section>
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
