import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { Badge } from '@/components/ui';
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
 */

/**
 * Gezinme — DÜZ yapı, gruplama yok.
 *
 * "Finans" ve "Ödemeler" iki ayrı üst madde olarak duruyor; gruplama
 * ayrı bir UI fazının işi.
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
  { to: '/app/payments', label: 'Ödemeler', icon: '⇄' },
  { to: '/app/team', label: 'Ekip', icon: '◎' },
  { to: '/app/invitations', label: 'Davetler', icon: '✉' },
  { to: '/app/audit', label: 'Denetim', icon: '❑' },
  { to: '/app/profile', label: 'Profil', icon: '⌂' },
] as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const { activeCompany } = useCompanies();
  const location = useLocation();

  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

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

          <div className="ft-topbar__company">
            {activeCompany && (
              <>
                <span className="ft-topbar__company-name">{activeCompany.name}</span>
                {activeCompany.role && <Badge tone="accent">{roleLabel(activeCompany.role)}</Badge>}
              </>
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
