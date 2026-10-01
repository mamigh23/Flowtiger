import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * GELEN DAVETLER — kullanıcının KENDİSİNE gönderilen davetler.
 *
 * Bu ekranın varlık sebebi, aktif şirketi OLMAYAN kullanıcıdır: davetli
 * henüz hiçbir şirkete üye değildir, dolayısıyla şirket bağlamı
 * gerektiren hiçbir ekrana erişemez. Testlerin çoğu bu yüzden
 * `RequireActiveCompany`in devrede OLMADIĞINI da dolaylı olarak kilitler.
 *
 * İKİ AYRI SORU, İKİ AYRI EKRAN: burası "beni nereye davet ettiler",
 * Ekip → Davetler ise "şirketime kimi davet ettim". Bu dosyadaki hiçbir
 * test `/invitations` (owner listesi) ucuna dokunmaz.
 *
 * TOKEN HİÇBİR TESTTE GEÇMEZ — bu ekran token görmez; kabul davetin
 * kimliğiyle yapılır ve sahiplik sunucuda doğrulanır.
 */
describe('IncomingInvitationsPage', () => {
  const ROUTE = '/app/invitations/incoming';

  /** Backend IncomingInvitationResource ile birebir şekil. */
  const incoming = (overrides: Record<string, unknown> = {}) => ({
    id: 31,
    company: { id: 9, name: 'Bengal Danışmanlık' },
    role: 'member',
    status: 'pending',
    expires_at: '2026-09-30T10:00:00+00:00',
    created_at: '2026-09-23T10:00:00+00:00',
    ...overrides,
  });

  /** Şirketsiz ama doğrulanmış kullanıcı — bu ekranın asıl hedefi. */
  const routes = {
    '/me': () =>
      jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
    '/companies': () => jsonResponse(200, { data: [], meta: { active_company_id: null } }),
  };

  // ------------------------------------------------------- erişim ve dil

  /**
   * Şirketsiz kullanıcı davetlerini görebilmelidir.
   *
   * Rota `RequireActiveCompany` altında olsaydı kullanıcı seçim ekranına
   * atılır, daveti hiç göremezdi — akış tümden kilitlenirdi.
   */
  it('aktif şirketi olmayan kullanıcı davetlerini görebilir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/invitations/incoming': () =>
          jsonResponse(200, fixtures.paginated([incoming()], 1)),
      }),
    );

    renderApp(ROUTE, { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Gelen davetler' })).toBeInTheDocument();

    // Başlık istekten ÖNCE çizilir; satır için `findBy` ile beklenir.
    expect(await screen.findByText('Bengal Danışmanlık')).toBeInTheDocument();
  });

  /** Şirketsiz kullanıcıya seçim ekranına dönüş yolu sunulur. */
  it('şirketsiz kullanıcıya şirket seçimine dönüş bağlantısı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/invitations/incoming': () =>
          jsonResponse(200, fixtures.paginated([incoming()], 1)),
      }),
    );

    renderApp(ROUTE, { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Gelen davetler' });

    expect(screen.getByRole('link', { name: 'Şirket seçimine dön' })).toHaveAttribute(
      'href',
      '/app/company-select',
    );
  });

  /** Aktif şirketi OLAN kullanıcıya gereksiz bir adım gösterilmez. */
  it('aktif şirketi olan kullanıcıya dönüş bağlantısı göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
        '/companies': () =>
          jsonResponse(200, {
            data: [fixtures.company()],
            meta: { active_company_id: 7 },
          }),
        '/invitations/incoming': () =>
          jsonResponse(200, fixtures.paginated([incoming()], 1)),
      }),
    );

    renderApp(ROUTE, { token: 'gecerli-token' });

    /*
      ŞİRKET DURUMU DAHA YÜKLENMEDEN İDDİA ETME.

      Başlık istekten önce çizilir; o anda `activeCompanyId` henüz
      `null`dır ve bağlantı bir an görünür. Aktif şirketin gerçekten
      okunduğunu göstermek için VERİYİ bekleriz.
    */
    await screen.findByText('Bengal Danışmanlık');

    expect(
      screen.queryByRole('link', { name: 'Şirket seçimine dön' }),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------- liste

  it('satırda şirket adını, rolü ve son geçerlilik tarihini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/invitations/incoming': () =>
          jsonResponse(200, fixtures.paginated([incoming()], 1)),
      }),
    );

    renderApp(ROUTE, { token: 'gecerli-token' });

    const card = await screen.findByTestId('incoming-invitation-31');

    expect(within(card).getByText('Bengal Danışmanlık')).toBeInTheDocument();
    expect(within(card).getByText('Üye')).toBeInTheDocument();

    // Ham ISO GÖSTERİLMEZ.
    expect(within(card).getByText(/Son geçerlilik/)).toBeInTheDocument();
    expect(within(card).queryByText(/2026-09-30T/)).not.toBeInTheDocument();

    expect(within(card).getByRole('button', { name: 'Kabul et' })).toBeInTheDocument();
  });

  it('liste boşsa boş durum gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/invitations/incoming': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp(ROUTE, { token: 'gecerli-token' });

    expect(await screen.findByTestId('incoming-empty')).toBeInTheDocument();
  });

  it('liste hata verirse hata ve tekrar deneme sunar', async () => {
    const fetchMock = mockApi({
      ...routes,
      '/invitations/incoming': () => jsonResponse(500, { message: 'Server Error' }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp(ROUTE, { token: 'gecerli-token' });

    expect(await screen.findByRole('alert')).toBeInTheDocument();

    const before = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/invitations/incoming'),
    ).length;

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).includes('/invitations/incoming'))
          .length,
      ).toBeGreaterThan(before),
    );
  });

  it('birden fazla sayfa varsa sayfalama gösterir ve sonraki sayfayı yükler', async () => {
    const fetchMock = mockApi({
      ...routes,
      '/invitations/incoming': (_init?: RequestInit, url?: string) => {
        const source = url ?? '';
        const target = source.includes('page=2') ? 2 : 1;

        return jsonResponse(
          200,
          fixtures.paginated([incoming({ id: target * 10 })], 4, {
            currentPage: target,
            lastPage: 2,
          }),
        );
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp(ROUTE, { token: 'gecerli-token' });

    await screen.findByTestId('incoming-invitation-10');

    await user.click(screen.getByRole('button', { name: 'Sonraki' }));

    expect(await screen.findByTestId('incoming-invitation-20')).toBeInTheDocument();
  });

  // --------------------------------------------------------- doğrulama

  /**
   * DOĞRULANMAMIŞ HESAP — 403 `email_verification_required`.
   *
   * Sunucu bu kullanıcıya hiçbir davet verisi döndürmez; istemci de
   * göstermez. Ekran davet listesi yerine doğrulama akışını sunar.
   */
  it('doğrulanmamış kullanıcıya doğrulama akışı gösterir, davet bilgisi göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/invitations/incoming': () =>
          jsonResponse(403, {
            message: 'Doğrulama gerekli.',
            code: 'email_verification_required',
          }),
      }),
    );

    renderApp(ROUTE, { token: 'gecerli-token' });

    expect(
      await screen.findByRole('heading', { name: 'E-posta adresinizi doğrulayın' }),
    ).toBeInTheDocument();

    // Şirket/davet bilgisi HİÇ görünmez.
    expect(screen.queryByText('Bengal Danışmanlık')).not.toBeInTheDocument();
    expect(screen.queryByTestId('incoming-list')).not.toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Doğruladım, tekrar kontrol et' }),
    ).toBeInTheDocument();
  });

  it('doğrulama bağlantısını gönderir ve sonucu gösterir', async () => {
    const fetchMock = mockApi({
      ...routes,
      '/invitations/incoming': () =>
        jsonResponse(403, { message: 'Doğrulama gerekli.', code: 'email_verification_required' }),
      '/auth/email/verification-notification': () =>
        jsonResponse(200, { data: { message: 'Gönderildi.', code: 'verification_link_sent' } }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp(ROUTE, { token: 'gecerli-token' });

    await user.click(
      await screen.findByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Doğrulama bağlantısı e-posta adresinize gönderildi',
    );

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/auth/email/verification-notification'),
      ),
    ).toBe(true);
  });

  /**
   * "DOĞRULADIM, TEKRAR KONTROL ET" SUNUCUDAN YENİLER.
   *
   * Doğrulama mail istemcisinde tıklanırken değişir — bu sekmenin
   * belleğinde değil. Yerel bir bayrak açmak, kullanıcıya doğrulandığını
   * söyleyip listeyi hiç getirmemek olurdu.
   */
  it('tekrar kontrol et sunucudan durumu yeniler ve listeyi açar', async () => {
    let incomingCalls = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/invitations/incoming': () => {
          incomingCalls += 1;

          return incomingCalls === 1
            ? jsonResponse(403, {
                message: 'Doğrulama gerekli.',
                code: 'email_verification_required',
              })
            : jsonResponse(200, fixtures.paginated([incoming()], 1));
        },
      }),
    );

    const user = userEvent.setup();
    renderApp(ROUTE, { token: 'gecerli-token' });

    await user.click(
      await screen.findByRole('button', { name: 'Doğruladım, tekrar kontrol et' }),
    );

    // Liste geldi VE doğrulama dalı kapandı.
    expect(await screen.findByTestId('incoming-invitation-31')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'E-posta adresinizi doğrulayın' }),
    ).not.toBeInTheDocument();
  });

  // ------------------------------------------------------------- kabul

  it('kabul başarılı olduğunda sonucu gösterir ve listeyi yeniler', async () => {
    let listCalls = 0;

    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
      '/companies': () =>
        jsonResponse(200, {
          data: [fixtures.company({ id: 9, name: 'Bengal Danışmanlık' })],
          meta: { active_company_id: null },
        }),
      '/invitations/31/accept': () => jsonResponse(200, { data: incoming({ status: 'accepted' }) }),
      '/invitations/incoming': () => {
        listCalls += 1;

        return listCalls === 1
          ? jsonResponse(200, fixtures.paginated([incoming()], 1))
          : jsonResponse(200, fixtures.paginated([], 0));
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp(ROUTE, { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Kabul et' }));

    expect(await screen.findByTestId('incoming-accepted')).toBeInTheDocument();

    // Liste YENİDEN okundu.
    expect(listCalls).toBeGreaterThan(1);
  });

  /** Çift tıklama TEK istek üretir. */
  it('kabul sürerken ikinci tıklama istek üretmez', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};
    const pending = new Promise<Response>((resolve) => {
      deferred.resolve = resolve;
    });

    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
      '/companies': () =>
        jsonResponse(200, {
          data: [fixtures.company({ id: 9, name: 'Bengal Danışmanlık' })],
          meta: { active_company_id: null },
        }),
      '/invitations/31/accept': () => pending,
      '/invitations/incoming': () => jsonResponse(200, fixtures.paginated([incoming()], 1)),
    });

    vi.stubGlobal('fetch', fetchMock);

    renderApp(ROUTE, { token: 'gecerli-token' });

    const button = await screen.findByRole('button', { name: 'Kabul et' });

    fireEvent.click(button);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/invitations/31/accept')),
      ).toHaveLength(1),
    );

    fireEvent.click(screen.getByRole('button', { name: /Kabul et/ }));

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/invitations/31/accept')),
    ).toHaveLength(1);

    deferred.resolve?.(jsonResponse(200, { data: incoming({ status: 'accepted' }) }));
  });

  /**
   * ŞİRKET LİSTESİ TAZELENEMESE BİLE KABUL BAŞARILIDIR.
   *
   * Bu iki şeyi kanıtlar: (1) hata kabul başarısızmış gibi gösterilmez,
   * (2) kabul isteği TEKRARLANMAZ.
   */
  it('şirket listesi tazelenemezse kabul başarısız sayılmaz ve istek tekrarlanmaz', async () => {
    let companyCalls = 0;

    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
      '/companies': () => {
        companyCalls += 1;

        // İlk yükleme başarılı; kabulden SONRAKİ tazeleme başarısız.
        return companyCalls <= 1
          ? jsonResponse(200, { data: [], meta: { active_company_id: null } })
          : jsonResponse(500, { message: 'Server Error' });
      },
      '/invitations/31/accept': () => jsonResponse(200, { data: incoming({ status: 'accepted' }) }),
      '/invitations/incoming': () => jsonResponse(200, fixtures.paginated([incoming()], 1)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp(ROUTE, { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Kabul et' }));

    // Kabul BAŞARILI gösterilir.
    expect(await screen.findByTestId('incoming-accepted')).toBeInTheDocument();

    // Tazeleme hatası AYRI bildirilir.
    expect(await screen.findByTestId('incoming-company-refresh-failed')).toBeInTheDocument();

    // Kabul isteği TEK.
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/invitations/31/accept')),
    ).toHaveLength(1);
  });

  // ------------------------------------------------ kullanılamaz davet

  it('410 durumunda davetin artık kullanılamadığını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () => jsonResponse(200, { data: [], meta: { active_company_id: null } }),
        '/invitations/31/accept': () =>
          jsonResponse(410, { message: 'Davet artık kullanılamaz.', code: 'invitation_expired' }),
        '/invitations/incoming': () => jsonResponse(200, fixtures.paginated([incoming()], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp(ROUTE, { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Kabul et' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu davetin süresi dolmuş.');
  });

  it('404 durumunda davetin artık kullanılamadığını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () => jsonResponse(200, { data: [], meta: { active_company_id: null } }),
        '/invitations/31/accept': () =>
          jsonResponse(404, { message: 'Davet bulunamadı.', code: 'invitation_not_found' }),
        '/invitations/incoming': () => jsonResponse(200, fixtures.paginated([incoming()], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp(ROUTE, { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Kabul et' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bu davet artık kullanılamıyor.',
    );
  });

  it('zaten üyelik durumunu bildirir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () => jsonResponse(200, { data: [], meta: { active_company_id: null } }),
        '/invitations/31/accept': () =>
          jsonResponse(422, {
            message: 'Bu kullanıcı zaten şirketin üyesi.',
            code: 'invitation_already_member',
          }),
        '/invitations/incoming': () => jsonResponse(200, fixtures.paginated([incoming()], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp(ROUTE, { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Kabul et' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bu kullanıcı zaten şirketin üyesi.',
    );
  });

  // -------------------------------------------- şirket bağlamı güvenliği

  /**
   * REGRESYON — İLK DAVETİ KABUL ETMEK SESSİZ ŞİRKET GEÇİŞİ BAŞLATMAZ.
   *
   * `CompanyContext` tek şirketli kullanıcıyı OTOMATİK seçer; bu giriş anı
   * için doğrudur. Ama hiç şirketi olmayan bir kullanıcının ilk davetini
   * kabul edip listeyi yenilemesi bu davranışı tetiklerse, kullanıcı
   * "kabul ettim" derken kendini sessizce o şirkette bulurdu — üstelik
   * burada TEK şirket olduğu için her seferinde.
   *
   * Kabul edilen şirket LİSTEDE görünür ama SEÇİLMEZ; geçiş açık bir
   * kullanıcı kararıdır ("Şirkete geç").
   */
  /**
   * Şirketsiz kullanıcı + HENÜZ üye olmadığı bir şirket.
   *
   * `/companies` kabulden ÖNCE boş döner (kullanıcı hiçbir şirketin üyesi
   * değildir), kabulden SONRA o şirketi içerir. Gerçekçi olmayan bir mock
   * — şirketi baştan döndürmek — testi yanlış sebeple geçirirdi: tek
   * şirketli otomatik seçim zaten haklı olarak devreye girerdi.
   */
  function onlyAfterAcceptRoutes() {
    let accepted = false;

    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
      '/companies': () =>
        jsonResponse(200, {
          data: accepted
            ? [fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' })]
            : [],
          meta: { active_company_id: null },
        }),
      '/companies/9/select': () =>
        jsonResponse(200, { data: fixtures.company({ id: 9, name: 'Bengal Danışmanlık' }) }),
      '/invitations/31/accept': () => {
        accepted = true;
        return jsonResponse(200, { data: incoming({ status: 'accepted' }) });
      },
      '/invitations/incoming': () => jsonResponse(200, fixtures.paginated([incoming()], 1)),
    });

    return fetchMock;
  }

  it('şirketsiz kullanıcının ilk kabulü sessiz şirket geçişi başlatmaz', async () => {
    const fetchMock = onlyAfterAcceptRoutes();

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp(ROUTE, { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Kabul et' }));

    await screen.findByTestId('incoming-accepted');

    // Hiçbir otomatik seçim isteği ATILMADI — kabul, geçiş demek değil.
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/companies/9/select')),
    ).toHaveLength(0);

    // Ama geçiş yolu AÇIKÇA sunuluyor.
    expect(await screen.findByRole('button', { name: 'Şirkete geç' })).toBeInTheDocument();
  });

  /** "Şirkete geç" yalnızca kullanıcı tıkladığında mevcut akışı çağırır. */
  it('şirkete geç yalnızca açık tıklamayla seçim yapar', async () => {
    const fetchMock = onlyAfterAcceptRoutes();

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp(ROUTE, { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Kabul et' }));

    // Kabulden SONRA, tıklamadan ÖNCE: hâlâ seçim yok.
    await screen.findByRole('button', { name: 'Şirkete geç' });
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/companies/9/select')),
    ).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Şirkete geç' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).includes('/companies/9/select')),
      ).toHaveLength(1),
    );
  });

  /** Kabulün kendisi aktif şirketi değiştirmez. */
  it('kabul aktif şirketi değiştirmez', async () => {
    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
      '/companies': () =>
        jsonResponse(200, {
          data: [
            fixtures.company({ id: 7, name: 'Kaplan Yazılım', role: 'owner' }),
            fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' }),
          ],
          meta: { active_company_id: 7 },
        }),
      '/invitations/31/accept': () => jsonResponse(200, { data: incoming({ status: 'accepted' }) }),
      '/invitations/incoming': () => jsonResponse(200, fixtures.paginated([incoming()], 1)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp(ROUTE, { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Kabul et' }));

    await screen.findByTestId('incoming-accepted');

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/select')),
    ).toHaveLength(0);
  });

  it('ekip içinden davet kabulü sonrası onay ve şirkete geç düğmesi korunur', async () => {
    let accepted = false;
    let companyReads = 0;
    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user() }),
      '/companies': () => {
        companyReads++;
        return jsonResponse(200, {
          data: [fixtures.company(), ...(accepted ? [fixtures.company({ id: 9, name: 'Bengal Danışmanlık', role: 'member' })] : [])],
          meta: { active_company_id: 7 },
        });
      },
      '/invitations/incoming': () => jsonResponse(200, fixtures.paginated(accepted ? [] : [incoming()], accepted ? 0 : 1)),
      '/invitations/31/accept': () => {
        accepted = true;
        return jsonResponse(200, { data: incoming({ status: 'accepted' }) });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/app/team/invitations?view=incoming', { token: 'gecerli-token' });
    expect(await screen.findByRole('heading', { name: 'Ekip' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Kabul et' }));
    await waitFor(() => expect(companyReads).toBe(2));
    expect(await screen.findByTestId('incoming-accepted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Şirkete geç' })).toBeInTheDocument();
    expect(screen.queryByTestId('team-role-breakdown')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/select'))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/invitations?'))).toBe(false);
  });
  // ------------------------------------------------ oturum değişimi

  /**
   * REGRESYON — ÇIKIŞTAN SONRA GECİKMİŞ YANIT YENİ KULLANICIYA TAŞINMAZ.
   *
   * Davetler kişiye özeldir. Kullanıcı çıktıktan sonra dönen bir liste
   * yanıtı ekranda belirmemelidir: o veri artık başka bir oturuma aittir.
   */
  it('çıkıştan sonra dönen gecikmiş liste yanıtı gösterilmez', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};
    const pending = new Promise<Response>((resolve) => {
      deferred.resolve = resolve;
    });

    let listCalls = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () => jsonResponse(200, { data: [], meta: { active_company_id: null } }),
        '/invitations/incoming': () => {
          listCalls += 1;

          return listCalls === 1 ? pending : jsonResponse(200, fixtures.paginated([], 0));
        },
      }),
    );

    renderApp(ROUTE, { token: 'gecerli-token' });

    await waitFor(() => expect(listCalls).toBe(1));

    // Oturum düşer (401 sonrası ApiClient'ın yaptığı şey).
    act(() => tokenStorage.clear());

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();

    // ŞİMDİ eski isteğin yanıtı gelir.
    await act(async () => {
      deferred.resolve?.(jsonResponse(200, fixtures.paginated([incoming()], 1)));
      await Promise.resolve();
    });

    expect(screen.queryByText('Bengal Danışmanlık')).not.toBeInTheDocument();
  });
});
