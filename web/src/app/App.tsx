import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { CompanyProvider } from '@/lib/company/CompanyContext';
import { ProtectedRoute, PublicOnlyRoute } from '@/routes/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from '@/features/shell/AppShell';

/**
 * Rota haritası.
 *
 *   /login → herkese açık (giriş yapmışsa /app'e gider)
 *   /app   → korumalı
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
            path="/app/*"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </CompanyProvider>
    </AuthProvider>
  );
}
