import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Ekip listesi.
 *
 * Backend sözleşmesi (MemberController::index):
 *   GET /members?page=N → { data, links, meta }
 *   sıralama SABİT; sort/search/filter parametresi YOK.
 *
 * KRİTİK FARK — Customer'ın tersi: bu uçlarda 403 GERÇEKTEN rol
 * kısıtıdır. CompanyMemberPolicy → Role::managesMembers() → owner.
 * Member rolündeki kullanıcı `viewAny` dahil her şeyde 403 alır.
 *
 * Ama bu bilgi İSTEMCİDE KARAR VERİLMEZ (playbook §3.1): arayüz rolüne
 * bakıp isteği engellemez, isteği yapar ve backend 403 dönerse açıklar.
 */
describe('MemberListPage', () => {
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

  const threeMembers = [
    fixtures.member({ id: 21, name: 'Ada Lovelace', email: 'ada@flowtiger.test', role: 'owner' }),
    fixtures.member({ id: 22, name: 'Mert Demir', email: 'mert@flowtiger.test', role: 'member' }),
    fixtures.member({ id: 23, name: 'Elif Şahin', email: 'elif@flowtiger.test', role: 'member' }),
  ];

  it('üyeleri ad, e-posta ve rolle listeler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/members': () => jsonResponse(200, fixtures.paginated(threeMembers, 3)),
      }),
    );

    renderApp('/app/team', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Ekip üyeleri' });

    expect(within(table).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(table).getByText('mert@flowtiger.test')).toBeInTheDocument();
    expect(within(table).getByText('Elif Şahin')).toBeInTheDocument();
  });

  it('rolleri Türkçe etiketle gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/members': () => jsonResponse(200, fixtures.paginated(threeMembers, 3)),
      }),
    );

    renderApp('/app/team', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Ekip üyeleri' });

    expect(within(table).getAllByText('Sahip')).toHaveLength(1);
    expect(within(table).getAllByText('Üye')).toHaveLength(2);
  });

  /**
   * Yanıt bilerek askıda tutulur: anında çözülen bir yanıtta React,
   * yükleme karesini hiç DOM'a yazmadan sonuca geçebilir.
   */
  it('yüklenirken bekleme durumu gösterir, veri gelince kaldırır', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};

    /**
     * ASKIDAKİ YANIT İSTEK GELMEDEN ÖNCE KURULUR.
     *
     * Promise mock'un içinde kurulsaydı `deferred.resolve` ancak istek
     * GERÇEKTEN ATILDIĞINDA atanırdı — yani testin çözücüye sahip olması,
     * React'in passive effect'i ne zaman boşalttığına bağlı kalırdı.
     * Bekleme karesi DOM'a mount anında yazılır, isteği atan useEffect ise
     * commit'ten SONRA çalışır; bu iki an arasında `findByTestId` çözülüp
     * `deferred.resolve?.(...)` sessizce hiçbir şey yapmadan geçebiliyordu
     * (`?.` çözücünün yokluğunu yutuyor). O durumda istek sonsuza kadar
     * askıda kalır, bekleme karesi hiç kalkmaz ve tablo hiç doğmaz.
     *
     * Promise'i burada kurmak testi SIRADAN BAĞIMSIZ yapar: çözücü render
     * başlamadan vardır ve yanıt istekten önce çözülse bile bileşen zaten
     * çözülmüş bir promise alır. İddia gevşemedi — aksine, artık her iki
     * sırada da geçerli.
     */
    const pendingMembers = new Promise<Response>((resolve) => {
      deferred.resolve = resolve;
    });

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
        if (url.includes('/members')) return pendingMembers;

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    renderApp('/app/team', { token: 'gecerli-token' });

    expect(await screen.findByTestId('members-loading')).toBeInTheDocument();

    deferred.resolve?.(jsonResponse(200, fixtures.paginated(threeMembers, 3)));

    await screen.findByRole('table', { name: 'Ekip üyeleri' });
    expect(screen.queryByTestId('members-loading')).not.toBeInTheDocument();
  });

  it('ilk sayfayı page=1 ile ister', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/members': () => jsonResponse(200, fixtures.paginated(threeMembers, 3)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/team', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Ekip üyeleri' });

    const listCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/members?'));

    expect(listCall).toContain('page=1');
  });

  it('liste boş dönerse boş durum gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app/team', { token: 'gecerli-token' });

    expect(await screen.findByText('Ekipte görüntülenecek üye yok.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Ekip üyeleri' })).not.toBeInTheDocument();
  });

  it('sunucu hatasında hata durumu ve tekrar deneme sunar', async () => {
    let attempt = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/members': () => {
          attempt += 1;
          return attempt === 1
            ? jsonResponse(500, { message: 'Server Error' })
            : jsonResponse(200, fixtures.paginated(threeMembers, 3));
        },
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/team', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    expect(alert.textContent).not.toContain('Server Error');

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    // Kapsam tablo: oturumdaki kullanıcının adı kabuktaki hesap
    // menüsünde de geçiyor.
    const table = await screen.findByRole('table', { name: 'Ekip üyeleri' });
    expect(within(table).getByText('Ada Lovelace')).toBeInTheDocument();
  });

  /**
   * Ekip uçları owner'a özeldir; member 403 alır. Burada 403 GERÇEKTEN
   * rol kısıtı olduğu için kullanıcıya bunu söylemek doğrudur.
   */
  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        '/members': () =>
          jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    renderApp('/app/team', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    // Backend'in ham İngilizce metni kullanıcıya gösterilmez.
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });

  /**
   * İSTEMCİDE YETKİ KARARI YOK: rol `member` olsa bile istek yapılır.
   * Arayüz rolüne bakıp isteği engelleseydi, yetki kuralının iki ayrı
   * yerde tanımlı olduğu (ve zamanla ayrışacağı) bir sistem kurmuş
   * olurduk.
   */
  it('rol member olsa bile isteği yapar, istemcide engellemez', async () => {
    const fetchMock = mockApi({
      ...memberSession,
      '/members': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/team', { token: 'gecerli-token' });

    await screen.findByRole('alert');

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/members'))).toBe(true);
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/members': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app/team', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  // ------------------------------------------------------------ sayfalama

  it('tek sayfa varsa sayfalama göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/members': () => jsonResponse(200, fixtures.paginated(threeMembers, 3)),
      }),
    );

    renderApp('/app/team', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Ekip üyeleri' });

    expect(screen.queryByRole('navigation', { name: 'Sayfalama' })).not.toBeInTheDocument();
  });

  it('birden çok sayfa varsa sayfa bilgisini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/members': () =>
          jsonResponse(
            200,
            fixtures.paginated(threeMembers, 40, { currentPage: 1, lastPage: 3, perPage: 15 }),
          ),
      }),
    );

    renderApp('/app/team', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(pager).toHaveTextContent('Sayfa 1 / 3');
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeEnabled();
  });

  it('sonraki sayfaya geçince page=2 ister ve o sayfanın içeriğini gösterir', async () => {
    const secondPage = [
      fixtures.member({ id: 31, name: 'İkinci Sayfa Üyesi', email: 'ikinci@flowtiger.test' }),
    ];

    const fetchMock = mockApi({
      ...ownerSession,
      '/members': (_init, url) => {
        const page = new URL(url ?? '', 'http://test.local').searchParams.get('page') ?? '1';

        return jsonResponse(
          200,
          fixtures.paginated(page === '2' ? secondPage : threeMembers, 40, {
            currentPage: Number(page),
            lastPage: 3,
            perPage: 15,
          }),
        );
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/team', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });
    await user.click(within(pager).getByRole('button', { name: 'Sonraki' }));

    expect(await screen.findByText('İkinci Sayfa Üyesi')).toBeInTheDocument();

    // Kapsam tablo: hesap menüsündeki ad listenin içeriği değildir.
    const table = screen.getByRole('table', { name: 'Ekip üyeleri' });
    expect(within(table).queryByText('Ada Lovelace')).not.toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/members?') && url.includes('page=2'))).toBe(true);
  });

  it('son sayfada sonraki düğmesi kapalıdır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/members': () =>
          jsonResponse(
            200,
            fixtures.paginated(threeMembers, 40, { currentPage: 3, lastPage: 3, perPage: 15 }),
          ),
      }),
    );

    renderApp('/app/team', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeEnabled();
  });

  it('üye satırından detaya bağlantı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/members': () => jsonResponse(200, fixtures.paginated(threeMembers, 3)),
      }),
    );

    renderApp('/app/team', { token: 'gecerli-token' });

    const link = await screen.findByRole('link', { name: 'Ada Lovelace' });

    expect(link).toHaveAttribute('href', '/app/team/21');
  });
});
