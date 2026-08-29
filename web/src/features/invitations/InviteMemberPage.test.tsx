import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Davet gönderme.
 *
 * Backend sözleşmesi (InvitationStoreRequest):
 *   POST /invitations  { email* (email, max:255), role* (owner|member) }
 *   → 201 { data: Invitation }
 *
 * GÖVDE `{email, role}` — `name` DEĞİL. Davet edilen kişinin adı bu
 * aşamada bilinmez; adını kendisi kabul ekranında girer.
 *
 * ENUMERATION KORUMASI: kayıtlı bir adresi davet etmekle kayıtsızı
 * davet etmek AYNI yanıtı verir. Arayüz de "bu kullanıcı zaten kayıtlı"
 * gibi bir ayrım yapmaz — yapsaydı backend'in özenle kapattığı bilgi
 * sızıntısını geri açardı.
 *
 * Yanıtta `token` YOKTUR ve arayüz onu hiçbir yerde beklemez; plaintext
 * token yalnızca gönderilen mailde yaşar.
 */
describe('InviteMemberPage', () => {
  const session = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  function postBody(fetchMock: ReturnType<typeof mockApi>): unknown {
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    return bodyOf(post?.[1] as RequestInit | undefined);
  }

  it('e-posta alanı ve rol seçimi gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(session));

    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('E-posta')).toBeInTheDocument();
    expect(screen.getByLabelText('Rol')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Davet gönder' })).toBeEnabled();
  });

  it('rol seçenekleri yalnızca sahip ve üyedir', async () => {
    vi.stubGlobal('fetch', mockApi(session));

    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    const select = await screen.findByLabelText('Rol');
    const options = Array.from(select.querySelectorAll('option')).map(
      (option) => option.textContent,
    );

    expect(options).toEqual(['Üye', 'Sahip']);
  });

  it('varsayılan rol üyedir', async () => {
    vi.stubGlobal('fetch', mockApi(session));

    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Rol')).toHaveValue('member');
  });

  it('yalnızca e-posta ve rol gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/invitations': () => jsonResponse(201, { data: fixtures.invitation() }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    await user.type(await screen.findByLabelText('E-posta'), 'yeni@flowtiger.test');
    await user.click(screen.getByRole('button', { name: 'Davet gönder' }));

    await waitFor(() => {
      const body = postBody(fetchMock) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['email', 'role']);
      expect(body).toEqual({ email: 'yeni@flowtiger.test', role: 'member' });
    });
  });

  it('sahip rolü seçilirse gövdede owner gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/invitations': () => jsonResponse(201, { data: fixtures.invitation({ role: 'owner' }) }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    await user.type(await screen.findByLabelText('E-posta'), 'sahip@flowtiger.test');
    await user.selectOptions(screen.getByLabelText('Rol'), 'owner');
    await user.click(screen.getByRole('button', { name: 'Davet gönder' }));

    await waitFor(() =>
      expect(postBody(fetchMock)).toEqual({ email: 'sahip@flowtiger.test', role: 'owner' }),
    );
  });

  it('gönderim sonrası davet listesine döner', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations': (init) =>
          (init as RequestInit | undefined)?.method === 'POST'
            ? jsonResponse(201, { data: fixtures.invitation({ id: 99 }) })
            : jsonResponse(200, fixtures.paginated([fixtures.invitation({ id: 99 })], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    await user.type(await screen.findByLabelText('E-posta'), 'yeni@flowtiger.test');
    await user.click(screen.getByRole('button', { name: 'Davet gönder' }));

    expect(await screen.findByRole('table', { name: 'Davetler' })).toBeInTheDocument();
  });

  it('422 doğrulama hatasını alan altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { email: ['Geçerli bir e-posta adresi girin.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    await user.type(await screen.findByLabelText('E-posta'), 'gecersiz');
    await user.click(screen.getByRole('button', { name: 'Davet gönder' }));

    expect(await screen.findByText('Geçerli bir e-posta adresi girin.')).toBeInTheDocument();
  });

  /**
   * Zaten üye olan bir adresi davet etmek 422 + invitation_already_member
   * döner. Bu bir doğrulama hatası olduğu için alan altında değil, form
   * seviyesinde gösterilir — `errors` nesnesi gelmez.
   */
  it('zaten üye olan adres için backend mesajını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations': () =>
          jsonResponse(422, {
            message: 'Bu kullanıcı zaten şirketin üyesi.',
            code: 'invitation_already_member',
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    await user.type(await screen.findByLabelText('E-posta'), 'uye@flowtiger.test');
    await user.click(screen.getByRole('button', { name: 'Davet gönder' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bu kullanıcı zaten şirketin üyesi.');
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    await user.type(await screen.findByLabelText('E-posta'), 'yeni@flowtiger.test');
    await user.click(screen.getByRole('button', { name: 'Davet gönder' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });

  it('istek sürerken ikinci gönderimi engeller', async () => {
    // Nesne içinde tutulur: doğrudan bir değişkene atansaydı TypeScript
    // akış analizi onu hiç atanmamış sayıp 'never'a daraltırdı.
    const deferred: { resolve?: (response: Response) => void } = {};

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/me')) return jsonResponse(200, { data: fixtures.user() });
      if (url.includes('/companies')) {
        return jsonResponse(200, {
          data: [fixtures.company()],
          meta: { active_company_id: 7 },
        });
      }

      if (init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          deferred.resolve = resolve;
        });
      }

      return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    await user.type(await screen.findByLabelText('E-posta'), 'yavas@flowtiger.test');

    const submit = screen.getByRole('button', { name: 'Davet gönder' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);

    /**
     * ASKIDAKİ İSTEK ÇÖZÜLÜR VE SONUCU BEKLENİR.
     *
     * Aynı desen: yanıt geldiğinde bileşen `setSubmitting(false)` yapar ve
     * davet listesine gezinir. Beklenmezse ikisi de `act()` dışında kalır.
     * Düğmenin kaybolmasını beklemek bunu gerçek bir iddiaya çevirir.
     */
    deferred.resolve?.(jsonResponse(201, { data: fixtures.invitation() }));

    await waitForElementToBeRemoved(submit);
  });

  it('vazgeçme bağlantısı listeye döner', async () => {
    vi.stubGlobal('fetch', mockApi(session));

    renderApp('/app/invitations/new', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Vazgeç' })).toHaveAttribute(
      'href',
      '/app/invitations',
    );
  });
});
