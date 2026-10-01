import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { Badge, Button, ErrorState, Spinner } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';
import { FlowTigerSplash } from '@/features/splash/FlowTigerSplash';
import { FlowTigerMark } from '@/features/brand/FlowTigerMark';

/**
 * Ürün kabuğu: dar kenar çubuğu + ince üst bar + içerik.
 *
 * KENAR ÇUBUĞU DARALDI ama ETİKETLER DOM'DA KALDI. İkon-only bir menü
 * görsel olarak sakin görünür, erişilebilirlik açısından ise bir
 * gerilemedir: ekran okuyucu kullanıcısı "🏠" duyar. Bu yüzden her
 * bağlantı ikonun yanında gerçek metnini taşır; metin geniş ekranda
 * GÖRSEL olarak kırpılır (CSS), a11y ağacından çıkmaz. Fare kullanıcısı
 * için `title` ipucu var.
 *
 * MARKA GEÇİŞİ OTURUM BAŞINA BİR KEZ. Kabuk oturum boyunca bir kez mount
 * olur ve alt rotalar arasında gezinirken yerinde kalır; bu yüzden perde
 * de bir kez oynar. Sayfa içi her gezinmede tekrar oynasaydı marka anı
 * olmaktan çıkıp bir engele dönüşürdü.
 *
 * PERDE İÇERİĞİ KALDIRMAZ, ÜSTÜNE ÖRTÜLÜR: uygulama arkada gerçekten
 * hazırlanır.
 *
 * ŞİRKET DEĞİŞTİRME — İKİ İŞ BİRDEN
 *
 *   1. `Outlet` AKTİF ŞİRKETLE ANAHTARLANIR. Şirket değişince alt
 *      ağaç sökülür ve sıfırdan kurulur. Bu, "önceki şirketin verileri
 *      yeni bağlamda kalmasın" kuralının en küçük yeterli çözümüdür:
 *      liste, detay ve form durumları ekranların KENDİ state'inde
 *      tutuluyor ve gecikmiş bir yanıt geldiğinde o state'i yazan kod
 *      artık DOM'da değildir.
 *
 *      YALNIZCA `key` YETMEZDİ: sunucuda hâlâ uçuşta olan isteklerin
 *      yanıtları gelir ve `.then()` blokları çalışır. Sökülen bir
 *      bileşenin state'ini güncellemesi React'te sessizce yutulur,
 *      dolayısıyla yeni ekranı dolduramaz — istenen tam olarak budur.
 *      Ama yanıt geldiğinde kurulacak YENİ ağaç doğru kiracının
 *      verisini istemek zorundadır; onu da isteklerin kendisi sağlar
 *      (tenant bağlamı backend'de her istekte yeniden çözülür).
 *
 *   2. Geçişten SONRA aktif şirket sunucudan yeniden doğrulanır
 *      (`reverify`). Ağ üzerinden gelen "seçim başarılı" bilgisi ile
 *      sunucudaki gerçek durum ayrışırsa ekran bunu gösterir; kullanıcı
 *      hangi kiracıda olduğunu bilmeden işlem yapmaz.
 *
 *   3. SEÇİM SÜRERKEN İÇERİK ASKIYA ALINIR (`selectionPending`).
 *      Kullanıcı seçim isteği beklemedeyken seçim ekranından geri
 *      tuşuyla dönerse, aktif şirket hâlâ eski değeri taşıdığı için
 *      koruma geçerdi. Bu bayrak doluyken alt ağaç hiç kurulmaz: o
 *      pencerede hangi kiracıda olduğumuz kesin değildir ve bir liste
 *      ya da form başlatmak yanlış şirkete yazma riskidir.
 */

/**
 * Gezinme — DÜZ yapı, gruplama yok.
 *
 * "Finans" ve "Ödemeler" iki ayrı üst madde olarak duruyor; gruplama
 * ayrı bir UI fazının işi.
 *
 * "EKİP" TEK MADDE: üyeler ve davetler artık tek bir Ekip ekranının iki
 * bölümü (bkz. TeamHubPage). Eski "Davetler" maddesi kaldırıldı; hedef
 * `/app/team`. Madde, davetler bölümündeyken de (`/app/team/invitations`)
 * etkin görünür — NavLink varsayılan olarak ön ek eşleştirir. Eski
 * `/app/invitations` adresi rotada yönlendirme olarak yaşıyor.
 *
 * HİÇBİR MADDE ROLE GÖRE GİZLENMEZ. Bazı uçlar owner-only ama bu karar
 * backend'e aittir (playbook §3.1). Rolüne bakıp bağlantıyı gizlemek,
 * yetki kararını istemcide yeniden uygulamak olurdu; üye tıklar, istek
 * gider, 403 açıklanır.
 *
 * İkonlar `aria-hidden`: erişilebilir adı metin taşır.
 */
