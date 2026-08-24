import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Finans kayıtları listesi.
 *
 * Backend sözleşmesi (FinanceEntryController::index):
 *   GET /finance-entries?page=N → { data, links, meta }
 *   sıralama financial_date DESC, id DESC — SABİT.
 *   sort/search/filter parametresi YOK, bu yüzden arayüzde de arama ya da
 *   sıralama kontrolü OLMAYACAK; olsaydı çalışmayan bir özellik vaat
 *   ederdik.
 *
 * UÇ OWNER-ONLY'dir (FinanceEntryPolicy → Role::viewsFinance()). Ama bu
 * bilgi İSTEMCİDE KARAR VERİLMEZ (playbook §3.1): arayüz kullanıcının
 * rolüne bakıp isteği engellemez, isteği yapar ve backend 403 dönerse
 * açıklar. Aşağıda ikisi de ayrı ayrı kilitli.
 *
 * LİSTEDE GÖSTERİLEN TUTAR BRÜTTÜR: kasadan gerçekten giren/çıkan para
 * odur. Net ve KDV ayrımı ayrıntı ekranına aittir; listede üç sayıyı yan
 * yana koymak, hangisinin "asıl" olduğunu belirsizleştirir.
 *
 * SİLME YOKTUR VE OLMAYACAK: backend'de DELETE ucu yok, kayıt iptal
 * edilir. Bu yüzden listede de silme eylemi bulunmaz.
 *
 * PARA BİÇİMLENDİRME money.ts'e AİTTİR; bu ekranda tek bir aritmetik
 * işlem yoktur.
 */
