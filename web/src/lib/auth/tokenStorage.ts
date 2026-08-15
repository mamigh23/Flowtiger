/**
 * Erişim token'ının saklandığı tek yer.
 *
 * VARSAYILAN: YALNIZCA BELLEK.
 *
 * Neden localStorage/sessionStorage değil:
 * Backend Sanctum Bearer token kullanıyor, SPA çerez kimlik doğrulaması
 * açık değil. Tarayıcıda saklanan her değer JavaScript'ten okunabilir;
 * bir XSS açığı, localStorage'daki token'ı KALICI olarak çalar —
 * kullanıcı tarayıcıyı kapatsa bile saldırgan token'a sahip olur.
 * Bellekteki token ise sekme kapanınca yok olur ve diske hiç yazılmaz.
 *
 * BEDELİ AÇIKÇA KABUL EDİLDİ: sayfa yenilendiğinde oturum kaybolur ve
 * kullanıcı tekrar giriş yapar. Foundation aşamasında doğru varsayılan
 * budur; kullanışlılık için güvenlik gevşetilmedi.
 *
 * DEĞİŞTİRMEK GEREKİRSE: bu dosya tek dokunma noktasıdır. Uygulama kodu
 * hiçbir yerde storage API'sini doğrudan çağırmaz, yalnızca bu
 * arayüzü kullanır. Backend httpOnly cookie desteği eklediğinde
 * (en doğru çözüm) buradaki uygulama boş bir adaptöre dönüşür.
 */
export interface TokenStorage {
  get(): string | null;
  set(token: string): void;
  clear(): void;
  /** Token değiştiğinde haber verir; abonelikten çıkma fonksiyonu döner. */
  subscribe(listener: (token: string | null) => void): () => void;
}

export function createInMemoryTokenStorage(): TokenStorage {
  let token: string | null = null;
  const listeners = new Set<(token: string | null) => void>();

  const notify = () => {
    for (const listener of listeners) listener(token);
  };

  return {
    get: () => token,

    set(next: string) {
      token = next;
      notify();
    },

    clear() {
      token = null;
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Uygulama genelinde kullanılan tek örnek. */
export const tokenStorage: TokenStorage = createInMemoryTokenStorage();
