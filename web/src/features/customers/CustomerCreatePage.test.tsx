import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Müşteri oluşturma.
 *
 * Backend sözleşmesi (CustomerStoreRequest):
 *   POST /customers  { name: zorunlu max:255, phone: nullable max:32 }
 *   → 201 { data: Customer }
 *
 * customer_no ve company_id GÖNDERİLMEZ. Backend bunları sessizce
 * düşürür (422 bile dönmez), ama göndermek istemcinin bu alanlar
 * üzerinde söz sahibi olduğu yanılgısını doğurur.
 */
describe('CustomerCreatePage', () => {
  const session = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  async function fillForm(user: ReturnType<typeof userEvent.setup>, name: string, phone?: string) {
    await user.type(await screen.findByLabelText('Ad'), name);
    if (phone !== undefined) await user.type(screen.getByLabelText('Telefon'), phone);
  }

  it('ad ve telefon alanlarını gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(session));

    renderApp('/app/customers/new', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Ad')).toBeInTheDocument();
    expect(screen.getByLabelText('Telefon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled();
  });

  it('yalnızca ad ve telefon gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/customers': () =>
        jsonResponse(201, { data: fixtures.customer({ id: 777, name: 'Yeni Müşteri' }) }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/customers/new', { token: 'gecerli-token' });

    await fillForm(user, 'Yeni Müşteri', '05551112233');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
    });

    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    )!;

    expect(bodyOf(post[1] as RequestInit)).toEqual({
      name: 'Yeni Müşteri',
      phone: '05551112233',
    });
  });

  it('telefon boş bırakılırsa null gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/customers': () =>
        jsonResponse(201, { data: fixtures.customer({ id: 778, phone: null }) }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/customers/new', { token: 'gecerli-token' });

    await fillForm(user, 'Telefonsuz Müşteri');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(bodyOf(post?.[1] as RequestInit)).toEqual({
        name: 'Telefonsuz Müşteri',
        phone: null,
      });
    });
  });

  it('oluşturma sonrası yeni müşterinin detayına gider', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/777': () =>
          jsonResponse(200, {
            data: fixtures.customer({ id: 777, customer_no: 9, name: 'Yeni Müşteri' }),
          }),
        '/customers': () =>
          jsonResponse(201, {
            data: fixtures.customer({ id: 777, customer_no: 9, name: 'Yeni Müşteri' }),
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/customers/new', { token: 'gecerli-token' });

    await fillForm(user, 'Yeni Müşteri');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('heading', { name: 'Yeni Müşteri' })).toBeInTheDocument();
  });

  it('422 doğrulama hatasını alan altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { name: ['Ad alanı zorunludur.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/customers/new', { token: 'gecerli-token' });

    await fillForm(user, 'X');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Ad alanı zorunludur.')).toBeInTheDocument();
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

    renderApp('/app/customers/new', { token: 'gecerli-token' });

    await fillForm(user, 'Yavaş Ağ');

    const submit = screen.getByRole('button', { name: 'Kaydet' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);

    deferred.resolve?.(jsonResponse(201, { data: fixtures.customer() }));
  });

  it('vazgeçme bağlantısı listeye döner', async () => {
    vi.stubGlobal('fetch', mockApi(session));

    renderApp('/app/customers/new', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Vazgeç' })).toHaveAttribute(
      'href',
      '/app/customers',
    );
  });
});
