import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Müşteri düzenleme.
 *
 * Backend sözleşmesi (CustomerUpdateRequest):
 *   PUT /customers/{id}  { name: zorunlu, phone: nullable }
 *
 * PUT SEMANTİĞİ KRİTİK: uç PATCH değil PUT'tur. Gövde kaydın TAM halini
 * tanımlar, yani gönderilmeyen `phone` null olarak YAZILIR — "alana
 * dokunma" diye bir seçenek yok.
 *
 * Bu yüzden form mevcut değeri doldurur ve `phone` HER İSTEKTE gönderilir.
 * Kullanıcı telefona hiç dokunmasa bile. Aksi hâlde yalnızca adı
 * düzeltmek isteyen bir kullanıcı, farkında olmadan telefonu silerdi.
 * Aşağıdaki iki test bu davranışın regresyon kilidi.
 */
describe('CustomerEditPage', () => {
  const session = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  const customer = fixtures.customer({
    id: 501,
    customer_no: 12,
    name: 'Zeynep Kaya',
    phone: '05551112233',
  });

  function putBody(fetchMock: ReturnType<typeof mockApi>): unknown {
    const put = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    return bodyOf(put?.[1] as RequestInit | undefined);
  }

  it('mevcut değerleri forma doldurur', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/501': () => jsonResponse(200, { data: customer }),
      }),
    );

    renderApp('/app/customers/501/edit', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Ad')).toHaveValue('Zeynep Kaya');
    expect(screen.getByLabelText('Telefon')).toHaveValue('05551112233');
  });

  /**
   * REGRESYON: kullanıcı yalnızca adı değiştirir, telefona dokunmaz.
   * Telefon gövdeden düşerse backend onu null yazar ve veri kaybolur.
   */
  it('telefona dokunulmasa bile mevcut telefonu gövdede gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/customers/501': (init) =>
        init?.method === 'PUT'
          ? jsonResponse(200, { data: { ...customer, name: 'Zeynep Kaya-Demir' } })
          : jsonResponse(200, { data: customer }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/customers/501/edit', { token: 'gecerli-token' });

    const name = await screen.findByLabelText('Ad');
    await user.clear(name);
    await user.type(name, 'Zeynep Kaya-Demir');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toEqual({
        name: 'Zeynep Kaya-Demir',
        phone: '05551112233',
      }),
    );
  });

  /**
   * REGRESYON: telefonu zaten null olan müşteride alan gövdeden
   * DÜŞMEZ, açıkça null gider. Sözleşme "phone her zaman gönderilir".
   */
  it('telefonu olmayan müşteride phone alanını null olarak gönderir', async () => {
    const phoneless = fixtures.customer({ id: 502, phone: null });

    const fetchMock = mockApi({
      ...session,
      '/customers/502': (init) =>
        init?.method === 'PUT'
          ? jsonResponse(200, { data: { ...phoneless, name: 'Yeni Ad' } })
          : jsonResponse(200, { data: phoneless }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/customers/502/edit', { token: 'gecerli-token' });

    const name = await screen.findByLabelText('Ad');
    await user.clear(name);
    await user.type(name, 'Yeni Ad');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      const body = putBody(fetchMock) as Record<string, unknown>;
      expect(body).toEqual({ name: 'Yeni Ad', phone: null });
      // Alan gövdede BULUNMALI; eksik olması null göndermekle aynı şey değil.
      expect(Object.keys(body)).toContain('phone');
    });
  });

  it('telefon silinmek istenirse null gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/customers/501': (init) =>
        init?.method === 'PUT'
          ? jsonResponse(200, { data: { ...customer, phone: null } })
          : jsonResponse(200, { data: customer }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/customers/501/edit', { token: 'gecerli-token' });

    await user.clear(await screen.findByLabelText('Telefon'));
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toEqual({ name: 'Zeynep Kaya', phone: null }),
    );
  });

  it('customer_no ve company_id göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      '/customers/501': (init) =>
        init?.method === 'PUT'
          ? jsonResponse(200, { data: customer })
          : jsonResponse(200, { data: customer }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/customers/501/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      const keys = Object.keys(putBody(fetchMock) as Record<string, unknown>);
      expect(keys).toEqual(['name', 'phone']);
    });
  });

  it('kaydedince detaya döner', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/501': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(200, { data: { ...customer, name: 'Güncellenmiş Ad' } })
            : jsonResponse(200, { data: { ...customer, name: 'Güncellenmiş Ad' } }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/customers/501/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('heading', { name: 'Güncellenmiş Ad' })).toBeInTheDocument();
  });

  it('422 doğrulama hatasını alan altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/501': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'Gönderilen bilgiler geçersiz.',
                errors: { name: ['Ad alanı zorunludur.'] },
              })
            : jsonResponse(200, { data: customer }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/customers/501/edit', { token: 'gecerli-token' });

    await user.clear(await screen.findByLabelText('Ad'));
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Ad alanı zorunludur.')).toBeInTheDocument();
  });

  it('bilinmeyen müşteride bulunamadı der', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/999': () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }),
      }),
    );

    renderApp('/app/customers/999/edit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Müşteri bulunamadı.');
    expect(alert.textContent).not.toMatch(/yetki/i);
  });
});
