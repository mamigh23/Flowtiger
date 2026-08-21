import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Davet listesi.
 *
 * Backend sözleşmesi (InvitationController::index):
 *   GET /invitations?page=N → { data, links, meta }
 *   sıralama created_at DESC, id DESC — SABİT.
 *   sort/search/filter parametresi YOK.
 *
 * `email` MASKELİ gelir ("a***@example.com"); gerçek adres backend'den
 * hiç çıkmaz. Arayüz maskeyi çözmeye çalışmaz, olduğu gibi gösterir.
 *
 * `status` hesaplanan bir alandır ve dört değer alır:
 *   pending | accepted | revoked | expired
 * Backend durum filtresi sunmadığı için hepsi listelenir; arayüz de
 * filtre göstermez.
 *
 * 403 Team ile aynı: uçlar owner'a özeldir. Ama bu bilgi İSTEMCİDE
 * KARAR VERİLMEZ — istek yapılır, backend 403 dönerse açıklanır.
 */
describe('InvitationListPage', () => {
  const ownerSession = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  /** Aktif şirketteki rolü `member` olan oturum. */
  const memberSession = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, {
        data: [fixtures.company({ role: 'member' })],
        meta: { active_company_id: 7 },
      }),
  };

  const fourStatuses = [
    fixtures.invitation({ id: 41, email: 'a***@flowtiger.test', role: 'member', status: 'pending' }),
    fixtures.invitation({ id: 42, email: 'b***@flowtiger.test', role: 'owner', status: 'accepted' }),
    fixtures.invitation({ id: 43, email: 'c***@flowtiger.test', role: 'member', status: 'revoked' }),
    fixtures.invitation({ id: 44, email: 'd***@flowtiger.test', role: 'member', status: 'expired' }),
  ];

  it('davetleri maskeli e-posta ve rolle listeler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/invitations': () => jsonResponse(200, fixtures.paginated(fourStatuses, 4)),
      }),
    );

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });

    expect(within(table).getByText('a***@flowtiger.test')).toBeInTheDocument();
    expect(within(table).getByText('b***@flowtiger.test')).toBeInTheDocument();

    // Rol etiketleri Türkçe.
    expect(within(table).getAllByText('Üye').length).toBeGreaterThan(0);
    expect(within(table).getByText('Sahip')).toBeInTheDocument();
  });

  it('dört durumu da ayrı ayrı etiketler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/invitations': () => jsonResponse(200, fixtures.paginated(fourStatuses, 4)),
      }),
    );

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });

    expect(within(table).getByText('Bekliyor')).toBeInTheDocument();
    expect(within(table).getByText('Kabul edildi')).toBeInTheDocument();
    expect(within(table).getByText('İptal edildi')).toBeInTheDocument();
    expect(within(table).getByText('Süresi doldu')).toBeInTheDocument();
  });

  /**
   * Yanıt bilerek askıda tutulur: anında çözülen bir yanıtta React,
   * yükleme karesini hiç DOM'a yazmadan sonuca geçebilir.
   */
  it('yüklenirken bekleme durumu gösterir, veri gelince kaldırır', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) return jsonResponse(200, { data: fixtures.user() });
        if (url.includes('/companies')) {
          return jsonResponse(200, {
            data: [fixtures.company()],
            meta: { active_company_id: 7 },
          });
        }
        if (url.includes('/invitations')) {
          return new Promise<Response>((resolve) => {
            deferred.resolve = resolve;
          });
        }

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    renderApp('/app/invitations', { token: 'gecerli-token' });

    expect(await screen.findByTestId('invitations-loading')).toBeInTheDocument();

    deferred.resolve?.(jsonResponse(200, fixtures.paginated(fourStatuses, 4)));

    await screen.findByRole('table', { name: 'Davetler' });
    expect(screen.queryByTestId('invitations-loading')).not.toBeInTheDocument();
  });

  it('ilk sayfayı page=1 ile ister', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/invitations': () => jsonResponse(200, fixtures.paginated(fourStatuses, 4)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/invitations', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Davetler' });

    const listCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/invitations?'));

    expect(listCall).toContain('page=1');
  });

  it('hiç davet yokken boş durum ve davet çağrısı gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/invitations': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app/invitations', { token: 'gecerli-token' });

    expect(await screen.findByText('Henüz davet yok.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Davet gönder' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Davetler' })).not.toBeInTheDocument();
  });

  it('sunucu hatasında hata durumu ve tekrar deneme sunar', async () => {
    let attempt = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/invitations': () => {
          attempt += 1;
          return attempt === 1
            ? jsonResponse(500, { message: 'Server Error' })
            : jsonResponse(200, fixtures.paginated(fourStatuses, 4));
        },
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    expect(alert.textContent).not.toContain('Server Error');

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    const table = await screen.findByRole('table', { name: 'Davetler' });
    expect(within(table).getByText('a***@flowtiger.test')).toBeInTheDocument();
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        '/invitations': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });

  /**
   * İSTEMCİDE YETKİ KARARI YOK: rol `member` olsa bile istek yapılır.
   */
  it('rol member olsa bile isteği yapar, istemcide engellemez', async () => {
    const fetchMock = mockApi({
      ...memberSession,
      '/invitations': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/invitations', { token: 'gecerli-token' });

    await screen.findByRole('alert');

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/invitations'))).toBe(true);
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/invitations': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app/invitations', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  it('davet gönderme bağlantısı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/invitations': () => jsonResponse(200, fixtures.paginated(fourStatuses, 4)),
      }),
    );

    renderApp('/app/invitations', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Davet gönder' })).toHaveAttribute(
      'href',
      '/app/invitations/new',
    );
  });

  // ------------------------------------------------------------ sayfalama

  it('tek sayfa varsa sayfalama göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/invitations': () => jsonResponse(200, fixtures.paginated(fourStatuses, 4)),
      }),
    );

    renderApp('/app/invitations', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Davetler' });

    expect(screen.queryByRole('navigation', { name: 'Sayfalama' })).not.toBeInTheDocument();
  });

  it('birden çok sayfa varsa sayfa bilgisini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/invitations': () =>
          jsonResponse(
            200,
            fixtures.paginated(fourStatuses, 45, { currentPage: 1, lastPage: 3, perPage: 20 }),
          ),
      }),
    );

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(pager).toHaveTextContent('Sayfa 1 / 3');
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeEnabled();
  });

  it('sonraki sayfaya geçince page=2 ister ve o sayfanın içeriğini gösterir', async () => {
    const secondPage = [
      fixtures.invitation({ id: 61, email: 'z***@flowtiger.test', status: 'pending' }),
    ];

    const fetchMock = mockApi({
      ...ownerSession,
      '/invitations': (_init, url) => {
        const page = new URL(url ?? '', 'http://test.local').searchParams.get('page') ?? '1';

        return jsonResponse(
          200,
          fixtures.paginated(page === '2' ? secondPage : fourStatuses, 45, {
            currentPage: Number(page),
            lastPage: 3,
            perPage: 20,
          }),
        );
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });
    await user.click(within(pager).getByRole('button', { name: 'Sonraki' }));

    expect(await screen.findByText('z***@flowtiger.test')).toBeInTheDocument();
    expect(screen.queryByText('a***@flowtiger.test')).not.toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/invitations?') && url.includes('page=2'))).toBe(true);
  });

  it('son sayfada sonraki düğmesi kapalıdır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/invitations': () =>
          jsonResponse(
            200,
            fixtures.paginated(fourStatuses, 45, { currentPage: 3, lastPage: 3, perPage: 20 }),
          ),
      }),
    );

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeEnabled();
  });
});
