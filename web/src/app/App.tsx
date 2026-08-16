import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { CompanyProvider } from '@/lib/company/CompanyContext';
import { ProtectedRoute, PublicOnlyRoute, RequireActiveCompany } from '@/routes/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { CompanySelectPage } from '@/features/companies/CompanySelectPage';
import { AppShell } from '@/features/shell/AppShell';
import { ComingSoon } from '@/features/shell/ComingSoon';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

/**
 * Rota haritası.
 *
 *   /login                → herkese açık (girişliyse /app'e gider)
 *   /app/company-select   → kimlik gerekir, aktif şirket GEREKMEZ
 *   /app/*                → kimlik + aktif şirket gerekir
 *
 * company-select'in kabuğun DIŞINDA olması bilinçlidir: kullanıcı henüz
 * bir tenant seçmemişken kenar çubuğundaki tenant uçlarını göstermek,
 * tıklandığında 403 duvarına çarpan bir arayüz demek olurdu.
 *
 * CompanyProvider, AuthProvider'ın İÇİNDE: şirket listesi ancak kimlik
 * doğrulandıktan sonra anlamlıdır ve oturum kapanınca temizlenmelidir.
 */
export function App() {
  return (
    <AuthProvider>
      <CompanyProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />

          <Route
            path="/app/company-select"
            element={
              <ProtectedRoute>
                <CompanySelectPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <RequireActiveCompany>
                  <AppShell />
                </RequireActiveCompany>
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />

            {/*
              Yer tutucular: bu bölümler sonraki aşamalarda gerçek
              ekranlarla değiştirilecek (playbook §9, AŞAMA 2-6).
            */}
            <Route
              path="customers"
              element={
                <ComingSoon
                  title="Müşteriler"
                  description="Müşteri listesi ve yönetimi hazırlanıyor."
                />
              }
            />
            <Route
              path="team"
              element={<ComingSoon title="Ekip" description="Ekip yönetimi hazırlanıyor." />}
            />
            <Route
              path="invitations"
              element={<ComingSoon title="Davetler" description="Davet yönetimi hazırlanıyor." />}
            />
            <Route
              path="audit"
              element={<ComingSoon title="Denetim" description="Denetim kayıtları hazırlanıyor." />}
            />
            <Route
              path="profile"
              element={<ComingSoon title="Profil" description="Profil ve güvenlik ayarları hazırlanıyor." />}
            />
          </Route>

          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </CompanyProvider>
    </AuthProvider>
  );
}
