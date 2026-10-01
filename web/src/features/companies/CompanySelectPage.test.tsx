import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp, renderAppWithHistory } from '@/test/harness';
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

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
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
      expect(screen.getByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument(),
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

  // ------------------------------------------------- şirket DEĞİŞTİRME

  /**
   * Aktif şirket VARKEN seçim ekranı erişilebilir olmalı ve panele geri
   * yönlendirmemeli — yoksa "Şirket değiştir" kontrolü işe yaramaz.
   *
   * Bu, mevcut davranışın (aktif şirket varken /app'e yönlendirme) GEÇİŞ
   * kipinde bilinçli olarak gevşetilmesidir; ilk seçim kipinde kural
   * aynen korunur.
   */
  it('geçiş kipinde aktif şirket varken seçim ekranı açılır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
        '/companies': () =>
          jsonResponse(200, { data: twoCompanies, meta: { active_company_id: 7 } }),
      }),
    );

    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Şirket değiştir' })).toBeInTheDocument();
    expect(screen.getByText('Kaplan Yazılım')).toBeInTheDocument();
    expect(screen.getByText('Bengal Danışmanlık')).toBeInTheDocument();
  });

  /** Aktif şirket işaretlenir ve yeniden seçilemez. */
  it('geçiş kipinde aktif şirketi işaretler ve seçilemez yapar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
        '/companies': () =>
          jsonResponse(200, { data: twoCompanies, meta: { active_company_id: 7 } }),
      }),
    );

    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    expect(screen.getByText('Aktif şirket')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seçili' })).toBeDisabled();

    // Yalnızca DİĞER şirket seçilebilir.
    expect(screen.getAllByRole('button', { name: 'Seç' })).toHaveLength(1);
  });

  it('geçiş kipinde "Vazgeç" panele döner', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
        '/companies': () =>
          jsonResponse(200, { data: twoCompanies, meta: { active_company_id: 7 } }),
        '/tasks/today': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });
    await user.click(screen.getByRole('button', { name: 'Vazgeç' }));

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
  });

  /**
   * İLK SEÇİM KİPİ REGRESYONU: aktif şirket varken `?switch` OLMADAN
   * gelmek hâlâ panele yönlendirir.
   */
  it('ilk seçim kipinde aktif şirket varken panele yönlendirir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
        '/companies': () =>
          jsonResponse(200, { data: twoCompanies, meta: { active_company_id: 7 } }),
        '/tasks/today': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app/company-select', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
  });

  /**
   * A → B GEÇİŞİ VE DASHBOARD DÖNÜŞÜ.
   *
   * Seçim başarılı olduğunda yeni şirketin paneli açılır ve üst bardaki
   * şirket adı YENİ şirkettir.
   */
  it('başka şirkete geçiş panelde yeni şirketle sonuçlanır', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
        '/companies/9/select': () => jsonResponse(200, { data: bengal }),
        '/companies': () =>
          jsonResponse(200, { data: [kaplan, bengal], meta: { active_company_id: 7 } }),
        '/tasks/today': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    // Bengal kartındaki "Seç" düğmesi.
    const bengalCard = screen.getByText('Bengal Danışmanlık').closest('li')!;
    await user.click(within(bengalCard).getByRole('button', { name: 'Seç' }));

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();

    // Üst bar yeni şirketi gösterir.
    const topbar = document.querySelector('.ft-topbar__company')!;
    expect(within(topbar as HTMLElement).getByText('Bengal Danışmanlık')).toBeInTheDocument();
    expect(within(topbar as HTMLElement).queryByText('Kaplan Yazılım')).not.toBeInTheDocument();
  });

  /**
   * BAŞARISIZ SEÇİM MEVCUT ŞİRKETİ KORUR.
   *
   * 403 dönerse kullanıcı seçim ekranında kalır, hata gösterilir ve
   * aktif şirket DEĞİŞMEZ.
   */
  it('başarısız seçimde mevcut şirket korunur ve hata gösterilir', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
        '/companies/9/select': () =>
          jsonResponse(403, { message: 'Bu şirkete erişim yetkiniz yok.' }),
        '/companies': () =>
          jsonResponse(200, { data: [kaplan, bengal], meta: { active_company_id: 7 } }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    const bengalCard = screen.getByText('Bengal Danışmanlık').closest('li')!;
    await user.click(within(bengalCard).getByRole('button', { name: 'Seç' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu şirkete erişim yetkiniz yok.');

    // Hâlâ seçim ekranındayız ve aktif şirket Kaplan olarak işaretli.
    expect(screen.getByRole('heading', { name: 'Şirket değiştir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seçili' })).toBeInTheDocument();
  });

  /**
   * REGRESYON — SEÇİM SÜRERKEN GERİ DÖNÜŞTE KİRACI İŞLEMİ BAŞLAMAZ.
   *
   * Seçim isteği ASKIDA bırakılır ve kullanıcı tarayıcı geri tuşuyla
   * seçim ekranından çıkar. Geri, gezinme geçmişindeki bir önceki
   * girdiye döner (kabuk açılışta zaten oradaydı; kullanıcı "Şirket
   * değiştir"e basıp seçim ekranına gitmişti).
   *
   * TEHLİKE: o anda aktif şirket HÂLÂ eski değeri taşıdığı için
   * `RequireActiveCompany` korumasından geçilir ve kabuk kurulur.
   * Seçim bitmediği için hangi kiracıda olduğumuz kesin değildir —
   * alt ağacın kurulup veri istemesi yanlış şirkete yazma riskidir.
   *
   * Test bunu İSTEK SAYARAK ölçer: geri dönüşten sonra müşteri listesi
   * ucu HİÇ çağrılmamalıdır (ekran takılı kalsa da, kurulup hemen
   * sökülse de bu iddia düşer).
   */
  it('seçim sürerken tarayıcı geri tuşuyla dönülürse tenant isteği başlamaz', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    const deferred: { resolve?: (response: Response) => void } = {};
    const pending = new Promise<Response>((resolve) => {
      deferred.resolve = resolve;
    });

    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
      '/companies/9/select': () => pending,
      '/companies': () =>
        jsonResponse(200, { data: [kaplan, bengal], meta: { active_company_id: 7 } }),
      '/tasks/today': () => jsonResponse(200, fixtures.paginated([], 0)),
      '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
      '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
      '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
    });

    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();

    /*
      Gezinme geçmişi: müşteriler → seçim ekranı. `goBack()` aynı yığında
      POP yapar — tarayıcı geri tuşunun router'daki karşılığı. (Gerçek
      `window.history.back()` jsdom'da router'ı yürütmez; bu yüzden
      sıralamayı ölçen bir test onunla kurulamaz.)
    */
    const { goBack } = renderAppWithHistory(
      ['/app/customers', '/app/company-select?switch=1'],
      { token: 'gecerli-token' },
    );

    // Önce seçim ekranı gerçekten kuruldu.
    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    await user.click(screen.getByRole('button', { name: 'Seç' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/companies/9/select')),
      ).toHaveLength(1),
    );

    const customerCallsBeforeBack = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/customers'),
    ).length;

    // TARAYICI GERİ TUŞU.
    goBack();

    /*
      ASIL İDDİA: geri dönüşten sonra HİÇBİR yeni müşteri isteği
      atılmaz. İstek sayısı ölçülür çünkü ekran kurulup hemen sökülse
      bile liste ucu bir kez çağrılmış olurdu — görsel bir kontrol bunu
      kaçırırdı. (Düzeltmeden önce bu iddia DÜŞER: kabuk eski aktif
      şirketle kurulur ve müşteri listesi isteği gider.)
    */
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/customers')),
    ).toHaveLength(customerCallsBeforeBack);

    // Ve içerik gerçekten askıdadır: eski ekran/gösterge değil, bekleme.
    expect(await screen.findByTestId('company-selection-pending')).toBeInTheDocument();

    // Seçim tamamlanınca içerik serbest kalır.
    deferred.resolve?.(jsonResponse(200, { data: bengal }));

    expect(await screen.findByText('Bengal Danışmanlık')).toBeInTheDocument();
  });

  /**
   * ÇİFT TIKLAMA TEK İSTEK ÜRETİR — VE İKİNCİ TIKLAMA BAŞARI SAYILMAZ.
   *
   * Bir seçim sürerken başka bir seçim başlatılırsa ikinci istek hiç
   * atılmaz. Düğmeler bu sırada zaten kilitli; test bunu baypas etmek
   * için kartları yeniden sorgulayıp zorla iki kez tıklar.
   */
  it('seçim sürerken ikinci seçim istek üretmez', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });
    const cevdet = fixtures.company({ id: 11, name: 'Cevdet İnşaat', role: 'member' });

    const deferred: { resolve?: (response: Response) => void } = {};
    const pending = new Promise<Response>((resolve) => {
      deferred.resolve = resolve;
    });

    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
      '/companies/9/select': () => pending,
      '/companies': () =>
        jsonResponse(200, { data: [kaplan, bengal, cevdet], meta: { active_company_id: 7 } }),
    });

    vi.stubGlobal('fetch', fetchMock);

    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    const selectButtons = screen.getAllByRole('button', { name: 'Seç' });

    // İlk tıklama isteği askıda bırakır.
    fireEvent.click(selectButtons[0]!);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/companies/9/select')),
      ).toHaveLength(1),
    );

    // Sürerken ikinci bir tıklama: yeni istek ATILMAMALI.
    fireEvent.click(screen.getAllByRole('button', { name: 'Seç' })[0]!);

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/companies/9/select')),
    ).toHaveLength(1);

    deferred.resolve?.(jsonResponse(200, { data: bengal }));
  });

  /**
   * BELİRSİZ AĞ HATASI SONRASI DOĞRULAMA.
   *
   * Seçim isteği ağ hatasıyla dönerse sunucudaki aktif şirket yeniden
   * okunur. Sunucu seçimin GERÇEKLEŞTİĞİNİ söylüyorsa hata gösterilmez
   * ve panele gidilir — seçim aslında olmuştur.
   */
  it('belirsiz ağ hatasında sunucu seçimi doğrularsa panele gider', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    let listedActive = 7;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) {
          return jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) });
        }

        if (url.endsWith('/companies/9/select')) {
          // Sunucu kaydetti ama yanıt kayboldu.
          listedActive = 9;
          throw new TypeError('Failed to fetch');
        }

        if (url.includes('/companies')) {
          return jsonResponse(200, {
            data: [kaplan, bengal],
            meta: { active_company_id: listedActive },
          });
        }

        if (url.includes('/tasks/today')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/audit-logs')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/customers')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/members')) return jsonResponse(200, fixtures.paginated([], 0));

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    const bengalCard = screen.getByText('Bengal Danışmanlık').closest('li')!;
    await user.click(within(bengalCard).getByRole('button', { name: 'Seç' }));

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
  });

  /**
   * BELİRSİZ HATA + DOĞRULANAMAYAN SUNUCU → İŞLEM DURDURULUR.
   *
   * Yanıt kaybolduğunda sunucu da okunamıyorsa kullanıcı hangi şirkette
   * olduğunu bilmiyor demektir. Panel açılıp eski bağlamda işlem
   * yaptırılmaz; uyarı gösterilir.
   */
  it('belirsiz hatada durum doğrulanamazsa panel açılmaz', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) {
          return jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) });
        }

        if (url.endsWith('/companies/9/select')) throw new TypeError('Failed to fetch');

        if (url.includes('/companies')) {
          return jsonResponse(200, {
            data: [kaplan, bengal],
            meta: { active_company_id: 7 },
          });
        }

        if (url.includes('/tasks/today')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/audit-logs')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/customers')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/members')) return jsonResponse(200, fixtures.paginated([], 0));

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    const bengalCard = screen.getByText('Bengal Danışmanlık').closest('li')!;
    await user.click(within(bengalCard).getByRole('button', { name: 'Seç' }));

    // Seçim ekranında kalır: yeni şirket "seçilmiş" sayılmaz.
    expect(await screen.findByRole('heading', { name: 'Şirket değiştir' })).toBeInTheDocument();
    // Sunucu tarafında 9 kaydedilmişse de yerel önbellek 7'yi koruyor ve
    // hata durumu kullanıcıya bildiriliyor.
    expect(screen.getByRole('button', { name: 'Seçili' })).toBeInTheDocument();
  });

  /** Yeniden seçim: başarısız denemeden sonra tekrar denenebilir. */
  it('başarısız seçimden sonra tekrar denemeye izin verir', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    let attempt = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
        '/companies/9/select': () => {
          attempt += 1;
          return attempt === 1
            ? jsonResponse(403, { message: 'Bu şirkete erişim yetkiniz yok.' })
            : jsonResponse(200, { data: bengal });
        },
        '/companies': () =>
          jsonResponse(200, { data: [kaplan, bengal], meta: { active_company_id: 7 } }),
        '/tasks/today': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    const pickBengal = () =>
      within(screen.getByText('Bengal Danışmanlık').closest('li')!).getByRole('button', {
        name: 'Seç',
      });

    await user.click(pickBengal());
    expect(await screen.findByRole('alert')).toHaveTextContent('Bu şirkete erişim yetkiniz yok.');

    await user.click(pickBengal());
    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
  });

  /**
   * OWNER'DAN MEMBER'A GEÇİŞ: rol engel değil, seçim yeterli.
   *
   * İstemci rolü bir kapı olarak kullanmaz (playbook §3.1) — üye olunan
   * her şirket seçilebilir; yetki kararı backend'de verilir.
   */
  it('owner olunan şirketten member olunan şirkete geçilebilir', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
        '/companies/9/select': () => jsonResponse(200, { data: bengal }),
        '/companies': () =>
          jsonResponse(200, { data: [kaplan, bengal], meta: { active_company_id: 7 } }),
        '/tasks/today': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    const bengalCard = screen.getByText('Bengal Danışmanlık').closest('li')!;
    await user.click(within(bengalCard).getByRole('button', { name: 'Seç' }));

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();

    const topbar = document.querySelector('.ft-topbar__company') as HTMLElement;
    expect(within(topbar).getByText('Bengal Danışmanlık')).toBeInTheDocument();
    // Yeni aktif şirketin rolü esas alınır: member.
    expect(within(topbar).getByText('Üye')).toBeInTheDocument();
  });

  /** Geçiş kipinde liste boşsa da kilitlenilmez: panele dönüş yolu kalır. */
  it('hiç şirket yoksa geçiş kipinde boş durum ve panele dönüş sunar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
        '/companies': () => jsonResponse(200, { data: [], meta: { active_company_id: 7 } }),
      }),
    );

    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    expect(await screen.findByText(/Henüz hiçbir şirkete üye değilsiniz/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vazgeç' })).toBeInTheDocument();
  });

  /**
   * GELEN DAVETLER ERİŞİMİ — bu ekrandan VERİLMELİDİR.
   *
   * Hesap menüsünde bir bağlantı var ama menü KABUKTA yaşar; aktif
   * şirketi olmayan kullanıcı `RequireActiveCompany` tarafından tam bu
   * ekrana gönderilir ve kabuğu hiç görmez. Bağlantı yalnızca menüde
   * olsaydı daveti olan — ve çoğu zaman hiçbir şirkete üye olmayan —
   * kullanıcı gelen davetlerine ulaşamazdı.
   */
  it('gelen davetler bağlantısını sunar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () =>
          jsonResponse(200, { data: twoCompanies, meta: { active_company_id: null } }),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket seçin' });

    expect(screen.getByRole('link', { name: 'Gelen davetler' })).toHaveAttribute(
      'href',
      '/app/invitations/incoming',
    );
  });

  /** Sıfır şirket + geçiş kipi: eski şirket işaretli kalır (regresyon). */
  it('tek şirkette geçiş kipinde otomatik seçim yapmaz', async () => {
    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
      '/companies': () =>
        jsonResponse(200, {
          data: [fixtures.company({ id: 7 })],
          meta: { active_company_id: 7 },
        }),
    });

    vi.stubGlobal('fetch', fetchMock);

    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    // Geçiş kipinde liste boş değil ama tek şirket AKTİF: seçim yok.
    expect(screen.getByRole('button', { name: 'Seçili' })).toBeInTheDocument();
    // Otomatik seçim ucu hiç çağrılmaz.
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/select')),
    ).toBe(false);
  });

  // -------------------------------------------- gecikmiş yanıt sıralaması

  /**
   * REGRESYON — GECİKMİŞ DOĞRULAMA YANITI YENİ SEÇİMİ GERİYE ÇEVİRMEZ.
   *
   * SIRA — üç adım, hepsi gerçekten ulaşılabilir:
   *
   *   1. Kullanıcı Bengal'i seçer, istek BELİRSİZ bir hatayla döner (ağ)
   *      ve doğrulama da başarısız olur → "durum doğrulanamadı" durumu
   *      doğar. Ekran, listeyi ve "Durumu doğrula" düğmesini birlikte
   *      sunar (kullanıcı kilitlenmez).
   *   2. Kullanıcı "Durumu doğrula"ya basar: bu okuma ASKIDA kalır.
   *   3. O sırada Cevdet'i seçer ve bu seçim sunucuda ONAYLANIR. Ancak
   *      ondan SONRA (2)'nin yanıtı gelir ve hâlâ aktif şirketi 7 der.
   *
   * BEKLENEN: geç yanıt hiçbir şeyi geri almaz — aktif şirket Cevdet
   * (11) kalır. Bunu `companyListSeq` sağlar: onaylanmış bir seçim
   * sırayı ilerletir ve uçuştaki bayat okumayı geçersiz kılar.
   *
   * Düzeltmeden ÖNCE DÜŞER: geç `/companies` yanıtı aktif şirketi 7'ye
   * çevirir, üst bar "Kaplan Yazılım" gösterir.
   */
  it('gecikmiş doğrulama yanıtı tamamlanmış yeni seçimi geriye çevirmez', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });
    const cevdet = fixtures.company({ id: 11, name: 'Cevdet İnşaat', role: 'member' });

    const listed = [kaplan, bengal, cevdet];

    // (2)'nin yanıtı: test onu en sonda çözer.
    const stale: { resolve?: (response: Response) => void } = {};
    const staleList = new Promise<Response>((resolve) => {
      stale.resolve = resolve;
    });

    let listCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) {
          return jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) });
        }

        // (1) Bengal'in seçimi belirsiz: istek sunucuya ulaşmamış gibi.
        if (url.endsWith('/companies/9/select')) throw new TypeError('Failed to fetch');

        // (3) Cevdet'in seçimi sunucuda ONAYLANIR.
        if (url.endsWith('/companies/11/select')) return jsonResponse(200, { data: cevdet });

        if (url.includes('/companies')) {
          listCalls += 1;

          //   1 → açılış yüklemesi
          //   2 → (1)'in doğrulaması: BAŞARISIZ olur, verifyError doğar
          //   3 → "Durumu doğrula": askıda kalır (bayat: aktif 7)
          if (listCalls === 2) return jsonResponse(500, { message: 'Server Error' });
          if (listCalls === 3) return staleList;

          return jsonResponse(200, { data: listed, meta: { active_company_id: 7 } });
        }

        if (url.includes('/tasks/today')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/audit-logs')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/customers')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/members')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/payments')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/finance-entries')) return jsonResponse(200, fixtures.paginated([], 0));

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    // (1) Belirsiz seçim + başarısız doğrulama.
    await user.click(
      within(screen.getByText('Bengal Danışmanlık').closest('li')!).getByRole('button', {
        name: 'Seç',
      }),
    );

    const verifyButton = await screen.findByRole('button', { name: 'Durumu doğrula' });

    // (2) Doğrulama ASKIDA.
    fireEvent.click(verifyButton);
    await waitFor(() => expect(listCalls).toBe(3));

    // (3) Bu sırada yeni seçim tamamlanır.
    await user.click(
      within(screen.getByText('Cevdet İnşaat').closest('li')!).getByRole('button', { name: 'Seç' }),
    );

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();

    const topbar = document.querySelector('.ft-topbar__company') as HTMLElement;
    expect(within(topbar).getByText('Cevdet İnşaat')).toBeInTheDocument();

    // ŞİMDİ bayat yanıt gelir (aktif 7 diyor).
    await act(async () => {
      stale.resolve?.(jsonResponse(200, { data: listed, meta: { active_company_id: 7 } }));
      await Promise.resolve();
    });

    await waitFor(() => {
      const current = document.querySelector('.ft-topbar__company') as HTMLElement;
      expect(within(current).getByText('Cevdet İnşaat')).toBeInTheDocument();
      expect(within(current).queryByText('Kaplan Yazılım')).not.toBeInTheDocument();
    });
  });

  /**
   * REGRESYON — ÇIKIŞTAN SONRA DÖNEN GECİKMİŞ DOĞRULAMA YENİ OTURUMU
   * KİTLEMEZ.
   *
   * SIRA:
   *   1. Belirsiz seçim → doğrulama başlar ve ASKIDA kalır.
   *   2. Kullanıcı çıkış yapar (oturum kapanır, bayraklar temizlenir).
   *   3. Yeniden giriş yapar: `/companies` bu kez BAŞARIYLA okunur ve
   *      şirket durumu taze kurulur.
   *   4. ŞİMDİ (1)'in askıdaki doğrulaması HATAYLA döner (ör. token
   *      artık geçersiz → 401).
   *
   * BEKLENEN: geç hata yok sayılır. `verifyError` yeni oturuma yazılırsa
   * kabuk "aktif şirketiniz doğrulanamadı" ekranıyla kilitlenir ve
   * kullanıcı — doğrulanmış bir şirketi olmasına rağmen — hiçbir tenant
   * ekranını kullanamaz.
   *
   * Düzeltmeden ÖNCE DÜŞER: `companyListSeq` çıkışta artmadığı için
   * `reverify`in `catch`i bayat olmasına rağmen `verifyError`ı yazar.
   */
  it('çıkış sonrası dönen gecikmiş doğrulama hatası yeni oturumu kilitlemez', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    const stale: { reject?: (cause: unknown) => void } = {};
    const staleList = new Promise<Response>((_resolve, reject) => {
      stale.reject = reject;
    });

    let listCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) {
          return jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) });
        }

        if (url.endsWith('/auth/login')) {
          return jsonResponse(200, {
            data: { token: 'yeni-token', user: fixtures.user({ active_company_id: 7 }) },
          });
        }

        if (url.endsWith('/auth/logout')) {
          return new Response(null, { status: 204 });
        }

        // Seçim belirsiz: doğrulama başlatılır ve askıda kalır.
        if (url.endsWith('/companies/9/select')) throw new TypeError('Failed to fetch');

        if (url.includes('/companies')) {
          listCalls += 1;

          //  1 → açılış yüklemesi
          //  2 → belirsiz seçimin doğrulaması: ASKIDA (çıkıştan sonra
          //      hatayla döner)
          //  3 → yeniden girişten sonraki taze okuma: BAŞARILI
          if (listCalls === 2) return staleList;

          return jsonResponse(200, { data: [kaplan, bengal], meta: { active_company_id: 7 } });
        }

        if (url.includes('/tasks/today')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/audit-logs')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/customers')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/members')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/payments')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/finance-entries')) return jsonResponse(200, fixtures.paginated([], 0));

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    // (1) Belirsiz seçim → doğrulama askıda.
    await user.click(
      within(screen.getByText('Bengal Danışmanlık').closest('li')!).getByRole('button', {
        name: 'Seç',
      }),
    );

    await waitFor(() => expect(listCalls).toBe(2));

    // (2) Çıkış.
    await user.click(screen.getByRole('button', { name: 'Çıkış yap' }));
    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();

    /*
      (3) YENİ OTURUM BAŞLAMADAN askıdaki doğrulama hatayla döner.
      Oturum kapalıyken temizlenmiş olan bayrağı geri yazmaması gerekir:
      yazarsa, bir sonraki girişte `reload` şirketi BİZİM bildiğimiz
      (7) değil, sunucunun söylediği başka bir değer olarak okur —
      giriş başarılı olsa bile kabuk, doğrulanamayan eski kiracı
      ekranıyla kilitlenir.
    */
    await act(async () => {
      stale.reject?.(new TypeError('Failed to fetch'));
      await Promise.resolve();
    });

    // (4) Yeniden giriş: şirket durumu taze okunur ve panel AÇILIR.
    await user.type(screen.getByLabelText('E-posta'), 'ada@flowtiger.test');
    await user.type(screen.getByLabelText('Parola'), 'gizli-parola');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
    expect(screen.queryByTestId('company-verify-blocked')).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — ESKİ DOĞRULAMA YANITI, O SIRADA YAPILAN YENİ SEÇİMİ EZMEZ.
   *
   * SIRA: belirsiz seçim → doğrulama başarısız → kullanıcının başlattığı
   * doğrulama (çağrı 3) ASKIDA kalır. Kullanıcı "Şirket değiştir"e
   * basıp seçim ekranına geçer ve Bengal'i seçer (çağrı 4 onaylanır).
   * Ancak ONDAN SONRA çağrı 3'ün yanıtı gelir ve hâlâ aktif şirketi 7
   * der.
   *
   * `companyListSeq` olmadan bu yanıt aktif şirketi 7'ye geri çevirir:
   * kullanıcının yeni seçimi ("Bengal aktif") ekranda silinirdi.
   * Sıra kuralı, onaylanmış seçimin (çağrı 4) sırasını ilerlettiği için
   * çağrı 3'ü geçersiz kılar.
   */
  it('eski doğrulama yanıtı, o sırada yapılan yeni seçimi ezmez', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    const stale: { resolve?: (response: Response) => void } = {};
    const staleList = new Promise<Response>((resolve) => {
      stale.resolve = resolve;
    });

    let listCalls = 0;
    let selectCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) {
          return jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) });
        }

        if (url.endsWith('/companies/9/select')) {
          selectCalls += 1;

          // 1. deneme: istek sunucuya ulaşmamış gibi (belirsiz).
          // 2. deneme: sunucu ONAYLAR.
          if (selectCalls === 1) throw new TypeError('Failed to fetch');

          return jsonResponse(200, { data: bengal });
        }

        if (url.includes('/companies')) {
          listCalls += 1;

          /*
            SIRA:
              1. açılıştaki yükleme            → aktif 7
              2. belirsiz seçimin doğrulaması  → 500 (doğrulanamadı)
              3. kullanıcının "Durumu doğrula"sı → ASKIDA (bayat: aktif 7)
              4. yeni seçimin onayı            → aktif 9
          */
          if (listCalls === 2) return jsonResponse(500, { message: 'Server Error' });
          if (listCalls === 3) return staleList;

          return jsonResponse(200, {
            data: [kaplan, bengal],
            meta: { active_company_id: listCalls >= 4 ? 9 : 7 },
          });
        }

        if (url.includes('/tasks/today')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/audit-logs')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/customers')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/members')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/payments')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/finance-entries')) return jsonResponse(200, fixtures.paginated([], 0));

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    // Belirsiz seçim: doğrulama başarısız, liste doğrulama düğmesiyle
    // birlikte ayakta kalır.
    await user.click(
      within(screen.getByText('Bengal Danışmanlık').closest('li')!).getByRole('button', {
        name: 'Seç',
      }),
    );

    const verify = await screen.findByRole('button', { name: 'Durumu doğrula' });

    // Doğrulama ASKIDA kalır (çağrı 3).
    fireEvent.click(verify);
    await waitFor(() => expect(listCalls).toBe(3));

    // Kullanıcı bu sırada yeni seçimini yapar (çağrı 4, onaylanır).
    await user.click(
      within(screen.getByText('Bengal Danışmanlık').closest('li')!).getByRole('button', {
        name: 'Seç',
      }),
    );

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();

    const topbar = document.querySelector('.ft-topbar__company') as HTMLElement;
    expect(within(topbar).getByText('Bengal Danışmanlık')).toBeInTheDocument();

    // ŞİMDİ bayat yanıt gelir: aktif 7 diyor. Yeni seçimi ezmemelidir.
    await act(async () => {
      stale.resolve?.(
        jsonResponse(200, { data: [kaplan, bengal], meta: { active_company_id: 7 } }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      const current = document.querySelector('.ft-topbar__company') as HTMLElement;
      expect(within(current).getByText('Bengal Danışmanlık')).toBeInTheDocument();
      expect(within(current).queryByText('Kaplan Yazılım')).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------ oturumlar arası yarış

  /**
   * REGRESYON — ESKİ SEÇİMİN `finally`Sİ YENİ OTURUMU KİLİTLEMEZ.
   *
   * SIRA:
   *   1. Seçim isteği ASKIDA bırakılır.
   *   2. Kullanıcı çıkış yapar → `selectionEpoch` artar.
   *   3. Yeniden giriş yapar ve YENİ bir şirket seçimi yapar.
   *
   * KİLİTLENME: `select()`ın `finally`si yalnızca nesli güncel olan
   * girişimde bayrakları temizler. Çıkıştan sonra nesil arttığı için
   * ESKİ girişimin `finally`si hiçbir şey temizlemez — yani
   * `selectionInFlight` sonsuza dek `true` kalır ve yeni oturumdaki HER
   * seçim "Şirket seçimi zaten sürüyor." diye anında reddedilir:
   * kullanıcı yeniden giriş yaptığı hâlde şirket değiştiremez.
   *
   * Test, ikinci seçimin GERÇEKTEN istek attığını sayarak ölçer.
   */
  it('çıkış ve yeniden girişten sonra yeni seçim yapılabilir', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    // Eski oturumun seçim isteği: test onu en sonda çözer.
    const deferred: { resolve?: (response: Response) => void } = {};
    const pendingSelect = new Promise<Response>((resolve) => {
      deferred.resolve = resolve;
    });

    let selectCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) {
          return jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) });
        }

        if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 });

        if (url.endsWith('/auth/login')) {
          return jsonResponse(200, {
            data: { token: 'yeni-token', user: fixtures.user({ active_company_id: 7 }) },
          });
        }

        if (url.endsWith('/companies/9/select')) {
          selectCalls += 1;

          // 1: eski oturumun isteği — ASKIDA.
          // 2: yeni oturumun isteği — ONAYLANIR.
          if (selectCalls === 1) return pendingSelect;

          return jsonResponse(200, { data: bengal });
        }

        if (url.includes('/companies')) {
          return jsonResponse(200, { data: [kaplan, bengal], meta: { active_company_id: 7 } });
        }

        if (url.includes('/tasks/today')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/audit-logs')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/customers')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/members')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/payments')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/finance-entries')) return jsonResponse(200, fixtures.paginated([], 0));

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    // (1) Eski oturumda seçim askıda kalır.
    await user.click(
      within(screen.getByText('Bengal Danışmanlık').closest('li')!).getByRole('button', {
        name: 'Seç',
      }),
    );
    await waitFor(() => expect(selectCalls).toBe(1));

    // (2) Çıkış + yeniden giriş.
    await user.click(screen.getByRole('button', { name: 'Çıkış yap' }));
    await screen.findByRole('button', { name: 'Giriş yap' });

    await user.type(screen.getByLabelText('E-posta'), 'ada@flowtiger.test');
    await user.type(screen.getByLabelText('Parola'), 'gizli-parola');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    // (3) Yeni oturumda geçiş ekranına gidilir ve seçim YAPILIR.
    await user.click(await screen.findByRole('link', { name: 'Şirket değiştir' }));

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    await user.click(
      within(screen.getByText('Bengal Danışmanlık').closest('li')!).getByRole('button', {
        name: 'Seç',
      }),
    );

    // YENİ İSTEK GERÇEKTEN ATILMALI (düzeltmeden önce bu 1'de takılır).
    await waitFor(() => expect(selectCalls).toBe(2));

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();

    // (4) ŞİMDİ eski istek tamamlanır — yeni seçimi bozmamalı.
    await act(async () => {
      deferred.resolve?.(jsonResponse(200, { data: bengal }));
      await Promise.resolve();
    });

    await waitFor(() => {
      const topbar = document.querySelector('.ft-topbar__company') as HTMLElement;
      expect(within(topbar).getByText('Bengal Danışmanlık')).toBeInTheDocument();
    });
    // Kilidi geri de bırakmamalı: bir sonraki seçim de çalışmalı.
    expect(screen.queryByTestId('company-selection-pending')).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — ESKİ OTURUMUN SEÇİMİ, YENİ OTURUMDA DOĞRULAMA BAŞLATMAZ.
   *
   * SIRA:
   *   1. Seçim isteği ASKIDA bırakılır.
   *   2. Çıkış + yeniden giriş (yeni oturum kurulur, `/companies` taze
   *      okunur).
   *   3. ŞİMDİ eski istek AĞ HATASIYLA döner.
   *
   * SORUN: `select()`ın `catch`i `reverify()`i GÜNCELLİK KONTROLÜNDEN
   * ÖNCE çağırıyordu. Yani kapanmış bir oturumun isteği, açık olan yeni
   * oturumda yeni bir `/companies` doğrulaması başlatıyor ve
   * `verifyError`ı yazabiliyordu.
   *
   * Test iki şeyi ölçer: yeni doğrulama isteği ATILMAMALI ve yeni
   * oturum kilitlenmemeli.
   */
  it('çıkış sonrası ağ hatasıyla dönen eski seçim yeni oturumda doğrulama başlatmaz', async () => {
    const kaplan = fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' });
    const bengal = fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' });

    const stale: { reject?: (cause: unknown) => void } = {};
    const pendingSelect = new Promise<Response>((_resolve, reject) => {
      stale.reject = reject;
    });

    let selectCalls = 0;
    let listCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) {
          return jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) });
        }

        if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 });

        if (url.endsWith('/auth/login')) {
          return jsonResponse(200, {
            data: { token: 'yeni-token', user: fixtures.user({ active_company_id: 7 }) },
          });
        }

        if (url.endsWith('/companies/9/select')) {
          selectCalls += 1;
          // Tek istek: eski oturumunki, askıda kalır.
          return pendingSelect;
        }

        if (url.includes('/companies')) {
          listCalls += 1;
          return jsonResponse(200, { data: [kaplan, bengal], meta: { active_company_id: 7 } });
        }

        if (url.includes('/tasks/today')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/audit-logs')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/customers')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/members')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/payments')) return jsonResponse(200, fixtures.paginated([], 0));
        if (url.includes('/finance-entries')) return jsonResponse(200, fixtures.paginated([], 0));

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/company-select?switch=1', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Şirket değiştir' });

    // (1) Eski oturumun seçimi askıda.
    await user.click(
      within(screen.getByText('Bengal Danışmanlık').closest('li')!).getByRole('button', {
        name: 'Seç',
      }),
    );
    await waitFor(() => expect(selectCalls).toBe(1));

    // (2) Çıkış + yeniden giriş.
    await user.click(screen.getByRole('button', { name: 'Çıkış yap' }));
    await screen.findByRole('button', { name: 'Giriş yap' });

    await user.type(screen.getByLabelText('E-posta'), 'ada@flowtiger.test');
    await user.type(screen.getByLabelText('Parola'), 'gizli-parola');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    await screen.findByRole('heading', { name: 'Bugünün Odağı' });

    // Yeni oturumun kendi okuması burada durur.
    const listCallsAfterLogin = listCalls;

    // (3) Eski istek AĞ HATASIYLA döner.
    await act(async () => {
      stale.reject?.(new TypeError('Failed to fetch'));
      await Promise.resolve();
    });

    // Yeni doğrulama isteği ATILMAMALI.
    expect(listCalls).toBe(listCallsAfterLogin);

    // Ve yeni oturum sağlam kalır.
    expect(screen.getByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
    expect(screen.queryByTestId('company-verify-blocked')).not.toBeInTheDocument();
  });
});
