import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';
import { FLOWTIGER_LOGO_SRC } from '@/features/brand/FlowTigerMark';

/**
 * Ürün kabuğu ve marka geçişi.
 *
 * KENAR ÇUBUĞU DARALDI ama ETİKETLER DOM'DA KALDI. İkon-only bir menü
 * görsel olarak sakin görünür, erişilebilirlik açısından ise bir
 * gerilemedir: ekran okuyucu kullanıcısı simgeyi okuyamaz. Bu yüzden her
 * bağlantı gerçek metnini taşır ve testler bunu kilitler — etiketler
 * yalnızca GÖRSEL olarak kırpılır (CSS), a11y ağacından çıkmaz.
 *
 * PERDE İÇERİĞİ KALDIRMAZ, ÜSTÜNE ÖRTÜLÜR. Bu bir yükleme ekranı değil:
 * beklenen bir şey yok, uygulama arkada zaten hazır. Aşağıdaki test
 * bunu doğrudan kilitliyor — perde açıkken bile ana içerik DOM'da.
 */
describe('AppShell', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /*
   * Kabuk testleri ana ekranı da render ediyor; dolayısıyla ana ekranın
   * ihtiyaç duyduğu uçlar burada da tanımlı olmalı. Mock'suz bir uç 404
   * alır ve ilgili bölüm hata durumuna düşer — kabuk testi o zaman
   * ölçmek istediği şeyi değil, kurulumundaki eksiği ölçer.
   */
  const routes = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
    '/tasks/today': () => jsonResponse(200, fixtures.paginated([], 0)),
    '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
  };

  // ------------------------------------------------------- marka geçişi

  it('uygulama açılırken marka geçişini gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByTestId('flowtiger-splash')).toBeInTheDocument();
  });

  /**
   * REGRESYON — PERDE İÇERİĞİ ENGELLEMEZ.
   *
   * Perde arkasında uygulama gerçekten hazırlanır; kullanıcı boş bir
   * iskelete bakmaz. İçerik perde kalkınca "yüklenmez", zaten oradadır.
   */
  it('perde açıkken ana içerik zaten hazırdır', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByTestId('flowtiger-splash');

    expect(screen.getByRole('navigation', { name: 'Ana gezinme' })).toBeInTheDocument();

    /*
     * `findByTestId` — SENKRON DEĞİL, VE BU BİR GEVŞETME DEĞİL.
     *
     * Plan bölümü artık gerçek bir uca (`GET /tasks/today`) bağlı;
     * "hazır" olması bir ağ turunun tamamlanmasını içeriyor. Senkron
     * sorgu, isteğin daha çözülmediği anı yakalayıp `plan-loading`
     * görüyordu — yani testi kıran şey içeriğin yokluğu değil, ölçüm
     * anıydı.
     *
     * İddianın kendisi korunuyor ve GÜÇLENİYOR: içeriğin hazır olduğunu
     * göstermekle kalmıyoruz, o sırada perdenin HÂLÂ AÇIK olduğunu da
     * kanıtlıyoruz. "Perde arkasında uygulama gerçekten hazırlanır"
     * cümlesinin tam karşılığı bu.
     */
    expect(await screen.findByTestId('plan-empty')).toBeInTheDocument();
    expect(screen.getByTestId('flowtiger-splash')).toBeInTheDocument();
  });

  it('geçiş bitince perde kalkar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByTestId('flowtiger-splash');

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    await waitFor(() =>
      expect(screen.queryByTestId('flowtiger-splash')).not.toBeInTheDocument(),
    );
  });

  /**
   * Perde DEKORATİFTİR: ekran okuyucuya gösterilmez ve klavye odağını
   * çalmaz. Aksi hâlde 2 saniye boyunca kullanıcının önüne anlamsız bir
   * duvar konmuş olurdu.
   */
  it('perde ekran okuyucudan gizlidir', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app', { token: 'gecerli-token' });

    const splash = await screen.findByTestId('flowtiger-splash');

    expect(splash).toHaveAttribute('aria-hidden', 'true');
    expect(within(splash).queryByRole('button')).not.toBeInTheDocument();
    expect(within(splash).queryByRole('link')).not.toBeInTheDocument();
  });

  /** Sahte meşguliyet göstergesi YOK: beklenen bir şey yok. */
  it('perdede yükleme göstergesi bulunmaz', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app', { token: 'gecerli-token' });

    const splash = await screen.findByTestId('flowtiger-splash');

    expect(within(splash).queryByRole('status')).not.toBeInTheDocument();
    expect(within(splash).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — PERDE OTURUM BAŞINA BİR KEZ.
   *
   * Kabuk oturum boyunca bir kez mount olur; alt rotalar arasında
   * gezinirken yerinde kalır. Perde her gezinmede tekrar oynasaydı marka
   * anı olmaktan çıkıp bir engele dönüşürdü — Finans'a her geçişte iki
   * saniye beklemek gibi.
   */
  it('sayfa değiştirince perde tekrar oynamaz', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByTestId('flowtiger-splash');

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    await waitFor(() =>
      expect(screen.queryByTestId('flowtiger-splash')).not.toBeInTheDocument(),
    );

    // userEvent yerine fireEvent: sahte saat ile userEvent'in kendi
    // gecikmeleri birbirine dolanıyor ve testi zamanlamaya bağımlı
    // kılıyor. Bağlantı tıklaması için fireEvent yeterli.
    const nav = screen.getByRole('navigation', { name: 'Ana gezinme' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Finans' }));

    expect(await screen.findByRole('heading', { name: 'Finans' })).toBeInTheDocument();
    expect(screen.queryByTestId('flowtiger-splash')).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — YENİ OTURUMDA PERDE TEKRAR ÇALIŞIR.
   *
   * Çıkış yapınca kabuk sökülür; yeniden giriş yapınca yeniden kurulur ve
   * perde de yeniden oynar. "Bir kez" kuralı OTURUM başınadır, uygulama
   * ömrü başına değil.
   */
  it('çıkış ve yeniden girişten sonra perde tekrar çalışır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/auth/logout': () => new Response(null, { status: 204 }),
        '/auth/login': () =>
          jsonResponse(200, { data: { token: 'yeni-token', user: fixtures.user() } }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByTestId('flowtiger-splash');

    await user.click(await screen.findByRole('button', { name: 'Hesap menüsü' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Çıkış yap' }));

    // Giriş ekranında perde yok: kabuk söküldü.
    await screen.findByRole('button', { name: 'Giriş yap' });
    expect(screen.queryByTestId('flowtiger-splash')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('E-posta'), 'ada@flowtiger.test');
    await user.type(screen.getByLabelText('Parola'), 'gizli-parola');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(await screen.findByTestId('flowtiger-splash')).toBeInTheDocument();
  });

  // ------------------------------------------------------------ gezinme

  /**
   * Marka kenar çubuğunda da bulunur — perdeye özel değildir. Üç ekranda
   * (perde, kenar çubuğu, giriş) AYNI bileşen kullanılır; üç ayrı logo
   * bir gün birbirinden ayrılırdı.
   */
  it('kenar çubuğunda marka işaretini gösterir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByTestId('flowtiger-splash');

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Perde kalktıktan sonra ekranda TEK marka işareti kalır: kenar
    // çubuğundaki.
    await waitFor(() => expect(screen.getByTestId('flowtiger-mark')).toBeInTheDocument());
    expect(screen.getByText('FlowTiger')).toBeInTheDocument();

    // Gerçek asset, yer tutucu değil.
    expect(screen.getByTestId('flowtiger-mark')).toHaveAttribute('src', FLOWTIGER_LOGO_SRC);
    expect(screen.queryByText('FT')).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — İKON TEK BAŞINA ANLAM TAŞIMAZ.
   *
   * Etiketler DOM'da kalır; dar çubukta yalnızca görsel olarak kırpılır.
   */
  it('kenar çubuğunda tüm ürün bölümlerini metinle gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app', { token: 'gecerli-token' });

    const nav = await screen.findByRole('navigation', { name: 'Ana gezinme' });

    for (const label of [
      'Panel',
      'Müşteriler',
      'Finans',
      'Ödemeler',
      'Ekip',
      'Davetler',
      'Denetim',
      'Profil',
    ]) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('bağlantılar doğru rotalara gider', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app', { token: 'gecerli-token' });

    const nav = await screen.findByRole('navigation', { name: 'Ana gezinme' });

    const expected: Record<string, string> = {
      Panel: '/app',
      Müşteriler: '/app/customers',
      Finans: '/app/finance',
      Ödemeler: '/app/payments',
      Ekip: '/app/team',
      Davetler: '/app/invitations',
      Denetim: '/app/audit',
      Profil: '/app/profile',
    };

    for (const [label, href] of Object.entries(expected)) {
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('finans bağlantısı finans ekranını açar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/finance-entries': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    const nav = await screen.findByRole('navigation', { name: 'Ana gezinme' });
    await user.click(within(nav).getByRole('link', { name: 'Finans' }));

    expect(await screen.findByRole('heading', { name: 'Finans' })).toBeInTheDocument();
  });

  it('ödemeler bağlantısı ödeme ekranını açar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/payments': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    const nav = await screen.findByRole('navigation', { name: 'Ana gezinme' });
    await user.click(within(nav).getByRole('link', { name: 'Ödemeler' }));

    expect(await screen.findByRole('heading', { name: 'Ödemeler' })).toBeInTheDocument();
  });

  /**
   * Rol bazlı gizleme YOKTUR: bazı uçlar owner-only ama bu karar
   * backend'e aittir (playbook §3.1). Bağlantıyı gizlemek, yetki kararını
   * istemcide yeniden uygulamak olurdu.
   */
  it('member rolünde de tüm bağlantıları gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user() }),
        '/companies': () =>
          jsonResponse(200, {
            data: [fixtures.company({ role: 'member' })],
            meta: { active_company_id: 7 },
          }),
        '/audit-logs': () => jsonResponse(403, { message: 'Bu işlem için yetkiniz yok.' }),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    const nav = await screen.findByRole('navigation', { name: 'Ana gezinme' });

    expect(within(nav).getByRole('link', { name: 'Finans' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Denetim' })).toBeInTheDocument();
  });

  // ------------------------------------------------------------ üst bar

  it('aktif şirketi ve rolü üst barda gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByText('Kaplan Yazılım')).toBeInTheDocument();
    expect(screen.getByText('Sahip')).toBeInTheDocument();
  });

  it('hesap menüsü profil bağlantısını sunar', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Hesap menüsü' }));

    const menu = await screen.findByRole('menu');

    expect(within(menu).getByRole('menuitem', { name: 'Profil' })).toHaveAttribute(
      'href',
      '/app/profile',
    );
    expect(within(menu).getByText('ada@flowtiger.test')).toBeInTheDocument();
  });

  it('hesap menüsünden çıkış yapılabilir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/auth/logout': () => new Response(null, { status: 204 }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Hesap menüsü' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Çıkış yap' }));

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  // ------------------------------------------------------------- mobil

  /**
   * Çekmecenin açık/kapalı durumu `aria-expanded` ile bildirilir; CSS
   * sınıfı yalnızca görünüm. Klavye ve ekran okuyucu kullanıcısı da
   * durumu bilmeli.
   */
  it('mobil çekmece açılıp kapanır', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    const toggle = await screen.findByRole('button', { name: 'Gezinmeyi aç/kapat' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  /** Gezinme sonrası çekmece kapanır: içerik açıldığında menü kapanmalı. */
  it('gezinince çekmece kapanır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...routes,
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    const toggle = await screen.findByRole('button', { name: 'Gezinmeyi aç/kapat' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const nav = screen.getByRole('navigation', { name: 'Ana gezinme' });
    await user.click(within(nav).getByRole('link', { name: 'Müşteriler' }));

    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));
  });
});
