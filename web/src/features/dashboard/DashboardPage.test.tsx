import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Dashboard.
 *
 * KURAL: sahte veri YOK. Her sayı gerçek bir uçtan gelir:
 *   müşteri sayısı → GET /customers?per_page=1  → meta.total
 *   ekip sayısı    → GET /members?per_page=1    → meta.total
 *   son hareketler → GET /audit-logs?per_page=5 → data[]
 *
 * members ve audit-logs YALNIZCA owner'a açıktır; member rolündeki
 * kullanıcı 403 alır. Bu bir hata değil, beklenen bir durumdur ve
 * kart bazında ayrı ele alınmalıdır.
 */
describe('DashboardPage', () => {
  const ownerRoutes = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  it('aktif şirketi, kullanıcıyı ve rolü gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerRoutes,
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: /Hoş geldin, Ada Lovelace/ })).toBeInTheDocument();
    expect(screen.getAllByText('Kaplan Yazılım').length).toBeGreaterThan(0);
    expect(screen.getByText('Sahip')).toBeInTheDocument();
  });

  it('müşteri ve ekip sayısını meta.total üzerinden gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerRoutes,
        '/customers': () => jsonResponse(200, fixtures.paginated([], 128)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 6)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByTestId('stat-customers')).toHaveTextContent('128'));
    await waitFor(() => expect(screen.getByTestId('stat-members')).toHaveTextContent('6'));
  });

  it('sayım isteklerini per_page=1 ile yapar', async () => {
    const fetchMock = mockApi({
      ...ownerRoutes,
      '/customers': () => jsonResponse(200, fixtures.paginated([], 3)),
      '/members': () => jsonResponse(200, fixtures.paginated([], 3)),
      '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByTestId('stat-customers')).toHaveTextContent('3'));

    const urls = fetchMock.mock.calls.map(([url]) => String(url));

    expect(urls.some((url) => url.includes('/customers?per_page=1'))).toBe(true);
    expect(urls.some((url) => url.includes('/members?per_page=1'))).toBe(true);
    expect(urls.some((url) => url.includes('/audit-logs?per_page=5'))).toBe(true);
  });

  it('son hareketleri audit kayıtlarından listeler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerRoutes,
        '/customers': () => jsonResponse(200, fixtures.paginated([], 1)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 1)),
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [
                fixtures.auditLog({ id: 1, action: 'customer.created' }),
                fixtures.auditLog({ id: 2, action: 'member.role_changed' }),
              ],
              2,
            ),
          ),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByText('Müşteri oluşturuldu')).toBeInTheDocument();
    expect(screen.getByText('Üye rolü değiştirildi')).toBeInTheDocument();
  });

  /**
   * Member rolündeki kullanıcı için /members ve /audit-logs 403 döner.
   * Bu bir arıza değil; kart "yetkiniz yok" durumunu göstermeli ve
   * dashboard'un geri kalanı çalışmaya devam etmeli.
   */
  it('403 dönen kartları hata değil yetki durumu olarak gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user() }),
        '/companies': () =>
          jsonResponse(200, {
            data: [fixtures.company({ role: 'member' })],
            meta: { active_company_id: 7 },
          }),
        '/customers': () => jsonResponse(200, fixtures.paginated([], 42)),
        '/members': () => jsonResponse(403, { message: 'Bu işlem için yetkiniz yok.' }),
        '/audit-logs': () => jsonResponse(403, { message: 'Bu işlem için yetkiniz yok.' }),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    // Müşteri sayısı yine görünür.
    await waitFor(() => expect(screen.getByTestId('stat-customers')).toHaveTextContent('42'));

    // Yetki gerektiren kartlar kendi durumlarını gösterir.
    await waitFor(() => expect(screen.getByTestId('stat-members')).toHaveTextContent('Yetkiniz yok'));
    await waitFor(() => expect(screen.getByTestId('recent-activity')).toHaveTextContent('Yetkiniz yok'));

    // Hata uyarısı gösterilmemeli — bu beklenen bir durum.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('veri yokken boş durum gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerRoutes,
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 1)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByText('Henüz hareket yok.')).toBeInTheDocument();
  });

  it('sunucu hatasında kart bazında hata durumu gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerRoutes,
        '/customers': () => jsonResponse(500, { message: 'Server Error' }),
        '/members': () => jsonResponse(200, fixtures.paginated([], 2)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByTestId('stat-customers')).toHaveTextContent('Alınamadı'));
    // Diğer kart etkilenmemeli.
    await waitFor(() => expect(screen.getByTestId('stat-members')).toHaveTextContent('2'));
  });

  it('kenar çubuğunda ürün gezinmesini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerRoutes,
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    const nav = await screen.findByRole('navigation', { name: 'Ana gezinme' });

    for (const label of ['Panel', 'Müşteriler', 'Ekip', 'Davetler', 'Denetim', 'Profil']) {
      expect(nav).toHaveTextContent(label);
    }
  });
});