const NAV_ITEMS = [
  { to: '/app', label: 'Panel', icon: '◈', end: true },
  /*
    Görevler panele en yakın madde: ana ekranın sorusu ("bugün ne yapmam
    gerekiyor?") buradan devam ediyor.
  */
  { to: '/app/tasks', label: 'Görevler', icon: '✓' },
  { to: '/app/customers', label: 'Müşteriler', icon: '☺' },
  { to: '/app/finance', label: 'Finans', icon: '₺' },
  { to: '/app/team', label: 'Ekip', icon: '◎' },
  { to: '/app/audit', label: 'Denetim', icon: '❑' },
  { to: '/app/profile', label: 'Profil', icon: '⌂' },
] as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const { activeCompany, activeCompanyId, companies, verifyError, selectionPending, reverify } =
    useCompanies();
  const location = useLocation();

  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  /*
   * GEÇİŞ NESLİ — alt ağacı YALNIZCA şirketler arası geçişte sıfırlar.
   *
   * `key`i doğrudan `activeCompanyId` yapmak cazipti ama YANLIŞTI:
   * `activeCompanyId` açılışta `null`dan ilk şirkete geçer ve bu da bir
   * anahtar değişimidir — alt ağaç hiçbir zaman başka bir şirketin
   * verisiyle render edilmemişken gereksiz yere sökülüp yeniden kurulur
   * ve panel verisi ikinci kez çekilirdi (kullanıcıya bir titreme ve
   * fazladan bir ağ turu olarak görünür).
   *
   * DOĞRU KURAL: sıfırlama, YALNIZCA iki FARKLI dolu şirket arasındaki
   * geçişte gerekir. İlk dolu değer yalnızca kaydedilir; nesli artırmaz.
   */
  const [companyGeneration, setCompanyGeneration] = useState(0);
  const knownCompanyId = useRef<number | null>(null);

  useEffect(() => {
    if (knownCompanyId.current === null) {
      knownCompanyId.current = activeCompanyId;
      return;
    }

    if (activeCompanyId === null) return;
    if (activeCompanyId === knownCompanyId.current) return;

    knownCompanyId.current = activeCompanyId;
    setCompanyGeneration((generation) => generation + 1);
  }, [activeCompanyId]);

  /*
   * DOĞRULAMA BURADA DEĞİL, `select()`İN BELİRSİZ HATA YOLUNDADIR.
   *
   * Her mount'ta (ve her seçimden sonra) `/companies`u yeniden okumak
   * cazip görünür ama yanlış bir yere bağlanır: sunucu yanıtı gecikirse
   * ya da (ör. bir önbellekten) BAYAT gelirse, taze ve onaylanmış bir
   * seçimi ezer. Doğrulama yalnızca yerel önbelleğin GERÇEKTEN
   * güvenilmez olduğu tek durumda gerekir — seçim isteği belirsiz bir
   * hatayla (ağ/5xx) döndüğünde (bkz. CompanyContext.select).
   */

  /** Şirket değiştirme kontrolü — klavyeyle de erişilebilir bir bağlantı. */
  const switchCompanyHref = '/app/company-select?switch=1';

  // Kimliği sabit: FlowTigerSplash'in efekti her render'da yeniden
  // kurulmasın, yoksa zamanlayıcı sürekli sıfırlanır ve perde hiç
  // kapanmaz.
  const finishSplash = useCallback(() => setSplashDone(true), []);

  /**
   * Gezinme sonrası çekmece kapanır VE ODAK ANA İÇERİĞE TAŞINIR.
   *
   * ODAK NEDEN TAŞINIR: tıklanan kenar çubuğu bağlantısı tıklamadan sonra
   * odaklı KALIR (tarayıcı varsayılanı). `.ft-shell__sidebar:focus-within`
   * kuralı bu yüzden gezinmeden SONRA da tetikli kalır ve çubuğu genişletir;
   * genişleme "içeriği itmez, üstüne biner" (bkz. yukarısı) — yani yeni
   * sayfanın başlığı, kullanıcı fareyi/odağı başka yere taşıyana kadar bu
   * genişlemiş çubuğun ALTINDA görünmez kalır. Odağı programatik olarak ana
   * içeriğe taşımak `:focus-within`i hemen sonlandırır (çubuk dar hâline
   * döner) ve ayrıca SPA'lar için standart pratiği karşılar: ekran okuyucu
   * kullanıcısına yeni sayfaya geçildiği bildirilir.
   *
   * İLK RENDER HARİÇ: kabuk ilk kurulduğunda henüz kenar çubuğunda bir
   * bağlantı odaklı değildir; odağı o an ana içeriğe zorlamak tarayıcının
   * kendi ilk odak/scroll davranışına gereksizce müdahale ederdi.
   */
  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  /** Menü dışına tıklama ve Esc ile kapanır — klavye kullanıcısı kilitlenmez. */
  useEffect(() => {
    if (!menuOpen) return;

    function handlePointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  return (
    <div
      className={[
        'ft-shell',
        navOpen ? 'ft-shell--nav-open' : '',
        // Perde açıkken içerik ve kenar çubuğu geride bekler; sınıf
        // kalkınca yumuşakça yerine oturur. VARSAYILAN HÂL GÖRÜNÜRDÜR —
        // perde bir sebeple hiç tamamlanmazsa ekran boş kalmaz.
        splashDone ? '' : 'ft-shell--intro',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!splashDone && <FlowTigerSplash onDone={finishSplash} />}

      <aside className="ft-shell__sidebar">
        <div className="ft-shell__brand">
          <FlowTigerMark size="sm" />
          <span className="ft-shell__brand-word">FlowTiger</span>
        </div>

        <nav className="ft-nav" aria-label="Ana gezinme">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : undefined}
              title={item.label}
              className={({ isActive }) => `ft-nav__link${isActive ? ' ft-nav__link--active' : ''}`}
            >
              <span className="ft-nav__icon" aria-hidden="true">
                {item.icon}
              </span>
              {/*
                Etiket DOM'da kalır. Dar kenar çubuğunda görsel olarak
                kırpılır ama erişilebilir addır — ikon tek başına anlam
                taşımamalı.
              */}
              <span className="ft-nav__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Çekmece açıkken içeriği karartan katman. */}
      <div className="ft-shell__scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <div className="ft-shell__body">
        <header className="ft-topbar">
          <button
            type="button"
            className="ft-topbar__toggle"
            onClick={() => setNavOpen((open) => !open)}
            aria-label="Gezinmeyi aç/kapat"
            aria-expanded={navOpen}
          >
            ☰
          </button>

          {/*
            ŞİRKET DEĞİŞTİRME — yalnızca DEĞİŞTİRİLECEK bir şirket varsa.

            Tek şirketli kullanıcıya "Şirket değiştir" göstermek, gidilecek
            başka yer olmadığı hâlde onu bir seçim ekranına göndermek
            olurdu. Bu yüzden kontrol 2+ şirkette görünür; 0/1 şirkette
            şirket adı yalnızca bilgi olarak durur.

            KONTROL bir BAĞLANTIDIR, düğme değil: bir yere götürüyor.
            Gerçek seçim mevcut seçim ekranında yapılır (aynı ekran, geçiş
            kipi) — kararı orada, hata mesajını gösterebilecek bir yerde
            vermek, üst barda sessizce şirket değiştirmekten daha
            güvenlidir.
          */}
          <div className="ft-topbar__company">
            {activeCompany && (
              <>
                <span className="ft-topbar__company-name">{activeCompany.name}</span>
                {activeCompany.role && <Badge tone="accent">{roleLabel(activeCompany.role)}</Badge>}
              </>
            )}

            {companies.length > 1 && (
              <Link className="ft-topbar__switch" to={switchCompanyHref}>
                Şirket değiştir
              </Link>
            )}
          </div>

          <div className="ft-menu" ref={menuRef}>
            <button
              type="button"
              className="ft-menu__trigger"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Hesap menüsü"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="ft-avatar" aria-hidden="true">
                {(user?.name ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="ft-menu__name">{user?.name}</span>
            </button>

            {menuOpen && (
              <div className="ft-menu__panel" role="menu">
                <span className="ft-menu__email">{user?.email}</span>
                {/*
                  GELEN DAVETLER — kişiye özel, aktif şirkete bağlı değil.

                  Menüde durur çünkü davet bir HESAP olayıdır, bir şirket
                  işlemi değil: kullanıcı henüz o şirketin üyesi bile
                  değildir. Hedefi de `/app` altındaki tenant ekranlarından
                  farklı bir dünyadadır (RequireActiveCompany istemez).
                */}
                <NavLink to="/app/invitations/incoming" className="ft-menu__item" role="menuitem">
                  Gelen davetler
                </NavLink>
                <NavLink to="/app/profile" className="ft-menu__item" role="menuitem">
                  Profil
                </NavLink>
                <button
                  type="button"
                  className="ft-menu__item"
                  role="menuitem"
                  onClick={() => void logout()}
                >
                  Çıkış yap
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="ft-shell__main" ref={mainRef} tabIndex={-1}>
          {/*
            DOĞRULANAMAYAN KİRACI BAĞLAMINDA İÇERİK ÇALIŞTIRILMAZ.

            `verifyError` doluyken sunucudaki aktif şirket okunamamıştır:
            istek sunucuya ulaşıp seçim kaydedilmiş de olabilir, hiç
            ulaşmamış da. Hangi kiracıda olduğumuzu bilmeden bir form
            açmak ya da bir listeyi yüklemek, yanlış şirkete kayıt girme
            riskidir. Bu yüzden tenant ekranları hiç kurulmaz: hata
            açıkça gösterilir ve yalnızca "Yeniden doğrula" ya da çıkış
            yolu bırakılır (fail closed).

            KABUK AYAKTA KALIR: kenar çubuğu ve hesap menüsü (çıkış)
            erişilebilir kalmalı, yoksa kullanıcı kilitlenirdi.

            SEÇİM SÜRERKEN DE İÇERİK ÇALIŞTIRILMAZ.

            Kullanıcı seçim isteği beklemedeyken seçim ekranından tarayıcı
            geri tuşuyla buraya dönebilir. O anda aktif şirket hâlâ ESKİ
            değeri taşıdığı için `RequireActiveCompany` geçer ve kabuk
            kurulur — ama seçim bitmediği için hangi kiracıda olduğumuz
            kesin değildir. Tenant ekranlarını (liste/detay/form) kurmak,
            tam da bu pencerede yanlış şirkete istek attırırdı.
            `selectionPending` boyunca içerik yerine bekleyen bir durum
            gösterilir; alt ağaç hiç mount edilmez.

            AĞAÇ YENİDEN KURULMAZ, ASKIYA ALINIR: koşul `key`in yerine
            geçmez. Seçim biter bitmez aynı `companyGeneration` ile alt
            ağaç kurulur; şirket GERÇEKTEN değiştiyse nesil zaten
            artmıştır ve ağaç sıfırdan gelir.
          */}
          {verifyError ? (
            <div className="ft-shell__verify" data-testid="company-verify-blocked">
              <ErrorState message="Aktif şirketiniz doğrulanamadı." />
              <p className="ft-muted">
                Son şirket değişikliğinin sunucuda kaydedilip kaydedilmediği doğrulanamadı.
                Yanlış şirkete kayıt girmemek için ekranlar durduruldu.
              </p>
              <Button variant="secondary" onClick={() => void reverify()}>
                Yeniden doğrula
              </Button>
            </div>
          ) : selectionPending ? (
            <div className="ft-shell__verify" data-testid="company-selection-pending">
              <Spinner />
              <p className="ft-muted">
                Şirket seçiminiz sunucu tarafından onaylanıyor. Onaylanana kadar hiçbir
                şirket ekranı yüklenmez.
              </p>
            </div>
          ) : (
            /*
              ŞİRKET GEÇİŞİNDE AĞAÇ SIFIRLANIR (`key`).

              Anahtar NESİL sayısıdır: yalnızca iki FARKLI dolu şirket
              arasındaki geçişte artar (bkz. yukarısı). İlk yükleme
              nesli büyütmez, dolayısıyla panel gereksiz yere yeniden
              kurulmaz.

              Geçişte alt ağaç sökülür: önceki şirketin liste/detay/form
              state'i yeni bağlamda yaşamaz ve yolda olan isteklerin
              yanıtları sökülmüş bileşenlere düşer — React onları yutar,
              yeni ekranı dolduramazlar.
            */
            <Outlet key={companyGeneration} />
          )}
        </main>
      </div>
    </div>
  );
}
