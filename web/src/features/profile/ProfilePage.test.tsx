import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Profil — kullanıcının KENDİ hesabı.
 *
 * BACKEND SÖZLEŞMESİ:
 *   GET /profile → UserResource
 *   PUT /profile → UserResource   gövde: { name, email }
 *
 * PATCH YOK. Gövde TAM OLARAK iki alan taşır.
 *
 * BU UÇ OWNER-ONLY DEĞİLDİR ve hiçbir rol kontrolü içermez. Kullanıcı
 * kendi kaydını düzenliyor; yetkilendirilecek bir "başkası" kavramı hiç
 * oluşmuyor. Bu yüzden burada 403 senaryosu YOKTUR — olmayan bir duruma
 * test yazmak, bir gün yanlış yerde gösterilecek bir arayüz yazmaktır.
 *
 * `company.context` de yok: hesap yönetimi hiçbir şirkete üye olmayı
 * gerektirmez.
 *
 * GÖVDEYE KONSA BİLE ETKİSİ OLMAYAN ALANLAR (ProfileUpdateRequest):
 *   user_id, role, active_company_id, company_id, password
 * Backend bunlar için `prohibited` kuralı YAZMAMIŞTIR — 422 dönmek
 * "hangi alan adları tanınıyor" bilgisini sızdırırdı. Yani arayüzün
 * onları göndermemesi bir nezaket değil, sözleşmenin kendisidir.
 *
 * KRİTİK YAN ETKİ: e-posta DEĞİŞİRSE `email_verified_at` null'a düşer.
 * Aynı adres yeniden gönderilirse doğrulama bozulmaz.
 */
