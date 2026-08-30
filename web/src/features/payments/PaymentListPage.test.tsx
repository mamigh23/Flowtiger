import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Ödeme listesi.
 *
 * Backend sözleşmesi (PaymentController::index):
 *   GET /payments?page=N → { data, links, meta }
 *   sıralama financial_date DESC, id DESC — SABİT.
 *   sort/search/filter parametresi YOK, bu yüzden arayüzde de arama ya da
 *   sıralama kontrolü OLMAYACAK.
 *
 * `allocated_minor` ve `remaining_minor` BACKEND'DEN GELİR, hesaplanmaz.
 * Değişmez: amount = allocated + remaining. Arayüz bu üçlüyü yalnızca
 * gösterir; birini diğerlerinden çıkarmaya kalkarsa ikinci bir hesaplama
 * motoru doğar.
 *
 * SİLME YOKTUR: backend'de DELETE ucu yok, ödeme iptal edilir ve
 * dağıtımları yerinde kalır.
 *
 * UÇ OWNER-ONLY (PaymentPolicy → Role::viewsFinance) ama bu karar
 * İSTEMCİDE VERİLMEZ: istek yapılır, 403 gelirse açıklanır (playbook §3.1).
 */
describe('PaymentListPage', () => {
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

  /** Kısmen dağıtılmış: 120000 = 50000 + 70000. */
  const partlyAllocated = fixtures.payment({
    id: 800,
    financial_date: '2026-08-22',
    amount_minor: 120000,
    method: 'Havale',
    customer: { id: 501, customer_no: 12, name: 'Zeynep Kaya' },
    allocations: [fixtures.paymentAllocation({ id: 1, amount_minor: 50000 })],
    allocated_minor: 50000,
    remaining_minor: 70000,
  });

  /** Hedefsiz avans: müşteri de yok, dağıtım da yok. */
  const advance = fixtures.payment({
    id: 801,
    financial_date: '2026-08-21',
    amount_minor: 30000,
    method: null,
    customer: null,
    allocations: [],
    allocated_minor: 0,
    remaining_minor: 30000,
  });

  const voidedPayment = fixtures.payment({
    id: 802,
    financial_date: '2026-08-20',
    amount_minor: 45000,
    method: 'Nakit',
    allocations: [fixtures.paymentAllocation({ id: 2, amount_minor: 45000 })],
    allocated_minor: 45000,
    remaining_minor: 0,
    voided_at: '2026-08-23T08:00:00+00:00',
    void_reason: 'Mükerrer tahsilat',
  });

  const threePayments = [partlyAllocated, advance, voidedPayment];

  // ------------------------------------------------------------- açılış

  it('oturumu olan kullanıcıya ödemeler sayfasını açar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated(threePayments, 3)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Ödemeler' })).toBeInTheDocument();
  });

  it('oturum yoksa giriş ekranına gönderir', async () => {
    vi.stubGlobal('fetch', mockApi(ownerSession));

    renderApp('/app/payments');

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------- liste

  it('ödemeleri tarih, müşteri ve yöntemle listeler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated(threePayments, 3)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Ödemeler' });

    expect(within(table).getByText('22.08.2026')).toBeInTheDocument();
    expect(within(table).getByText('Zeynep Kaya')).toBeInTheDocument();
    expect(within(table).getByText('Havale')).toBeInTheDocument();

    // Ham sözleşme biçimi kullanıcıya gösterilmez.
    expect(table.textContent).not.toContain('2026-08-22');
  });

  /**
   * REGRESYON — DAR VIEWPORTTA TABLO KARTI TAŞIRMAMALI.
   *
   * Bu tablo da (Finans'la birlikte) 8 kolonludur. Sarmalayıcı kolon
   * gizlemez, yalnızca gerektiğinde `overflow-x` sağlar.
   */
  it('tablo yatay kaydırma sarmalayıcısı içindedir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated(threePayments, 3)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Ödemeler' });

    expect(table.parentElement).toHaveClass('ft-table-scroll');
  });

  /**
   * REGRESYON — TUTARLAR TÜRKÇE PARA BİÇİMİNDE.
   *
   * 120000 kuruş "1.200,00 TL"dir. Ham kuruş gösterilseydi kullanıcı
   * tutarı yüz kat yanlış okurdu.
   */
  it('tutar, dağıtılan ve kalanı Türkçe para biçiminde gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated([partlyAllocated], 1)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const row = await screen.findByTestId('payment-row-800');

    expect(within(row).getByTestId('payment-row-amount')).toHaveTextContent('1.200,00 TL');
    expect(within(row).getByTestId('payment-row-allocated')).toHaveTextContent('500,00 TL');
    expect(within(row).getByTestId('payment-row-remaining')).toHaveTextContent('700,00 TL');

    expect(row.textContent).not.toContain('120000');
  });

  /**
   * REGRESYON — KALAN BACKEND'DEN GELİR.
   *
   * Arayüz `amount - allocated` hesabı yapmaz. Backend bir gün kuralı
   * değiştirirse (ör. iptal edilmiş dağıtımları dışlarsa) istemcideki
   * kopya sessizce yanlış sonuç verirdi.
   */
  it('kalan tutarı yanıttaki değerden gösterir, kendisi hesaplamaz', async () => {
    // Bilerek "tutarsız" bir yanıt: amount - allocated 70000 ederdi.
    // Ekran yanıtta ne yazıyorsa onu göstermeli.
    const serverSaid = fixtures.payment({
      id: 803,
      amount_minor: 120000,
      allocations: [],
      allocated_minor: 50000,
      remaining_minor: 12345,
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated([serverSaid], 1)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const row = await screen.findByTestId('payment-row-803');

    expect(within(row).getByTestId('payment-row-remaining')).toHaveTextContent('123,45 TL');
  });

  it('müşterisi ve yöntemi olmayan ödemede uydurma değer göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated([advance], 1)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const row = await screen.findByTestId('payment-row-801');

    expect(within(row).getByTestId('payment-row-customer')).toHaveTextContent('—');
    expect(within(row).getByTestId('payment-row-method')).toHaveTextContent('—');
  });

  /** `method` serbest metindir (max:50), enum değil. Ne gelirse yazılır. */
  it('yöntemi backendden geldiği gibi gösterir', async () => {
    const custom = fixtures.payment({ id: 804, method: 'Kredi kartı — taksitli' });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated([custom], 1)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const row = await screen.findByTestId('payment-row-804');

    expect(within(row).getByTestId('payment-row-method')).toHaveTextContent(
      'Kredi kartı — taksitli',
    );
  });

  /** `amount_minor` min:0 — sıfır tutarlı ödeme sözleşmeye uygundur. */
  it('sıfır tutarlı ödemeyi gösterir', async () => {
    const zero = fixtures.payment({
      id: 805,
      amount_minor: 0,
      allocated_minor: 0,
      remaining_minor: 0,
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated([zero], 1)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const row = await screen.findByTestId('payment-row-805');

    expect(within(row).getByTestId('payment-row-amount')).toHaveTextContent('0,00 TL');
  });

  /**
   * İptal edilmiş ödeme aktif olandan ayrılır. İşaret GÖRÜNÜR bir
   * rozettir, yalnızca bir CSS sınıfı değil.
   */
  it('iptal edilmiş ödemeyi aktif olandan ayırır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () =>
          jsonResponse(200, fixtures.paginated([partlyAllocated, voidedPayment], 2)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const voidedRow = await screen.findByTestId('payment-row-802');
    const activeRow = screen.getByTestId('payment-row-800');

    expect(within(voidedRow).getByText('İptal edildi')).toBeInTheDocument();
    expect(voidedRow).toHaveAttribute('data-voided', 'true');

    expect(within(activeRow).queryByText('İptal edildi')).not.toBeInTheDocument();
    expect(activeRow).toHaveAttribute('data-voided', 'false');
  });

  it('satırdan ödemenin ayrıntısına bağlantı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated([partlyAllocated], 1)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const row = await screen.findByTestId('payment-row-800');

    expect(within(row).getByRole('link', { name: 'Ayrıntılar' })).toHaveAttribute(
      'href',
      '/app/payments/800',
    );
  });

  it('yeni ödeme bağlantısı sunar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated(threePayments, 3)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Yeni ödeme' })).toHaveAttribute(
      'href',
      '/app/payments/new',
    );
  });

  // -------------------------------------------------------- boş / bekleme

  it('hiç ödeme yokken boş durum gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    expect(await screen.findByText('Henüz ödeme yok.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Ödemeler' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Yeni ödeme' })).toBeInTheDocument();
  });

  /**
   * Yanıt bilerek askıda tutulur. Promise mock'un İÇİNDE değil DIŞINDA
   * kurulur: içeride kurulsaydı çözücü ancak istek atıldığında var olurdu
   * ve test, React'in passive effect'i ne zaman boşalttığına bağlı bir
   * yarışa girerdi.
   */
  it('yüklenirken bekleme durumu gösterir, veri gelince kaldırır', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};

    const pendingPayments = new Promise<Response>((resolve) => {
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
        if (url.includes('/payments')) return pendingPayments;

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    expect(await screen.findByTestId('payments-loading')).toBeInTheDocument();

    deferred.resolve?.(jsonResponse(200, fixtures.paginated(threePayments, 3)));

    await screen.findByRole('table', { name: 'Ödemeler' });
    expect(screen.queryByTestId('payments-loading')).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------- hata

  it('sunucu hatasında ham metni göstermez ve tekrar deneme sunar', async () => {
    let attempt = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => {
          attempt += 1;
          return attempt === 1
            ? jsonResponse(500, { message: 'Server Error' })
            : jsonResponse(200, fixtures.paginated(threePayments, 3));
        },
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    expect(alert.textContent).not.toContain('Server Error');

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByRole('table', { name: 'Ödemeler' })).toBeInTheDocument();
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        '/payments': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });

  /**
   * REGRESYON — İSTEMCİDE YETKİ KARARI YOK.
   *
   * Rol `member` olsa bile istek YAPILIR. Rolüne bakıp isteği engellemek,
   * backend'in yetki kararını istemcide yeniden uygulamak olurdu.
   */
  it('rol member olsa bile isteği yapar, istemcide engellemez', async () => {
    const fetchMock = mockApi({
      ...memberSession,
      '/payments': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/payments', { token: 'gecerli-token' });

    await screen.findByRole('alert');

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/payments'))).toBe(true);
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app/payments', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  // ---------------------------------------------------------- sayfalama

  it('ilk sayfayı page=1 ile ister', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/payments': () => jsonResponse(200, fixtures.paginated(threePayments, 3)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/payments', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Ödemeler' });

    const listCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/payments?'));

    expect(listCall).toContain('page=1');
  });

  /**
   * per_page DAYATILMAZ: backend'in kendi varsayılanı (15) kullanılır.
   * İstemci sayfa boyutunu dayatırsa, backend varsayılanı değiştiğinde
   * arayüz onu hiç görmez. Üst sınır zaten backend'de (100).
   */
  it('per_page dayatmaz', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/payments': () => jsonResponse(200, fixtures.paginated(threePayments, 3)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/payments', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Ödemeler' });

    const listCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/payments?'));

    expect(listCall).not.toContain('per_page');
  });

  it('tek sayfa varsa sayfalama göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () =>
          jsonResponse(200, fixtures.paginated(threePayments, 3, { lastPage: 1 })),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Ödemeler' });

    expect(screen.queryByRole('navigation', { name: 'Sayfalama' })).not.toBeInTheDocument();
  });

  it('birden çok sayfa varsa sayfa bilgisini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () =>
          jsonResponse(
            200,
            fixtures.paginated(threePayments, 52, { currentPage: 1, lastPage: 4, perPage: 15 }),
          ),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(pager).toHaveTextContent('Sayfa 1 / 4');
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeEnabled();
  });

  it('sonraki sayfaya geçince page=2 ister ve o sayfanın içeriğini gösterir', async () => {
    const secondPage = [fixtures.payment({ id: 850, financial_date: '2026-07-01' })];

    const fetchMock = mockApi({
      ...ownerSession,
      '/payments': (_init, url) => {
        const page = new URL(url ?? '', 'http://test.local').searchParams.get('page') ?? '1';

        return jsonResponse(
          200,
          fixtures.paginated(page === '2' ? secondPage : threePayments, 52, {
            currentPage: Number(page),
            lastPage: 4,
            perPage: 15,
          }),
        );
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });
    await user.click(within(pager).getByRole('button', { name: 'Sonraki' }));

    expect(await screen.findByTestId('payment-row-850')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-row-800')).not.toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/payments?') && url.includes('page=2'))).toBe(true);
  });

  it('son sayfada sonraki düğmesi kapalıdır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () =>
          jsonResponse(
            200,
            fixtures.paginated(threePayments, 52, { currentPage: 4, lastPage: 4, perPage: 15 }),
          ),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeEnabled();
  });

  // -------------------------------------------------------------- sınır

  /**
   * REGRESYON: bu ekranda SİLME YOKTUR. Backend'de DELETE ucu yok; bir
   * silme düğmesi çalışmayan bir vaat olurdu.
   */
  it('silme eylemi sunmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated(threePayments, 3)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Ödemeler' });

    expect(screen.queryByRole('button', { name: 'Sil' })).not.toBeInTheDocument();
  });

  it('arama ya da sıralama kontrolü göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments': () => jsonResponse(200, fixtures.paginated(threePayments, 3)),
      }),
    );

    renderApp('/app/payments', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Ödemeler' });

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sırala/i })).not.toBeInTheDocument();
  });
});
