import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { LoadingScreen } from '@/components/ui';

/**
 * Kimlik doğrulanmamış kullanıcıyı /login'e yönlendirir.
 *
 * BU BİR GÜVENLİK SINIRI DEĞİLDİR — bir kullanışlılık katmanıdır.
 * Gerçek yetki kararı her zaman backend'de verilir; istemci yalnızca
 * kullanıcıyı gereksiz bir 401 duvarına çarptırmamak için yönlendirir.
 * Bir saldırgan bu bileşeni atlarsa hiçbir şey kazanmaz: veri
 * backend'den token'sız gelmez (§21).
 *
 * 'loading' durumunda yönlendirme YAPILMAZ: açılışta oturum henüz
 * doğrulanmamışken kullanıcıyı login'e atmak, geçerli oturumu olan
 * kişiyi de dışarı atmak olurdu.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'unauthenticated') {
    // Giriş sonrası kullanıcıyı geldiği yere döndürebilmek için
    // hedefi taşıyoruz.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/**
 * Giriş yapmış kullanıcıyı /login'de tutmaz.
 */
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
