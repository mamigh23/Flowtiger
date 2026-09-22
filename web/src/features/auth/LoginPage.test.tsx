import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';
import { FLOWTIGER_LOGO_SRC } from '@/features/brand/FlowTigerMark';

/**
 * Giriş ekranı — ilk gerçek ürün ekranı.
 *
 * Kanıtlanması gerekenler: doğru istek gidiyor mu, token saklanıyor mu,
 * hata durumları kullanıcıya doğru anlatılıyor mu ve parola arayüzde
 * kalıyor mu.
 */
describe('LoginPage', () => {
  async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('E-posta'), 'ada@flowtiger.test');
    await user.type(screen.getByLabelText('Parola'), 'gizli-parola');
  }

  it('giriş formunu gösterir', async () => {
    vi.stubGlobal('fetch', mockApi({}));

    renderApp('/login');

    expect(await screen.findByLabelText('E-posta')).toBeInTheDocument();
    expect(screen.getByLabelText('Parola')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giriş yap' })).toBeEnabled();
  });

  /**
   * REGRESYON — GİRİŞ EKRANINDA GERÇEK LOGO.
   *
   * Marka üç ekranda (perde, kenar çubuğu, giriş) AYNI bileşenden gelir.
   * Eski "FT" yer tutucusu kaldırıldı; ikisinin bir arada bulunması iki
   * farklı markanın yan yana durması olurdu.
   */
  it('formun üstünde gerçek FlowTiger logosunu gösterir', async () => {
    vi.stubGlobal('fetch', mockApi({}));

    renderApp('/login');

    await screen.findByLabelText('E-posta');

    const mark = screen.getByTestId('flowtiger-mark');

    expect(mark.tagName).toBe('IMG');
    expect(mark).toHaveAttribute('src', FLOWTIGER_LOGO_SRC);
    expect(screen.queryByText('FT')).not.toBeInTheDocument();
  });

  it('parola alanı varsayılan olarak gizli, düğmeyle görünür olur', async () => {
    vi.stubGlobal('fetch', mockApi({}));
    const user = userEvent.setup();

    renderApp('/login');

    const password = await screen.findByLabelText('Parola');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Parolayı göster' }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Parolayı gizle' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('başarılı girişte token saklar ve şirket bağlamına geçer', async () => {
    const fetchMock = mockApi({
      '/auth/login': () =>
        jsonResponse(200, { data: { token: 'yeni-token', user: fixtures.user() } }),
      '/companies': () =>
        jsonResponse(200, {
          data: [fixtures.company()],
          meta: { active_company_id: 7 },
        }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    await waitFor(() => expect(tokenStorage.get()).toBe('yeni-token'));

    // Gönderilen gövde backend sözleşmesine uymalı.
    const loginCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/login'));
    expect(JSON.parse(String((loginCall?.[1] as RequestInit).body))).toEqual({
      email: 'ada@flowtiger.test',
      password: 'gizli-parola',
    });
  });

  it('gönderim sonrası parolayı arayüzde bırakmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/login': () => jsonResponse(401, { message: 'Kimlik bilgileri hatalı.' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    await screen.findByRole('alert');

    // Parola bellekte/DOM'da asılı kalmamalı.
    expect(screen.getByLabelText('Parola')).toHaveValue('');
    expect(screen.getByLabelText('E-posta')).toHaveValue('ada@flowtiger.test');
  });

  it('401 durumunda kullanıcı dostu mesaj gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/login': () =>
          jsonResponse(401, { message: 'Kimlik bilgileri hatalı.', code: 'invalid_credentials' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Kimlik bilgileri hatalı.');
    expect(tokenStorage.get()).toBeNull();
  });

  it('422 doğrulama hatalarını alan altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/login': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { email: ['E-posta alanı zorunludur.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(await screen.findByText('E-posta alanı zorunludur.')).toBeInTheDocument();
  });

  /**
   * P1-06 — form doğrulama erişilebilirliği.
   *
   * Dört şey birlikte kanıtlanır: geçersiz alan `aria-invalid="true"`
   * taşır, `aria-describedby` gerçek hata elemanının id'sine işaret eder,
   * o hata elemanı `role="alert"` taşır (ekran okuyucu duyurusu için) ve
   * başarısız gönderimden sonra odak DOM'daki ilk geçersiz alana taşınır.
   */
  it('422 doğrulama hatasında alanı aria ile işaretler ve odağı ona taşır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/login': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { email: ['E-posta alanı zorunludur.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    const emailInput = await screen.findByLabelText('E-posta');
    const errorMessage = await screen.findByText('E-posta alanı zorunludur.');

    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby', errorMessage.id);
    expect(errorMessage).toHaveAttribute('role', 'alert');

    await waitFor(() => expect(emailInput).toHaveFocus());
  });

  it('429 durumunda bekleme süresini söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/login': () =>
          jsonResponse(429, { message: 'Çok fazla deneme.' }, { 'Retry-After': '60' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('60 saniye');
  });

  it('ağ hatasında sunucu ayrıntısı sızdırmaz', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const user = userEvent.setup();
    renderApp('/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sunucuya ulaşılamadı.');
    expect(alert.textContent).not.toContain('fetch');
  });

  /**
   * Login ↔ Register geçişi (P0-03). Diğer yön —
   * RegisterPage.test.tsx'teki "Giriş yapın" testi.
   */
  it('"Kayıt olun" bağlantısı /register\'a götürür', async () => {
    vi.stubGlobal('fetch', mockApi({}));
    const user = userEvent.setup();

    renderApp('/login');

    await screen.findByLabelText('E-posta');
    await user.click(screen.getByRole('link', { name: 'Kayıt olun' }));

    expect(await screen.findByRole('button', { name: 'Kayıt ol' })).toBeInTheDocument();
  });

  /**
   * Çift gönderim koruması: yavaş bir ağda düğmeye iki kez basmak iki
   * login isteği üretmemeli — backend'in oran sınırını boşa harcar.
   */
  it('istek sürerken ikinci gönderimi engeller', async () => {
    // Nesne içinde tutulur: doğrudan bir değişkene atansaydı TypeScript
    // akış analizi onu hiç atanmamış sayıp 'never'a daraltırdı.
    const deferred: { resolve?: (response: Response) => void } = {};

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/login');

    await fillCredentials(user);

    const submit = screen.getByRole('button', { name: 'Giriş yap' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    deferred.resolve?.(jsonResponse(401, { message: 'Kimlik bilgileri hatalı.' }));
  });

  // ---------------------------------------- oturumun kendiliğinden düşmesi

  const sessionRoutes = {
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
    '/tasks/today': () => jsonResponse(200, fixtures.paginated([], 0)),
    '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
  };

  /**
   * REGRESYON — 401 SESSİZ DEĞİL.
   *
   * Oturumu düşen kullanıcı, çalıştığı ekranın ortasından giriş formuna
   * atılıyor ve NEDEN atıldığını hiçbir yerde göremiyordu (gerçek
   * tarayıcıda doğrulandı: ekranda "oturum" geçen tek kelime yoktu).
   * Mesajın kendisi kodda zaten vardı ama hiçbir yere ulaşmıyordu.
   */
  it('oturum kendiliğinden düştüğünde sebebini söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        // Açılışta kimlik sorgusu 401 döner: token sunucuda geçersiz.
        '/me': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app', { token: 'artik-gecersiz-token' });

    expect(await screen.findByTestId('session-expired')).toHaveTextContent(
      'Oturumunuz sona erdi.',
    );
    expect(screen.getByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  /**
   * REGRESYON — "ÇIKIŞ YAPTIM" BİR ARIZA DEĞİL.
   *
   * Kullanıcının kendi isteğiyle çıkışında aynı uyarıyı göstermek,
   * yaptığı şeyi bir sorun gibi sunmak olurdu.
   */
  it('kullanıcı kendi çıkış yaptığında oturum uyarısı göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user() }),
        '/auth/logout': () => jsonResponse(204, null),
        ...sessionRoutes,
      }),
    );

    const user = userEvent.setup();

    renderApp('/app', { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Hesap menüsü' }));
    await user.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    expect(screen.queryByTestId('session-expired')).not.toBeInTheDocument();
  });

  /**
   * Çıkış ucunun KENDİSİ 401 dönebilir (token sunucuda çoktan silinmişse).
   * Bu yine kullanıcının istediği bir çıkıştır; uyarı gösterilmemeli.
   * Bayrağın istekten ÖNCE kaldırılmasının sebebi tam olarak budur.
   */
  it('çıkış isteği 401 dönse bile oturum uyarısı göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user() }),
        '/auth/logout': () => jsonResponse(401, { message: 'Unauthenticated.' }),
        ...sessionRoutes,
      }),
    );

    const user = userEvent.setup();

    renderApp('/app', { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Hesap menüsü' }));
    await user.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    expect(screen.queryByTestId('session-expired')).not.toBeInTheDocument();
  });

  /** Yeni oturum açılınca eski uyarı ekranda kalmaz. */
  it('başarılı girişten sonra oturum uyarısını taşımaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(401, { message: 'Unauthenticated.' }),
        '/auth/login': () =>
          jsonResponse(200, { data: { token: 'yeni-token', user: fixtures.user() } }),
        ...sessionRoutes,
      }),
    );

    const user = userEvent.setup();

    renderApp('/app', { token: 'artik-gecersiz-token' });

    await screen.findByTestId('session-expired');
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
    expect(screen.queryByTestId('session-expired')).not.toBeInTheDocument();
  });
});