describe('ProfilePage', () => {
  const session = {
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

  // ------------------------------------------------------------ yükleme

  it('profil bilgilerini forma doldurur', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile': () => jsonResponse(200, { data: fixtures.user() }),
      }),
    );

    renderApp('/app/profile', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Ad')).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText('E-posta')).toHaveValue('ada@flowtiger.test');
  });

  /**
   * REGRESYON — VERİ /profile'DAN GELİR.
   *
   * /me ile /profile aynı gövdeyi döndürür ama aynı şey değildir: /me
   * kimlik sorgusu, /profile profil kaynağının kökü. Ekran kendi
   * kaynağını okumazsa, oturum açıldıktan sonra başka bir cihazdan
   * yapılmış bir değişiklik hiç görünmez.
   */
  it('formu /profile ucundan doldurur, oturumdaki kullanıcıdan değil', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/me': () => jsonResponse(200, { data: fixtures.user({ name: 'Bayat Ada' }) }),
        '/profile': () => jsonResponse(200, { data: fixtures.user({ name: 'Güncel Ada' }) }),
      }),
    );

    renderApp('/app/profile', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Ad')).toHaveValue('Güncel Ada');
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
        if (url.endsWith('/profile')) {
          return new Promise<Response>((resolve) => {
            deferred.resolve = resolve;
          });
        }

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    renderApp('/app/profile', { token: 'gecerli-token' });

    expect(await screen.findByTestId('profile-loading')).toBeInTheDocument();

    deferred.resolve?.(jsonResponse(200, { data: fixtures.user() }));

    expect(await screen.findByLabelText('Ad')).toHaveValue('Ada Lovelace');
    expect(screen.queryByTestId('profile-loading')).not.toBeInTheDocument();
  });

  // ----------------------------------------------------------- kaydetme

  /**
   * REGRESYON — GÖVDE TAM OLARAK { name, email }.
   *
   * `role` gönderilseydi Faz 4'ün rol değiştirme yetkisi atlatılmaya
   * çalışılmış olurdu; `active_company_id` gönderilseydi tenant seçimi
   * istemciye taşınırdı (playbook §3.1). İkisi de backend'de sessizce
   * yok sayılır — ama arayüzün onları hiç göndermemesi, sözleşmenin
   * istemci tarafındaki karşılığıdır.
   */
  it('yalnızca ad ve e-posta gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/profile': (init) =>
        init?.method === 'PUT'
          ? jsonResponse(200, { data: fixtures.user({ name: 'Ada L. Byron' }) })
          : jsonResponse(200, { data: fixtures.user() }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/profile', { token: 'gecerli-token' });

    const name = await screen.findByLabelText('Ad');
    await user.clear(name);
    await user.type(name, 'Ada L. Byron');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    const body = bodyOf(putCall?.[1]) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(['email', 'name']);
    expect(body).toEqual({ name: 'Ada L. Byron', email: 'ada@flowtiger.test' });
  });

  it('kaydedince başarı bildirimi gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(200, { data: fixtures.user({ name: 'Ada L. Byron' }) })
            : jsonResponse(200, { data: fixtures.user() }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Profil bilgileriniz güncellendi.')).toBeInTheDocument();
  });

  /**
   * Kabuğun üst çubuğu oturumdaki kullanıcıyı gösterir. Profil
   * kaydedildikten sonra orada eski ad kalırsa, kullanıcı değişikliğin
   * uygulanmadığını sanır.
   */
  it('kaydedince oturumdaki kullanıcıyı tazeler', async () => {
    let saved = false;

    const fetchMock = mockApi({
      ...session,
      '/me': () =>
        jsonResponse(200, {
          data: fixtures.user({ name: saved ? 'Ada L. Byron' : 'Ada Lovelace' }),
        }),
      '/profile': (init) => {
        if (init?.method !== 'PUT') return jsonResponse(200, { data: fixtures.user() });
        saved = true;
        return jsonResponse(200, { data: fixtures.user({ name: 'Ada L. Byron' }) });
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/profile', { token: 'gecerli-token' });

    const name = await screen.findByLabelText('Ad');
    await user.clear(name);
    await user.type(name, 'Ada L. Byron');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    // Kabuğun hesap düğmesi doğrudan sorgulanır: sayfanın adı bir metin
    // düğümü olarak gösterip göstermediğinden bağımsız bir iddia.
    const trigger = await screen.findByRole('button', { name: 'Hesap menüsü' });
    await waitFor(() => expect(trigger).toHaveTextContent('Ada L. Byron'));

    const meCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/me'));
    expect(meCalls.length).toBeGreaterThan(1);
  });

  /**
   * PUT yanıtı askıda tutulur: çift gönderim ancak istek sürerken
   * denenebilir. Anında çözülen bir yanıtta bu pencere hiç oluşmaz.
   */
  it('gönderim sürerken düğmeyi kapatır', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/me')) return jsonResponse(200, { data: fixtures.user() });
        if (url.includes('/companies')) {
          return jsonResponse(200, {
            data: [fixtures.company()],
            meta: { active_company_id: 7 },
          });
        }
        if (url.endsWith('/profile')) {
          if (init?.method !== 'PUT') return jsonResponse(200, { data: fixtures.user() });

          return new Promise<Response>((resolve) => {
            deferred.resolve = resolve;
          });
        }

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled());

    deferred.resolve?.(jsonResponse(200, { data: fixtures.user() }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled());
  });

  // ---------------------------------------------------------- doğrulama

  it('422 alan hatalarını alan altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'Gönderilen bilgiler geçersiz.',
                errors: {
                  name: ['Ad alanı zorunludur.'],
                  email: ['Geçerli bir e-posta adresi girin.'],
                },
              })
            : jsonResponse(200, { data: fixtures.user() }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Ad alanı zorunludur.')).toBeInTheDocument();
    expect(screen.getByText('Geçerli bir e-posta adresi girin.')).toBeInTheDocument();
  });

  /**
   * Başkasında kayıtlı adres backend'de `unique` kuralına takılır ve
   * normal bir alan hatası olarak döner. Arayüz özel bir metin
   * uydurmaz — backend'inkini gösterir.
   */
  it('başkasında kayıtlı e-posta hatasını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'Gönderilen bilgiler geçersiz.',
                errors: { email: ['Bu e-posta zaten kullanılıyor.'] },
              })
            : jsonResponse(200, { data: fixtures.user() }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Bu e-posta zaten kullanılıyor.')).toBeInTheDocument();
  });

  /**
   * Backend adresi küçük harfe çevirir; arayüz baştaki/sondaki boşluğu
   * temizler. İkisi birbirinin yerine geçmez: boşluklu bir adres
   * `email` kuralına takılır ve kullanıcı sebebini anlamaz.
   */
  it('e-postanın baştaki ve sondaki boşluklarını temizleyerek gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/profile': (init) =>
        init?.method === 'PUT'
          ? jsonResponse(200, { data: fixtures.user({ email: 'yeni@flowtiger.test' }) })
          : jsonResponse(200, { data: fixtures.user() }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/profile', { token: 'gecerli-token' });

    const email = await screen.findByLabelText('E-posta');
    await user.clear(email);
    await user.type(email, '  Yeni@FlowTiger.test  ');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    const body = bodyOf(putCall?.[1]) as { email: string };

    expect(body.email).toBe('Yeni@FlowTiger.test');
  });

  /** Normalizasyonun sahibi backend; arayüz dönen değeri yansıtır. */
  it('backendin normalize ettiği adresi forma yansıtır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(200, { data: fixtures.user({ email: 'yeni@flowtiger.test' }) })
            : jsonResponse(200, { data: fixtures.user() }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    const email = await screen.findByLabelText('E-posta');
    await user.clear(email);
    await user.type(email, 'Yeni@FlowTiger.test');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(screen.getByLabelText('E-posta')).toHaveValue('yeni@flowtiger.test'),
    );
  });

  // ------------------------------------------------- doğrulama durumu

  /**
   * E-posta değişirse backend `email_verified_at`'i null'a çeker.
   * Arayüz bunu PUT yanıtından okur; ek bir istek atmaz.
   */
  it('e-posta değişince doğrulama durumu beklemeye döner', async () => {
    const unverified = fixtures.user({
      email: 'yeni@flowtiger.test',
      email_verified_at: null,
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(200, { data: unverified })
            : jsonResponse(200, { data: fixtures.user() }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    const email = await screen.findByLabelText('E-posta');
    expect(await screen.findByTestId('verification-status')).toHaveTextContent('Doğrulandı');

    await user.clear(email);
    await user.type(email, 'yeni@flowtiger.test');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(screen.getByTestId('verification-status')).toHaveTextContent('Doğrulama bekliyor'),
    );
  });

  it('aynı e-posta gönderilince doğrulama durumu korunur', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(200, { data: fixtures.user({ name: 'Ada L. Byron' }) })
            : jsonResponse(200, { data: fixtures.user() }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    const name = await screen.findByLabelText('Ad');
    await user.clear(name);
    await user.type(name, 'Ada L. Byron');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await screen.findByText('Profil bilgileriniz güncellendi.');
    expect(screen.getByTestId('verification-status')).toHaveTextContent('Doğrulandı');
  });

  // ------------------------------------------------------------ sınırlar

  /**
   * REGRESYON — active_company_id OKUNUR, GÖNDERİLMEZ.
   *
   * Alan yanıtta vardır ve salt okunurdur. Aktif şirket yalnızca
   * POST /companies/{id}/select ile değişir (playbook §3.1).
   */
  it('active_company_id alanını gövdeye koymaz', async () => {
    const fetchMock = mockApi({
      ...session,
      '/profile': (init) =>
        init?.method === 'PUT'
          ? jsonResponse(200, { data: fixtures.user() })
          : jsonResponse(200, { data: fixtures.user({ active_company_id: 7 }) }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/profile', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    const body = bodyOf(putCall?.[1]) as Record<string, unknown>;

    expect(body).not.toHaveProperty('active_company_id');
    expect(body).not.toHaveProperty('company_id');
    expect(body).not.toHaveProperty('user_id');
    expect(body).not.toHaveProperty('role');
    expect(body).not.toHaveProperty('password');
  });

  /**
   * REGRESYON: profil formunda rol ya da şirket alanı YOKTUR.
   *
   * Rol değişimi ayrı bir uçtur ve owner'a aittir; kullanıcı kendi
   * rolünü kendi değiştiremez. Aktif şirket de yalnızca
   * POST /companies/{id}/select ile değişir.
   *
   * İddia `profile-form` ile SINIRLANDI: parola alanları aynı sayfada
   * ama AYRI bir kartta ve ayrı bir uca gider; onların varlığı bu
   * formun sözleşmesini bozmaz.
   */
  it('profil formunda rol, şirket ya da parola alanı bulunmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile': () => jsonResponse(200, { data: fixtures.user() }),
      }),
    );

    renderApp('/app/profile', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');
    const form = screen.getByTestId('profile-form');

    expect(within(form).queryByLabelText('Rol')).not.toBeInTheDocument();
    expect(within(form).queryByLabelText('Şirket')).not.toBeInTheDocument();
    expect(within(form).queryByRole('combobox')).not.toBeInTheDocument();

    // Form yalnızca iki alan taşır.
    expect(within(form).getAllByRole('textbox')).toHaveLength(2);
  });

  /**
   * İSTEMCİDE ROL KAPISI YOK — ve burada rol zaten hiç sorulmaz: bu uç
   * owner-only değildir. Member rolündeki kullanıcı da kendi profilini
   * düzenler.
   */
  it('rol member olsa bile profil düzenlenebilir', async () => {
    const fetchMock = mockApi({
      ...memberSession,
      '/profile': (init) =>
        init?.method === 'PUT'
          ? jsonResponse(200, { data: fixtures.user({ name: 'Ada L. Byron' }) })
          : jsonResponse(200, { data: fixtures.user() }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/profile', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Profil bilgileriniz güncellendi.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true);
  });

  // -------------------------------------------------------------- hata

  it('sunucu hatasında ham metni göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile': () => jsonResponse(500, { message: 'Server Error' }),
      }),
    );

    renderApp('/app/profile', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    expect(alert.textContent).not.toContain('Server Error');
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app/profile', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });
});
