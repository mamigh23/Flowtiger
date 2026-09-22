import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Yönlendirme kuralları (playbook §6 akışı):
 *
 *   kimliksiz                        → /login
 *   kimlikli, aktif şirket yok       → /app/company-select
 *   kimlikli, aktif şirket var       → /app
 *
 * Bu yönlendirmeler bir GÜVENLİK SINIRI DEĞİLDİR; yetki kararı her
 * istekte backend'de verilir. Buradaki amaç kullanıcıyı gereksiz bir
 * 403 duvarına çarptırmamaktır.
 */
describe('App yönlendirme', () => {
  const activeCompanyRoutes = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
    '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
    '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
    '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
  };

  it('token yokken korumalı alandan giriş ekranına yönlendirir', async () => {
    vi.stubGlobal('fetch', mockApi({}));

    renderApp('/app');

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  it('token yokken şirket seçim ekranına da izin vermez', async () => {
    vi.stubGlobal('fetch', mockApi({}));

    renderApp('/app/company-select');

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  /**
   * REGRESYON — DERİN BAĞLANTI GİRİŞTEN SONRA GERİ GELİR.
   *
   * `/app/payments`e giden misafir giriş ekranına yönlendirilir ve giriş
   * sonrası ORAYA dönmelidir, `/app`e değil.
   *
   * Kural kodda zaten VARDI ama çalışmıyordu: `PublicOnlyRoute` sabit
   * `/app`e gidiyor ve `LoginPage`in `navigate(from)` çağrısını yarışta
   * yeniyordu — kullanıcı hangi sayfaya gitmek istediyse istesin panele
   * düşüyordu (gerçek tarayıcıda doğrulandı). Artık iki yol da hedefi
   * AYNI fonksiyondan alıyor.
   */
  it('giriş sonrası kullanıcıyı gitmek istediği korumalı sayfaya götürür', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...activeCompanyRoutes,
        '/auth/login': () =>
          jsonResponse(200, { data: { token: 'yeni-token', user: fixtures.user() } }),
        '/payments': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    const user = userEvent.setup();

    // Token YOK: korumalı sayfa önce giriş ekranına yönlendirir.
    renderApp('/app/payments');

    await screen.findByRole('button', { name: 'Giriş yap' });

    await user.type(screen.getByLabelText('E-posta'), 'ada@flowtiger.test');
    await user.type(screen.getByLabelText('Parola'), 'gizli-parola');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    // Panel değil, ÖDEMELER ekranı açılmalı.
    expect(await screen.findByRole('heading', { name: 'Ödemeler' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bugünün Odağı' })).not.toBeInTheDocument();
  });

  /**
   * YUKARIDAKİ TESTİN KİLİTLEYEMEDİĞİ YARIŞI BU TEST KİLİTLER.
   *
   * Gerçek tarayıcıda hatayı üreten şey `PublicOnlyRoute`un sabit `/app`
   * hedefiydi; jsdom'da güncellemeler farklı sırada boşaldığı için o
   * yarış yeniden üretilemiyor ve yukarıdaki akış testi düzeltme
   * OLMADAN da geçiyor (denendi). Burada yarışa hiç girilmiyor:
   * kullanıcı zaten girişli olarak `/login`e geliyor, yönlendirme
   * kararını yalnızca `PublicOnlyRoute` veriyor ve hedefi doğrudan
   * ölçülüyor.
   */
  it('girişli kullanıcı /login e geldiğinde de hedefi korur', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...activeCompanyRoutes,
        '/payments': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/login', {
      token: 'gecerli-token',
      state: { from: '/app/payments' },
    });

    expect(await screen.findByRole('heading', { name: 'Ödemeler' })).toBeInTheDocument();
  });

  it('kök yolu uygulamaya yönlendirir', async () => {
    vi.stubGlobal('fetch', mockApi(activeCompanyRoutes));

    renderApp('/', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
  });

  it('aktif şirket varken panel açılır', async () => {
    vi.stubGlobal('fetch', mockApi(activeCompanyRoutes));

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
  });

  it('aktif şirket yokken ve birden fazla şirket varken seçim ekranına gider', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user({ active_company_id: null }) }),
        '/companies': () =>
          jsonResponse(200, {
            data: [fixtures.company({ id: 7 }), fixtures.company({ id: 9, name: 'İkinci' })],
            meta: { active_company_id: null },
          }),
      }),
    );

    renderApp('/app', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Şirket seçin' })).toBeInTheDocument();
  });

  it('aktif şirket varken seçim ekranı panele geri yönlendirir', async () => {
    vi.stubGlobal('fetch', mockApi(activeCompanyRoutes));

    renderApp('/app/company-select', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Bugünün Odağı' })).toBeInTheDocument();
  });

  /*
   * YER TUTUCU TESTİ KALDIRILDI — gevşetilmedi, KONUSU KALMADI.
   *
   * İddiası şuydu: "hazır olmayan bölüm sahte veri göstermez, 'yakında'
   * der." İddia fazlar boyunca sırayla Müşteriler → Ekip → Davetler →
   * Denetim → Profil bölümlerine taşındı. Profil de gerçek ekran olunca
   * ortada yer tutucu KALMADI; iddia edilecek bir şey olmadığı için test
   * de anlamını yitirdi. Kendisiyle çelişen 13 müşteri testiyle aynı
   * anda doğru olamazdı.
   *
   * Rota kapsamı zayıflamadı, aksine güçlendi: /app/customers artık
   * features/customers altındaki 36 testte tam App + router üzerinden
   * render ediliyor. Yeni bir yer tutucu bölüm eklenirse bu test geri
   * gelmelidir.
   */

  /**
   * Merkezi 401 davranışı (foundation'dan devralındı): herhangi bir
   * istek 401 alırsa token silinir ve oturum kapanır. Bu davranış her
   * bileşende tekrar yazılmaz.
   */
  it('oturum geçersizse token silinir ve giriş ekranına dönülür', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ '/me': () => jsonResponse(401, { message: 'Unauthenticated.' }) }),
    );

    renderApp('/app', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  it('çıkış yapıldığında oturum temizlenir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...activeCompanyRoutes, '/auth/logout': () => new Response(null, { status: 204 }) }),
    );

    const user = userEvent.setup();
    renderApp('/app', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Bugünün Odağı' });

    await user.click(screen.getByRole('button', { name: /Hesap menüsü/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Çıkış yap' }));

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });
});
