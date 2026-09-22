import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  /**
   * Oturum KULLANICI İSTEMEDEN düştü mü?
   *
   * `logout()` ile çıkışta false, 401 ile düşüşte true. Giriş ekranı bu
   * ikisini aynı şekilde göstermemeli: "çıkış yaptım" diyen kullanıcı
   * açıklama beklemez, ekranın ortasından giriş formuna atılan kullanıcı
   * bekler.
   */
  sessionExpired: boolean;
  login(email: string, password: string): Promise<void>;
  /**
   * Self-servis kayıt (P0-03) — backend tek istekte hesap + ilk şirket +
   * owner üyeliği oluşturur ve `login` ile AYNI şekli döner ({token, user}).
   * Bu yüzden uygulama tarafı da `login`in AYNI iki satırıdır: token
   * yalnızca tokenStorage'a yazılır, kullanıcı ve durum ondan gelen
   * yanıtla güncellenir. active_company_id backend'den gelen `user`
   * içindedir — istemci burada bir tenant/rol kararı ÜRETMEZ.
   */
  register(name: string, email: string, password: string, companyName: string): Promise<void>;
  logout(): Promise<void>;
  /** Kullanıcıyı backend'den tazeler (profil/şirket değişiminden sonra). */
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  /**
   * Çıkış KULLANICININ İSTEĞİYLE mi oluyor?
   *
   * `tokenStorage.clear()` senkron olarak abonelere haber verdiği için
   * bu bayrak, aboneliğin içinde hâlâ doğru değeri taşır. State
   * kullanılamazdı: değer aynı karede okunmalı, bir sonraki render'da
   * değil.
   */
  const deliberateLogout = useRef(false);

  /**
   * Token düştüğünde oturum da düşer.
   *
   * 401 alan HER istek ApiClient üzerinden token'ı temizler; burada
   * o değişikliği dinlemek, oturum sonlandırmayı TEK noktaya indirir.
   * Aksi halde her çağrı yerinde "401 mi geldi?" kontrolü yapmak
   * gerekirdi ve biri mutlaka unutulurdu (§12).
   *
   * AYNI OLAY İKİ FARKLI ŞEY ANLATIR: kullanıcı çıkış yaptıysa bu
   * beklenen bir son, 401 geldiyse oturumun kendiliğinden düşmesidir.
   * Ayrımı burada yapmak, giriş ekranının sebebini bilmesini sağlar —
   * aksi halde kullanıcı hiçbir açıklama görmeden forma atılıyordu
   * (gerçek tarayıcıda doğrulandı).
   */
  useEffect(() => {
    return tokenStorage.subscribe((token) => {
      if (token !== null) return;

      setUser(null);
      setStatus('unauthenticated');

      if (!deliberateLogout.current) {
        setSessionExpired(true);
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
    // Yeni oturum açıldı: eski oturumun düşme uyarısı artık geçmişte kaldı.
    setSessionExpired(false);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string, companyName: string) => {
      const result = await endpoints.auth.register(api, name, email, password, companyName);

      // login'deki AYNI tek nokta: token yalnızca burada saklanır.
      tokenStorage.set(result.token);
      setUser(result.user);
      setStatus('authenticated');
      setSessionExpired(false);
    },
    [],
  );

  const logout = useCallback(async () => {
    // Bayrak İSTEKTEN ÖNCE kalkar: logout ucunun kendisi 401 dönerse
    // (token sunucuda çoktan geçersizse) bu yine de kullanıcının istediği
    // bir çıkıştır ve "oturumunuz sona erdi" uyarısı gösterilmemelidir.
    deliberateLogout.current = true;

    try {
      await endpoints.auth.logout(api);
    } catch {
      // Sunucuya ulaşılamasa bile yerel oturum kapatılır: kullanıcı
      // "çıkış yaptım" dediyse istemcide token kalmamalı.
    } finally {
      tokenStorage.clear();
      deliberateLogout.current = false;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await endpoints.auth.me(api);
    setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, sessionExpired, login, register, logout, refreshUser }),
    [status, user, sessionExpired, login, register, logout, refreshUser],
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
