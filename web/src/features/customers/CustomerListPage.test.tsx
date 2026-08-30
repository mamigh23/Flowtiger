import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Müşteri listesi.
 *
 * Backend sözleşmesi (CustomerController::index):
 *   GET /customers?page=N   → { data, links, meta }
 *   sıralama customer_no artan — SABİT. sort/search/filter parametresi YOK,
 *   dolayısıyla arayüzde de arama ya da sıralama kontrolü olmayacak;
 *   olsaydı çalışmayan bir özellik gösterirdik.
 *
 * 403 burada ROL yetkisi demek DEĞİLDİR: CustomerPolicy rol ayrımı
 * yapmaz, owner da member da tüm CRUD'u yapabilir. 403 yalnızca "aktif
 * şirket yok ya da üyelik iptal edilmiş" anlamına gelir.
 */
describe('CustomerListPage', () => {
  const session = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  const threeCustomers = [
    fixtures.customer({ id: 501, customer_no: 1, name: 'Zeynep Kaya', phone: '05551112233' }),
    fixtures.customer({ id: 502, customer_no: 2, name: 'Mert Demir', phone: null }),
    fixtures.customer({ id: 503, customer_no: 3, name: 'Elif Şahin', phone: '05339998877' }),
  ];

  it('müşterileri numara, ad ve telefonla listeler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () => jsonResponse(200, fixtures.paginated(threeCustomers, 3)),
      }),
    );

    renderApp('/app/customers', { token: 'gecerli-token' });

    const list = await screen.findByRole('table', { name: 'Müşteriler' });

    expect(within(list).getByText('Zeynep Kaya')).toBeInTheDocument();
    expect(within(list).getByText('Mert Demir')).toBeInTheDocument();
    expect(within(list).getByText('Elif Şahin')).toBeInTheDocument();

    // Kullanıcıya gösterilen numara customer_no'dur, id değil.
    expect(within(list).getByText('1')).toBeInTheDocument();
    expect(within(list).queryByText('501')).not.toBeInTheDocument();

    expect(within(list).getByText('05551112233')).toBeInTheDocument();
  });

  /**
   * REGRESYON — DAR VIEWPORTTA TABLO KARTI TAŞIRMAMALI.
   *
   * Tablo, yatay kaydırmayı üstlenen bir sarmalayıcının içinde olmalı;
   * sarmalayıcı kolon gizlemez, yalnızca gerektiğinde `overflow-x` sağlar.
   */
  it('tablo yatay kaydırma sarmalayıcısı içindedir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () => jsonResponse(200, fixtures.paginated(threeCustomers, 3)),
      }),
    );

    renderApp('/app/customers', { token: 'gecerli-token' });

    const list = await screen.findByRole('table', { name: 'Müşteriler' });

    expect(list.parentElement).toHaveClass('ft-table-scroll');
  });

  it('telefonu olmayan müşteride uydurma değer göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () =>
          jsonResponse(200, fixtures.paginated([threeCustomers[1]!], 1)),
      }),
    );

    renderApp('/app/customers', { token: 'gecerli-token' });

    const row = await screen.findByRole('row', { name: /Mert Demir/ });

    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  /**
   * Yanıt BİLEREK askıda tutulur. Anında çözülen bir yanıtta React,
   * yükleme karesini hiç DOM'a yazmadan sonuca geçebilir; o zaman test
   * "bekleme durumu var mı" sorusunu değil, "ne kadar hızlı bitti"
   * sorusunu ölçmüş olurdu.
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
     * `deferred.resolve?.(...)` sessizce hiçbir şey yapmadan geçebilir
     * (`?.` çözücünün yokluğunu yutuyor). O durumda istek sonsuza kadar
     * askıda kalır ve bekleme karesi hiç kalkmaz.
     *
     * Promise'i burada kurmak testi SIRADAN BAĞIMSIZ yapar: çözücü render
     * başlamadan vardır ve yanıt istekten önce çözülse bile bileşen zaten
     * çözülmüş bir promise alır. İddia gevşemedi — aksine, artık her iki
     * sırada da geçerli.
     */
    const pendingCustomers = new Promise<Response>((resolve) => {
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
        if (url.includes('/customers')) return pendingCustomers;

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    renderApp('/app/customers', { token: 'gecerli-token' });

    expect(await screen.findByTestId('customers-loading')).toBeInTheDocument();

    deferred.resolve?.(jsonResponse(200, fixtures.paginated(threeCustomers, 3)));

    await screen.findByRole('table', { name: 'Müşteriler' });
    expect(screen.queryByTestId('customers-loading')).not.toBeInTheDocument();
  });

  it('ilk sayfayı page=1 ile ister', async () => {
    const fetchMock = mockApi({
      ...session,
      '/customers': () => jsonResponse(200, fixtures.paginated(threeCustomers, 3)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/customers', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Müşteriler' });

    const listCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/customers?'));

    expect(listCall).toContain('page=1');
  });

  it('hiç müşteri yokken boş durum ve oluşturma çağrısı gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app/customers', { token: 'gecerli-token' });

    expect(await screen.findByText('Henüz müşteri yok.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Yeni müşteri' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Müşteriler' })).not.toBeInTheDocument();
  });

  it('sunucu hatasında hata durumu ve tekrar deneme sunar', async () => {
    let attempt = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () => {
          attempt += 1;
          return attempt === 1
            ? jsonResponse(500, { message: 'Server Error' })
            : jsonResponse(200, fixtures.paginated(threeCustomers, 3));
        },
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/customers', { token: 'gecerli-token' });

    // 500'ün backend metni kullanıcıya gösterilmez.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    expect(alert.textContent).not.toContain('Server Error');

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('Zeynep Kaya')).toBeInTheDocument();
  });

  /**
   * Üyelik iptal edilmişse backend 403 döner. Bu bir ROL kısıtı değildir;
   * arayüz "yetkiniz yok" diyerek kullanıcıya yanlış bir zihinsel model
   * vermemeli.
   */
  it('403 durumunu rol yetkisi gibi göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () =>
          jsonResponse(403, {
            message: 'Aktif şirket bulunamadı ya da doğrulanamadı. Erişim reddedildi.',
            code: 'company_context_unavailable',
          }),
      }),
    );

    renderApp('/app/customers', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Erişim reddedildi.');
    expect(alert.textContent).not.toMatch(/rol|yetkiniz yok/i);
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app/customers', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  // ------------------------------------------------------------ sayfalama

  it('tek sayfa varsa sayfalama göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () =>
          jsonResponse(200, fixtures.paginated(threeCustomers, 3, { lastPage: 1 })),
      }),
    );

    renderApp('/app/customers', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Müşteriler' });

    expect(screen.queryByRole('navigation', { name: 'Sayfalama' })).not.toBeInTheDocument();
  });

  it('birden çok sayfa varsa sayfa bilgisini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () =>
          jsonResponse(
            200,
            fixtures.paginated(threeCustomers, 52, { currentPage: 1, lastPage: 4, perPage: 15 }),
          ),
      }),
    );

    renderApp('/app/customers', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(pager).toHaveTextContent('Sayfa 1 / 4');
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeEnabled();
  });

  it('sonraki sayfaya geçince page=2 ister ve o sayfanın içeriğini gösterir', async () => {
    const secondPage = [
      fixtures.customer({ id: 601, customer_no: 16, name: 'İkinci Sayfa Müşterisi' }),
    ];

    // Sunucu gerçekten istenen sayfayı döndürür; yoksa test yalnızca
    // isteğin gittiğini doğrular, sonucun değiştiğini değil.
    const fetchMock = mockApi({
      ...session,
      '/customers': (_init, url) => {
        const page = new URL(url ?? '', 'http://test.local').searchParams.get('page') ?? '1';

        return jsonResponse(
          200,
          fixtures.paginated(page === '2' ? secondPage : threeCustomers, 52, {
            currentPage: Number(page),
            lastPage: 4,
            perPage: 15,
          }),
        );
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/customers', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });
    await user.click(within(pager).getByRole('button', { name: 'Sonraki' }));

    expect(await screen.findByText('İkinci Sayfa Müşterisi')).toBeInTheDocument();
    expect(screen.queryByText('Zeynep Kaya')).not.toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/customers?') && url.includes('page=2'))).toBe(true);
  });

  it('son sayfada sonraki düğmesi kapalıdır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () =>
          jsonResponse(
            200,
            fixtures.paginated(threeCustomers, 52, { currentPage: 4, lastPage: 4, perPage: 15 }),
          ),
      }),
    );

    renderApp('/app/customers', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeEnabled();
  });

  it('müşteri satırından detaya bağlantı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () => jsonResponse(200, fixtures.paginated(threeCustomers, 3)),
      }),
    );

    renderApp('/app/customers', { token: 'gecerli-token' });

    const link = await screen.findByRole('link', { name: 'Zeynep Kaya' });

    expect(link).toHaveAttribute('href', '/app/customers/501');
  });
});
