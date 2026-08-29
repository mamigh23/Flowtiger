import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Şirket seçimi.
 *
 * En kritik kural: aktif şirket İSTEMCİDE seçilmez. İstemci yalnızca
 * select ucunu çağırır; hiçbir istekte active_company_id göndermez
 * (playbook §3.1 — backend authority).
 */
describe('CompanySelectPage', () => {
  const twoCompanies = [
    fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' }),
    fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' }),
  ];

  it('birden fazla şirket varsa seçim ekranını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () =>
          jsonResponse(200, { data: twoCompanies, meta: { active_company_id: null } }),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Şirket seçin' })).toBeInTheDocument();
    expect(screen.getByText('Kaplan Yazılım')).toBeInTheDocument();
    expect(screen.getByText('Bengal Danışmanlık')).toBeInTheDocument();
  });

  it('her şirket kartında rolü gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () =>
          jsonResponse(200, { data: twoCompanies, meta: { active_company_id: null } }),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByText('Kaplan Yazılım');

    expect(screen.getByText('Sahip')).toBeInTheDocument();
    expect(screen.getByText('Üye')).toBeInTheDocument();
  });

  it('seçim yalnızca select ucunu çağırır ve active_company_id göndermez', async () => {
    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
      '/companies/9/select': () => jsonResponse(200, { data: twoCompanies[1] }),
      '/companies': () =>
        jsonResponse(200, { data: twoCompanies, meta: { active_company_id: null } }),
      '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
      '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
      '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByText('Bengal Danışmanlık');

    const cards = screen.getAllByRole('button', { name: /Seç/ });
    await user.click(cards[1]!);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith('/companies/9/select')),
      ).toBe(true);
    });

    // Hiçbir istek gövdesinde active_company_id geçmemeli.
    for (const [, init] of fetchMock.mock.calls) {
      const body = (init as RequestInit | undefined)?.body;
      if (typeof body === 'string') {
        expect(body).not.toContain('active_company_id');
      }
    }
  });

  it('seçim başarılı olduğunda dashboard açılır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies/9/select': () => jsonResponse(200, { data: twoCompanies[1] }),
        '/companies': () =>
          jsonResponse(200, { data: twoCompanies, meta: { active_company_id: null } }),
        '/customers': () => jsonResponse(200, fixtures.paginated([], 12)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 3)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByText('Bengal Danışmanlık');
    await user.click(screen.getAllByRole('button', { name: /Seç/ })[1]!);

    expect(await screen.findByRole('heading', { name: 'Bugünün Planı' })).toBeInTheDocument();
  });

  /**
   * Üye olunmayan bir şirket seçilmeye çalışılırsa backend 403 döner.
   * İstemci bunu bir hata olarak göstermeli, sessizce geçmemeli.
   */
  it('403 durumunda seçimin başarısız olduğunu bildirir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies/9/select': () =>
          jsonResponse(403, { message: 'Bu şirkete erişim yetkiniz yok.' }),
        '/companies': () =>
          jsonResponse(200, { data: twoCompanies, meta: { active_company_id: null } }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByText('Bengal Danışmanlık');
    await user.click(screen.getAllByRole('button', { name: /Seç/ })[1]!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu şirkete erişim yetkiniz yok.');
    expect(screen.getByRole('heading', { name: 'Şirket seçin' })).toBeInTheDocument();
  });

  it('tek şirket varsa otomatik seçip dashboard açar', async () => {
    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
      '/companies/7/select': () => jsonResponse(200, { data: fixtures.company() }),
      '/companies': () =>
        jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: null } }),
      '/customers': () => jsonResponse(200, fixtures.paginated([], 4)),
      '/members': () => jsonResponse(200, fixtures.paginated([], 2)),
      '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
    });

    vi.stubGlobal('fetch', fetchMock);

    renderApp('/app', { token: 'gecerli-token' });

    // waitFor + getBy: her turda YENİDEN sorgular. findBy ile bulunan
    // düğüm, yönlendirme sırasında yeniden bağlandığı için eskiyebilir.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Bugünün Planı' })).toBeInTheDocument(),
    );

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/companies/7/select')),
    ).toBe(true);
  });

  it('hiç şirket yoksa boş durum gösterir ve seçim istemez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () => jsonResponse(200, { data: [], meta: { active_company_id: null } }),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByText(/Henüz hiçbir şirkete üye değilsiniz/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Seç/ })).not.toBeInTheDocument();
  });

  it('şirket listesi 401 dönerse oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });
});
