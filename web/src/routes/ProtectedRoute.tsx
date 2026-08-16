import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { LoadingScreen } from '@/components/ui';

/**
 * Rota korumaları.
 *
 * BUNLAR GÜVENLİK SINIRI DEĞİLDİR — kullanışlılık katmanıdır. Gerçek
 * yetki kararı her zaman backend'de verilir (playbook §3.1, §3.2). Bir
 * saldırgan bu bileşenleri atlarsa hiçbir şey kazanmaz: veri
 * backend'den token ve tenant bağlamı olmadan gelmez.
 */

/** Kimlik doğrulanmamış kullanıcıyı /login'e yönlendirir. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  // 'loading' sırasında yönlendirme YAPILMAZ: açılışta oturum henüz
  // doğrulanmamışken kullanıcıyı login'e atmak, geçerli oturumu olan
  // kişiyi de dışarı atmak olurdu.
  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/** Giriş yapmış kullanıcıyı /login'de tutmaz. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'authenticated') {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

/**
 * Tenant uçlarını kullanan ekranlar için: aktif şirket yoksa seçim
 * ekranına gönderir.
 *
 * Şirket listesi yüklenirken beklenir; aksi halde kullanıcı bir an için
 * seçim ekranına atılır ve otomatik seçim tamamlanınca geri döner —
 * ekran titrer.
 */
export function RequireActiveCompany({ children }: { children: ReactNode }) {
  const { status, activeCompanyId } = useCompanies();

  if (status === 'idle' || status === 'loading') {
    return <LoadingScreen />;
  }

  if (activeCompanyId === null) {
    return <Navigate to="/app/company-select" replace />;
  }

  return <>{children}</>;
}
