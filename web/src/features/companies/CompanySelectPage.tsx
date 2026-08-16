import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { Badge, Button, Card, ErrorState, LoadingScreen } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';

/**
 * Şirket seçimi.
 *
 * Seçim yalnızca POST /companies/{id}/select ile yapılır. İstemci
 * hiçbir yerde active_company_id yazmaz (playbook §3.1).
 *
 * Tek şirketi olan kullanıcı buraya hiç düşmez: CompanyProvider
 * otomatik seçer. Bu ekran 0 ve 2+ şirket durumlarını karşılar.
 */
export function CompanySelectPage() {
  const { logout } = useAuth();
  const { companies, activeCompanyId, status, error, selectingId, selectError, select, reload } =
    useCompanies();
  const navigate = useNavigate();

  if (activeCompanyId !== null) {
    return <Navigate to="/app" replace />;
  }

  if (status === 'idle' || status === 'loading') {
    return <LoadingScreen />;
  }

  async function handleSelect(companyId: number) {
    try {
      await select(companyId);
      navigate('/app', { replace: true });
    } catch {
      // Hata selectError üzerinden gösteriliyor.
    }
  }

  return (
    <div className="ft-auth">
      <Card className="ft-auth__card ft-auth__card--wide">
        <div className="ft-stack">
          <header>
            <h1 className="ft-auth__title">Şirket seçin</h1>
            <p className="ft-muted">Hangi şirkette çalışacağınızı seçin.</p>
          </header>

          {status === 'error' && error && <ErrorState message={error} />}
          {selectError && <ErrorState message={selectError} />}

          {status === 'ready' && companies.length === 0 && (
            <div className="ft-empty">
              <p>Henüz hiçbir şirkete üye değilsiniz.</p>
              <p className="ft-muted">
                Bir şirket sahibinin sizi davet etmesi gerekiyor. Davet e-postanızı kontrol edin.
              </p>
            </div>
          )}

          <ul className="ft-company-list">
            {companies.map((company) => (
              <li key={company.id}>
                <div className="ft-company">
                  <div className="ft-company__info">
                    <span className="ft-company__name">{company.name}</span>
                    {company.role && <Badge>{roleLabel(company.role)}</Badge>}
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => void handleSelect(company.id)}
                    loading={selectingId === company.id}
                    // Bir seçim sürerken diğer kartlar da kilitlenir:
                    // arka arkaya iki seçim, hangisinin kazandığı belirsiz
                    // bir yarış yaratırdı.
                    disabled={selectingId !== null}
                  >
                    Seç
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="ft-auth__footer">
            {status === 'error' && (
              <Button variant="ghost" onClick={() => void reload()}>
                Tekrar dene
              </Button>
            )}
            <Button variant="ghost" onClick={() => void logout()}>
              Çıkış yap
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