describe('FinanceEntryListPage', () => {
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

  /**
   * Brüt 123456 kuruş bilinçli seçildi: "1.234,56 TL" biçiminin ekranda
   * gerçekten oluştuğunu kanıtlar. Üçlü kendi içinde tutarlı —
   * 102880 + 20576 = 123456, oran 2000bp.
   */
  const income = fixtures.financeEntry({
    id: 900,
    direction: 'in',
    financial_date: '2026-08-20',
    category: 'Danışmanlık',
    net_minor: 102880,
    vat_rate_bp: 2000,
    vat_minor: 20576,
    gross_minor: 123456,
    calculation: { basis: 'gross', rounding: 'half_up', vat_applicable: true },
  });

  const expense = fixtures.financeEntry({
    id: 901,
    direction: 'out',
    financial_date: '2026-08-19',
    category: 'Kira',
    net_minor: 50000,
    vat_rate_bp: 1000,
    vat_minor: 5000,
    gross_minor: 55000,
    customer: { id: 501, customer_no: 12, name: 'Zeynep Kaya' },
    calculation: { basis: 'net', rounding: 'half_up', vat_applicable: true },
  });

  const voided = fixtures.financeEntry({
    id: 902,
    direction: 'in',
    financial_date: '2026-08-18',
    category: null,
    net_minor: 30000,
    vat_rate_bp: null,
    vat_minor: 0,
    gross_minor: 30000,
    calculation: { basis: 'net', rounding: 'half_up', vat_applicable: false },
    voided_at: '2026-08-21T08:00:00+00:00',
    void_reason: 'Yanlış tutar girilmiş',
  });

  const threeEntries = [income, expense, voided];

  // ------------------------------------------------------------- açılış

  it('oturumu olan kullanıcıya finans sayfasını açar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated(threeEntries, 3)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Finans' })).toBeInTheDocument();
  });

  it('oturum yoksa giriş ekranına gönderir', async () => {
    vi.stubGlobal('fetch', mockApi(ownerSession));

    renderApp('/app/finance');

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------- liste

  it('kayıtları tarih, yön, müşteri ve brüt tutarla listeler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated(threeEntries, 3)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Finans kayıtları' });

    // Tarih uygulamanın geri kalanıyla aynı biçimde: GG.AA.YYYY.
    expect(within(table).getByText('20.08.2026')).toBeInTheDocument();
    expect(within(table).getByText('19.08.2026')).toBeInTheDocument();
    expect(within(table).getByText('Zeynep Kaya')).toBeInTheDocument();

    // Ham sözleşme biçimi kullanıcıya gösterilmez.
    expect(table.textContent).not.toContain('2026-08-20');
  });

  /** in → Gelir, out → Gider. Ham sözleşme değeri kullanıcıya gösterilmez. */
  it('yön değerlerini Türkçe gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated([income, expense], 2)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Finans kayıtları' });

    expect(
      within(within(table).getByTestId('finance-row-900')).getByText('Gelir'),
    ).toBeInTheDocument();
    expect(
      within(within(table).getByTestId('finance-row-901')).getByText('Gider'),
    ).toBeInTheDocument();
  });

  /**
   * REGRESYON — TUTAR TÜRKÇE PARA BİÇİMİNDE.
   *
   * 123456 kuruş "1.234,56 TL"dir. Ham kuruş gösterilseydi kullanıcı
   * tutarı yüz kat yanlış okurdu.
   */
  it('brüt tutarı Türkçe para biçiminde gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated([income], 1)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    const row = await screen.findByTestId('finance-row-900');

    expect(within(row).getByText('1.234,56 TL')).toBeInTheDocument();
    // Ham kuruş değeri hiçbir yerde görünmemeli.
    expect(row.textContent).not.toContain('123456');
  });

  it('müşterisi olmayan kayıtta uydurma değer göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated([income], 1)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    const row = await screen.findByTestId('finance-row-900');

    expect(within(row).getByTestId('finance-row-customer')).toHaveTextContent('—');
  });

  /**
   * İPTAL EDİLMİŞ KAYIT AKTİF KAYITTAN AYRILIR.
   *
   * İşaret GÖRÜNÜR bir rozettir, yalnızca bir CSS sınıfı değil: rengi
   * ayırt edemeyen ya da ekran okuyucu kullanan biri de farkı görmeli.
   * `data-voided` yalnızca stil kancasıdır ve rozetin yerine geçmez.
   */
  it('iptal edilmiş kaydı aktif kayıttan ayırır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated([income, voided], 2)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    const voidedRow = await screen.findByTestId('finance-row-902');
    const activeRow = screen.getByTestId('finance-row-900');

    expect(within(voidedRow).getByText('İptal edildi')).toBeInTheDocument();
    expect(voidedRow).toHaveAttribute('data-voided', 'true');

    expect(within(activeRow).queryByText('İptal edildi')).not.toBeInTheDocument();
    expect(activeRow).toHaveAttribute('data-voided', 'false');
  });

  it('satırdan kaydın ayrıntısına bağlantı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated([income], 1)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    const row = await screen.findByTestId('finance-row-900');

    expect(within(row).getByRole('link', { name: 'Ayrıntılar' })).toHaveAttribute(
      'href',
      '/app/finance/900',
    );
  });

  it('yeni gelir ve yeni gider için ayrı bağlantı sunar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated(threeEntries, 3)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Yeni gelir' })).toHaveAttribute(
      'href',
      '/app/finance/new/income',
    );
    expect(screen.getByRole('link', { name: 'Yeni gider' })).toHaveAttribute(
      'href',
      '/app/finance/new/expense',
    );
  });

  // -------------------------------------------------------- boş / bekleme

  it('hiç kayıt yokken boş durum gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    expect(await screen.findByText('Henüz finans kaydı yok.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Finans kayıtları' })).not.toBeInTheDocument();
    // Boş durumda da kayıt açma yolu kapanmamalı.
    expect(screen.getByRole('link', { name: 'Yeni gelir' })).toBeInTheDocument();
  });

  /**
   * Yanıt BİLEREK askıda tutulur; anında çözülen bir yanıtta React,
   * bekleme karesini hiç DOM'a yazmadan sonuca geçebilir.
   *
   * Promise mock'un İÇİNDE değil, DIŞINDA kurulur: içeride kurulsaydı
   * çözücü ancak istek atıldığında var olurdu ve test, React'in passive
   * effect'i ne zaman boşalttığına bağlı bir yarışa girerdi.
   */
  it('yüklenirken bekleme durumu gösterir, veri gelince kaldırır', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};

    const pendingEntries = new Promise<Response>((resolve) => {
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
        if (url.includes('/finance-entries')) return pendingEntries;

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    expect(await screen.findByTestId('finance-loading')).toBeInTheDocument();

    deferred.resolve?.(jsonResponse(200, fixtures.paginated(threeEntries, 3)));

    await screen.findByRole('table', { name: 'Finans kayıtları' });
    expect(screen.queryByTestId('finance-loading')).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------- hata

  it('sunucu hatasında ham metni göstermez ve tekrar deneme sunar', async () => {
    let attempt = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => {
          attempt += 1;
          return attempt === 1
            ? jsonResponse(500, { message: 'Server Error' })
            : jsonResponse(200, fixtures.paginated(threeEntries, 3));
        },
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    expect(alert.textContent).not.toContain('Server Error');

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByRole('table', { name: 'Finans kayıtları' })).toBeInTheDocument();
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        '/finance-entries': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });

  /**
   * REGRESYON — İSTEMCİDE YETKİ KARARI YOK.
   *
   * Rol `member` olsa bile istek YAPILIR. Rolüne bakıp isteği engellemek,
   * backend'in yetki kararını istemcide yeniden uygulamak olurdu
   * (playbook §3.1) — ve bir gün ikisi ayrışırdı.
   */
  it('rol member olsa bile isteği yapar, istemcide engellemez', async () => {
    const fetchMock = mockApi({
      ...memberSession,
      '/finance-entries': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/finance', { token: 'gecerli-token' });

    await screen.findByRole('alert');

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/finance-entries'))).toBe(
      true,
    );
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app/finance', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  // ---------------------------------------------------------- sayfalama

  it('ilk sayfayı page=1 ile ister', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/finance-entries': () => jsonResponse(200, fixtures.paginated(threeEntries, 3)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/finance', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Finans kayıtları' });

    const listCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/finance-entries?'));

    expect(listCall).toContain('page=1');
  });

  /**
   * per_page GÖNDERİLMEZ: backend'in kendi varsayılanı (15) kullanılır.
   * İstemcinin sayfa boyutunu dayatması için bir sebep yok ve dayatırsa
   * backend'in varsayılanı değiştiğinde arayüz onu görmez.
   */
  it('per_page dayatmaz', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/finance-entries': () => jsonResponse(200, fixtures.paginated(threeEntries, 3)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/finance', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Finans kayıtları' });

    const listCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/finance-entries?'));

    expect(listCall).not.toContain('per_page');
  });

  it('tek sayfa varsa sayfalama göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () =>
          jsonResponse(200, fixtures.paginated(threeEntries, 3, { lastPage: 1 })),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Finans kayıtları' });

    expect(screen.queryByRole('navigation', { name: 'Sayfalama' })).not.toBeInTheDocument();
  });

  it('birden çok sayfa varsa sayfa bilgisini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () =>
          jsonResponse(
            200,
            fixtures.paginated(threeEntries, 52, { currentPage: 1, lastPage: 4, perPage: 15 }),
          ),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(pager).toHaveTextContent('Sayfa 1 / 4');
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeEnabled();
  });

  it('sonraki sayfaya geçince page=2 ister ve o sayfanın içeriğini gösterir', async () => {
    const secondPage = [
      fixtures.financeEntry({ id: 950, financial_date: '2026-07-01', gross_minor: 999 }),
    ];

    // Sunucu gerçekten istenen sayfayı döndürür; yoksa test yalnızca
    // isteğin gittiğini doğrular, sonucun değiştiğini değil.
    const fetchMock = mockApi({
      ...ownerSession,
      '/finance-entries': (_init, url) => {
        const page = new URL(url ?? '', 'http://test.local').searchParams.get('page') ?? '1';

        return jsonResponse(
          200,
          fixtures.paginated(page === '2' ? secondPage : threeEntries, 52, {
            currentPage: Number(page),
            lastPage: 4,
            perPage: 15,
          }),
        );
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });
    await user.click(within(pager).getByRole('button', { name: 'Sonraki' }));

    expect(await screen.findByTestId('finance-row-950')).toBeInTheDocument();
    expect(screen.queryByTestId('finance-row-900')).not.toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/finance-entries?') && url.includes('page=2'))).toBe(
      true,
    );
  });

  it('son sayfada sonraki düğmesi kapalıdır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () =>
          jsonResponse(
            200,
            fixtures.paginated(threeEntries, 52, { currentPage: 4, lastPage: 4, perPage: 15 }),
          ),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

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
        '/finance-entries': () => jsonResponse(200, fixtures.paginated(threeEntries, 3)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Finans kayıtları' });

    expect(screen.queryByRole('button', { name: 'Sil' })).not.toBeInTheDocument();
  });

  /** Uçta arama/sıralama parametresi yok; arayüz de vaat etmez. */
  it('arama ya da sıralama kontrolü göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated(threeEntries, 3)),
      }),
    );

    renderApp('/app/finance', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Finans kayıtları' });

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sırala/i })).not.toBeInTheDocument();
  });
});
