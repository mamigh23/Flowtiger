import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { Badge } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';

/**
 * Ürün kabuğu: kenar çubuğu + üst bar + içerik.
 *
 * Masaüstünde kenar çubuğu sabit açık; dar ekranda çekmece olarak
 * açılır (CSS ile; JavaScript yalnızca açık/kapalı durumunu tutar).
 */

const NAV_ITEMS = [
  { to: '/app', label: 'Panel', end: true },
  { to: '/app/customers', label: 'Müşteriler' },
  /*
    Finans bağlantısı HERKESE görünür.
    Uç owner-only ama bu karar backend'de verilir (playbook §3.1); rolüne
    bakıp bağlantıyı gizlemek, backend'in yetki kararını istemcide yeniden
    uygulamak olurdu. Member tıklar, istek gider, 403 açıklanır.
  */
  { to: '/app/finance', label: 'Finans' },
  { to: '/app/team', label: 'Ekip' },
  { to: '/app/invitations', label: 'Davetler' },
  { to: '/app/audit', label: 'Denetim' },
  { to: '/app/profile', label: 'Profil' },
] as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const { activeCompany } = useCompanies();
  const location = useLocation();

  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /** Gezinme sonrası çekmece kapanır. */
  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
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
    <div className={`ft-shell${navOpen ? ' ft-shell--nav-open' : ''}`}>
      <aside className="ft-shell__sidebar">
        <div className="ft-shell__brand">
          <span className="ft-auth__mark" aria-hidden="true">
            FT
          </span>
          <span>FlowTiger</span>
        </div>

        <nav className="ft-nav" aria-label="Ana gezinme">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : undefined}
              className={({ isActive }) => `ft-nav__link${isActive ? ' ft-nav__link--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Çekmece açıkken içeriği karartan katman. */}
      <div
        className="ft-shell__scrim"
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

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

        <main className="ft-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
