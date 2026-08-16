import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

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
});
