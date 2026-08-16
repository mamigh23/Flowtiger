import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Yönlendirme kuralları (playbook §6 akışı):
 *
 *   kimliksiz                        → /login
 *   kimlikli, aktif şirket yok       → /app/company-select
 *   kimlikli, aktif şirket var       → /app
 *
 * Bu yönlendirmeler bir GÜVENLİK SINIRI DEĞİLDİR; yetki kararı her
 * istekte backend'de verilir. Buradaki amaç kullanıcıyı gereksiz bir
 * 403 duvarına çarptırmamaktır.
 */
describe('App yönlendirme', () => {
  const activeCompanyRoutes = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
    '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
    '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
    '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
  };

  it('token yokken korumalı alandan giriş ekranına yönlendirir', async () => {
    vi.stubGlobal('fetch', mockApi({}));

    renderApp('/app');

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  it('token yokken şirket seçim ekranına da izin vermez', async () => {
    vi.stubGlobal('fetch', mockApi({}));

    renderApp('/app/company-select');

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  it('kök yolu uygulamaya yönlendirir', async () => {
    vi.stubGlobal('fetch', mockApi(activeCompanyRoutes));

    renderApp('/', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: /Hoş geldin/ })).toBeInTheDocument();
  });

  it('aktif şirket varken panel açılır', async () => {
    vi.stubGlobal('fetch', mockApi(activeCompanyRoutes));

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: /Hoş geldin/ })).toBeInTheDocument();
  });

  it('aktif şirket yokken ve birden fazla şirket varken seçim ekranına gider', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () =>
          jsonResponse(200, {
            data: [fixtures.company({ id: 7 }), fixtures.company({ id: 9, name: 'İkinci' })],
            meta: { active_company_id: null },
          }),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Şirket seçin' })).toBeInTheDocument();
  });

  it('aktif şirket varken seçim ekranı panele geri yönlendirir', async () => {
    vi.stubGlobal('fetch', mockApi(activeCompanyRoutes));

    renderApp('/app/company-select', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: /Hoş geldin/ })).toBeInTheDocument();
  });

  it('hazır olmayan ürün bölümleri için yer tutucu gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(activeCompanyRoutes));

    renderApp('/app/customers', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Müşteriler' })).toBeInTheDocument();
    expect(screen.getByText(/yakında/i)).toBeInTheDocument();
  });

  /**
   * Merkezi 401 davranışı (foundation'dan devralındı): herhangi bir
   * istek 401 alırsa token silinir ve oturum kapanır. Bu davranış her
   * bileşende tekrar yazılmaz.
   */
  it('oturum geçersizse token silinir ve giriş ekranına dönülür', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ '/me': () => jsonResponse(401, { message: 'Unauthenticated.' }) }),
    );

    renderApp('/app', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  it('çıkış yapıldığında oturum temizlenir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...activeCompanyRoutes, '/auth/logout': () => new Response(null, { status: 204 }) }),
    );

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: /Hoş geldin/ });

    await user.click(screen.getByRole('button', { name: /Hesap menüsü/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Çıkış yap' }));

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });
});
