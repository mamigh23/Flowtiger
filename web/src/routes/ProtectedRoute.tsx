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

/**
 * Giriş yapmış kullanıcıyı /login'de tutmaz.
 *
 * HEDEF `/app` DEĞİL, KULLANICININ GİTMEK İSTEDİĞİ YER.
 *
 * REGRESYON — DERİN BAĞLANTI KAYBOLUYORDU. `/app/payments`e giden
 * misafir buraya `state.from` ile yönlendiriliyor, `LoginPage` de o
 * değeri okuyup giriş sonrası oraya gitmeye çalışıyordu. Ama giriş
 * başarılı olduğu anda iki güncelleme yarışıyor: LoginPage'in
 * `navigate(from)` çağrısı ile bu bileşenin yeniden render'ı. React
 * durum güncellemesini önce boşalttığında burası ÖNCE çalışıyor,
 * sabit `/app`e gidiyor ve LoginPage o sırada zaten sökülmüş oluyor —
 * `navigate` sessizce hiçbir şey yapmıyordu. Gerçek tarayıcıda
 * doğrulandı: `/app/payments` → giriş → `/app`.
 *
 * Çözüm yarışı kaldırmak değil, İKİ YOLUN DA AYNI YERE ÇIKMASI:
 * hangisi kazanırsa kazansın hedef aynı.
 */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'authenticated') {
    return <Navigate to={safeRedirect(location.state)} replace />;
  }

  return <>{children}</>;
}

/**
 * Yönlendirme hedefi yalnızca UYGULAMA İÇİ bir yol olabilir.
 *
 * Değer router state'inden gelir ve oraya yalnızca `ProtectedRoute`
 * yazar (`location.pathname`), yani bugün dışarıdan beslenemez. Kontrol
 * yine de burada: `//baska-site` ya da `https://...` biçiminde bir değer
 * bir gün buraya sızarsa açık yönlendirme (open redirect) olurdu ve bunu
 * fark etmek zordur. Tek satırlık kontrol, o sınıf hatayı baştan kapatır.
 */
export function safeRedirect(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;

  if (typeof from !== 'string') return '/app';
  if (!from.startsWith('/') || from.startsWith('//')) return '/app';

  return from;
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
