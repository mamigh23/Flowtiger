import { ApiClient } from './client';
import { tokenStorage } from '@/lib/auth/tokenStorage';

export { ApiClient } from './client';
export { ApiError, NetworkError, toUserMessage } from './errors';
export * as endpoints from './endpoints';

/**
 * API kökü ortamdan gelir; kod içinde sabit adres yoktur.
 *
 * VITE_ önekli değişkenler pakete gömülür — bu yüzden buraya yalnızca
 * SIR OLMAYAN değerler konur. API adresi sır değildir.
 */
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';

/**
 * Uygulama genelindeki tek istemci.
 *
 * onUnauthenticated: 401 geldiğinde token'ı düşürür. AuthProvider bu
 * değişikliği tokenStorage aboneliği üzerinden görür ve kullanıcıyı
 * login ekranına alır — yani oturum temizliği tek yerde olur ve her
 * çağrı noktasında tekrarlanmaz.
 */
export const api = new ApiClient({
  baseUrl,
  getToken: () => tokenStorage.get(),
  onUnauthenticated: () => tokenStorage.clear(),
});
