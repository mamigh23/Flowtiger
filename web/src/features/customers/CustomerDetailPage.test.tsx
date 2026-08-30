import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Müşteri detayı ve silme.
 *
 * Backend sözleşmesi:
 *   GET    /customers/{id} → 200 { data: Customer } | 404
 *   DELETE /customers/{id} → 204 (gövdesiz) | 404
 *
 * 404 KRİTİK: başka tenant'ın müşterisi de 404 döner, 403 değil. Bu
 * bilinçli bir gizlemedir ("bu id'de kayıt var ama senin değil" bilgisi
 * bile sızıntıdır). Arayüz bunu "bulunamadı" olarak gösterir; "yetkiniz
 * yok" demek backend'in sakladığı bilgiyi geri sızdırırdı.
 */
describe('CustomerDetailPage', () => {
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

  it('müşteri numarasını, adını ve telefonunu gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/501': () => jsonResponse(200, { data: customer }),
      }),
    );

    renderApp('/app/customers/501', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Zeynep Kaya' })).toBeInTheDocument();
    expect(screen.getByTestId('customer-no')).toHaveTextContent('12');
    expect(screen.getByText('05551112233')).toBeInTheDocument();
  });

  it('telefonu olmayan müşteride uydurma değer göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/502': () =>
          jsonResponse(200, { data: fixtures.customer({ id: 502, phone: null }) }),
      }),
    );

    renderApp('/app/customers/502', { token: 'gecerli-token' });

    expect(await screen.findByTestId('customer-phone')).toHaveTextContent('—');
  });

  it('bilinmeyen müşteride bulunamadı der, yetki hatası demez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/999': () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }),
      }),
    );

    renderApp('/app/customers/999', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Müşteri bulunamadı.');
    expect(alert.textContent).not.toMatch(/yetki|erişim reddedildi/i);

    expect(screen.getByRole('link', { name: 'Müşterilere dön' })).toHaveAttribute(
      'href',
      '/app/customers',
    );
  });

  it('düzenleme bağlantısı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/501': () => jsonResponse(200, { data: customer }),
      }),
    );

    renderApp('/app/customers/501', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Düzenle' })).toHaveAttribute(
      'href',
      '/app/customers/501/edit',
    );
  });

  // --------------------------------------------------------------- silme

  it('silme işlemi onay ister ve onaysız istek göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      '/customers/501': () => jsonResponse(200, { data: customer }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/customers/501', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Zeynep Kaya' });
    await user.click(screen.getByRole('button', { name: 'Sil' }));

    // Onay metni müşterinin adını içermeli: yanlış kaydı silmek geri
    // alınamaz (backend'de soft delete YOK).
    //
    // toHaveTextContent kullanılır çünkü ad <strong> içinde; metin
    // birden çok düğüme bölünmüş olsa da aynı kutuda olması gerekir.
    expect(await screen.findByTestId('delete-confirm')).toHaveTextContent(
      /Zeynep Kaya kalıcı olarak silinecek/,
    );

    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deletes).toHaveLength(0);
  });

  it('onaylanınca DELETE gönderir ve listeye döner', async () => {
    const fetchMock = mockApi({
      ...session,
      '/customers/501': (init) =>
        init?.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : jsonResponse(200, { data: customer }),
      '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/customers/501', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Zeynep Kaya' });
    await user.click(screen.getByRole('button', { name: 'Sil' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, sil' }));

    expect(await screen.findByText('Henüz müşteri yok.')).toBeInTheDocument();

    const deletes = fetchMock.mock.calls.filter(
      ([url, init]) =>
        (init as RequestInit | undefined)?.method === 'DELETE' &&
        String(url).endsWith('/customers/501'),
    );
    expect(deletes).toHaveLength(1);
  });

  it('vazgeçilirse silme isteği göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      '/customers/501': () => jsonResponse(200, { data: customer }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/customers/501', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Zeynep Kaya' });
    await user.click(screen.getByRole('button', { name: 'Sil' }));
    await user.click(await screen.findByRole('button', { name: 'Vazgeç' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Evet, sil' })).not.toBeInTheDocument(),
    );

    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deletes).toHaveLength(0);
  });

  /**
   * Kayıt başka bir oturumda silinmişse DELETE 404 döner. Burada da
   * "bulunamadı" denir; kullanıcı listeye dönebilmeli.
   */
  it('silme 404 dönerse bulunamadı der', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/501': (init) =>
          init?.method === 'DELETE'
            ? jsonResponse(404, { message: 'Kayıt bulunamadı.' })
            : jsonResponse(200, { data: customer }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/customers/501', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Zeynep Kaya' });
    await user.click(screen.getByRole('button', { name: 'Sil' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, sil' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Müşteri bulunamadı.');
    expect(alert.textContent).not.toMatch(/yetki/i);
  });

  // --------------------------------------------------------- A11Y: odak

  it('onay açıldığında odak onay paneline geçer', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/501': () => jsonResponse(200, { data: customer }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/customers/501', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Zeynep Kaya' });
    await user.click(screen.getByRole('button', { name: 'Sil' }));

    // Panel gerçek bir modal değil (tabIndex=-1 taşıyan sıradan bir
    // div); açılışta odağın bu kabuğa taşındığını doğruluyoruz.
    const confirmText = await screen.findByTestId('delete-confirm');
    expect(confirmText.closest('[tabindex="-1"]')).toBe(document.activeElement);
  });

  it('Escape onayı kapatır ve odağı Sil düğmesine döndürür', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/501': () => jsonResponse(200, { data: customer }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/customers/501', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Zeynep Kaya' });
    const deleteButton = screen.getByRole('button', { name: 'Sil' });
    await user.click(deleteButton);
    await screen.findByTestId('delete-confirm');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument());
    expect(deleteButton).toHaveFocus();
  });

  it('Vazgeç sonrası odak Sil düğmesine döner', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/501': () => jsonResponse(200, { data: customer }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/customers/501', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Zeynep Kaya' });
    const deleteButton = screen.getByRole('button', { name: 'Sil' });
    await user.click(deleteButton);
    await user.click(await screen.findByRole('button', { name: 'Vazgeç' }));

    await waitFor(() => expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument());
    expect(deleteButton).toHaveFocus();
  });

  /**
   * Hata sonrası kapanma en çok atlanan senaryodur: kullanıcı sayfadan
   * ayrılmaz (navigate() çağrılmaz), bu yüzden odağın kaybolmaması
   * özellikle burada önemlidir.
   */
  it('silme 404 dönerse panel kapanır ve odak Sil düğmesine döner', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/customers/501': (init) =>
          init?.method === 'DELETE'
            ? jsonResponse(404, { message: 'Kayıt bulunamadı.' })
            : jsonResponse(200, { data: customer }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/customers/501', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Zeynep Kaya' });
    const deleteButton = screen.getByRole('button', { name: 'Sil' });
    await user.click(deleteButton);
    await user.click(await screen.findByRole('button', { name: 'Evet, sil' }));

    await screen.findByRole('alert');
    await waitFor(() => expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument());
    expect(deleteButton).toHaveFocus();
  });
});
