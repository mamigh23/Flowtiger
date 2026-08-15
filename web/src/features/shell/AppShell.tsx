import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { Button, Card, ErrorState, Spinner } from '@/components/ui';

/**
 * Kimlik doğrulanmış alanın kabuğu.
 *
 * Bu fazda ekran YOK (§20) — burada yalnızca foundation'ın çalıştığını
 * gösteren asgari yüzey var: kim giriş yaptı, hangi şirketler var,
 * aktif şirket hangisi ve nasıl değiştiriliyor.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const { companies, activeCompanyId, loading, error, select } = useCompanies();

  return (
    <div>
      <header className="ft-shell__header">
        <strong>FlowTiger</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ft-space-4)' }}>
          <span className="ft-muted">{user?.email}</span>
          <Button variant="secondary" onClick={() => void logout()}>
            Çıkış
          </Button>
        </div>
      </header>

      <main className="ft-shell__main">
        <div className="ft-stack" style={{ maxWidth: '40rem' }}>
          <Card>
            <div className="ft-stack">
              <h2 style={{ fontSize: 'var(--ft-font-size-lg)' }}>Aktif şirket</h2>

              {loading && <Spinner />}
              {error && <ErrorState message={error} />}

              {!loading && !error && companies.length === 0 && (
                <p className="ft-muted">Henüz hiçbir şirkete üye değilsiniz.</p>
              )}

              {companies.map((company) => {
                const isActive = company.id === activeCompanyId;

                return (
                  <div
                    key={company.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--ft-space-4)',
                    }}
                  >
                    <span>
                      {company.name}
                      {company.role && <span className="ft-muted"> · {company.role}</span>}
                    </span>

                    {isActive ? (
                      <span className="ft-muted">aktif</span>
                    ) : (
                      /*
                       * Şirket değişimi YALNIZCA backend ucu üzerinden.
                       * İstemci hiçbir yerde active_company_id yazmaz.
                       */
                      <Button variant="secondary" onClick={() => void select(company.id)}>
                        Seç
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <p className="ft-muted">
            Foundation aşaması: müşteri, ekip, davet ve denetim ekranları henüz yok.
          </p>
        </div>
      </main>
    </div>
  );
}
