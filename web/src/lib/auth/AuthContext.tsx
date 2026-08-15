import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, endpoints } from '@/lib/api';
import { tokenStorage } from './tokenStorage';
import type { User } from '@/types/api';

/**
 * Oturum durumu.
 *
 * 'loading' başlangıç durumudur: uygulama açılırken elimizde bir token
 * varsa geçerliliği backend'e sorulur. Bu ara durum olmadan korumalı
 * rotalar bir an için "yetkisiz" görünür ve kullanıcı gereksiz yere
 * login ekranına atılır.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Kullanıcıyı backend'den tazeler (profil/şirket değişiminden sonra). */
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  /**
   * Token düştüğünde oturum da düşer.
   *
   * 401 alan HER istek ApiClient üzerinden token'ı temizler; burada
   * o değişikliği dinlemek, oturum sonlandırmayı TEK noktaya indirir.
   * Aksi halde her çağrı yerinde "401 mi geldi?" kontrolü yapmak
   * gerekirdi ve biri mutlaka unutulurdu (§12).
   */
  useEffect(() => {
    return tokenStorage.subscribe((token) => {
      if (token === null) {
        setUser(null);
        setStatus('unauthenticated');
      }
    });
  }, []);

  /** Açılışta: token varsa kim olduğumuzu backend'e soralım. */
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!tokenStorage.get()) {
        setStatus('unauthenticated');
        return;
      }

      try {
        const me = await endpoints.auth.me(api);
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        // 401 ise token zaten temizlendi; diğer hatalarda da oturum
        // açık sayılmaz — fail closed.
        if (cancelled) return;
        tokenStorage.clear();
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await endpoints.auth.login(api, email, password);

    // Token yalnızca burada saklanır; başka hiçbir yer storage'a yazmaz.
    tokenStorage.set(result.token);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await endpoints.auth.logout(api);
    } catch {
      // Sunucuya ulaşılamasa bile yerel oturum kapatılır: kullanıcı
      // "çıkış yaptım" dediyse istemcide token kalmamalı.
    } finally {
      tokenStorage.clear();
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await endpoints.auth.me(api);
    setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout, refreshUser }),
    [status, user, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth, AuthProvider içinde kullanılmalıdır.');
  }

  return context;
}
