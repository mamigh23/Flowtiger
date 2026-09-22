import { describe, expect, it } from 'vitest';
import { safeRedirect } from './ProtectedRoute';

/**
 * Giriş sonrası yönlendirme hedefi.
 *
 * Fonksiyon SAF olduğu için router kurmadan sınanır. İki yerde
 * kullanılıyor (`PublicOnlyRoute` ve `LoginPage`) ve ikisi de aynı
 * cevabı vermek zorunda; kural tek yerde yazılı olduğu için burada tek
 * kez kilitlenmesi yeterli.
 *
 * KURAL: hedef YALNIZCA uygulama içi bir yol olabilir. Değer bugün
 * yalnızca `ProtectedRoute`tan (`location.pathname`) geliyor, yani
 * dışarıdan beslenemiyor. Kontrol yine de var: `//baska-site` ya da
 * `https://...` biçiminde bir değer bir gün buraya sızarsa açık
 * yönlendirme (open redirect) olurdu ve bunu gözle fark etmek zordur.
 */
describe('safeRedirect', () => {
  it('uygulama içi yolu olduğu gibi döner', () => {
    expect(safeRedirect({ from: '/app/payments' })).toBe('/app/payments');
    expect(safeRedirect({ from: '/app/finance/12/edit' })).toBe('/app/finance/12/edit');
  });

  it('hedef yoksa panele gider', () => {
    expect(safeRedirect(null)).toBe('/app');
    expect(safeRedirect({})).toBe('/app');
    expect(safeRedirect(undefined)).toBe('/app');
  });

  /**
   * `//host` tarayıcıda PROTOKOL-BAĞIMSIZ MUTLAK adrestir: `//x.example`
   * yazan bir yönlendirme kullanıcıyı başka siteye götürür. Tek eğik
   * çizgiyle başlıyor diye "yerel yol" saymak bu yüzden yetmez.
   */
  it('uygulama dışı hedefleri reddeder', () => {
    expect(safeRedirect({ from: '//kotu-site.example' })).toBe('/app');
    expect(safeRedirect({ from: 'https://kotu-site.example' })).toBe('/app');
    expect(safeRedirect({ from: 'javascript:alert(1)' })).toBe('/app');
    expect(safeRedirect({ from: 'app/payments' })).toBe('/app');
  });

  it('yol olmayan değerleri reddeder', () => {
    expect(safeRedirect({ from: 42 })).toBe('/app');
    expect(safeRedirect({ from: null })).toBe('/app');
    expect(safeRedirect({ from: { pathname: '/app/tasks' } })).toBe('/app');
  });
});
