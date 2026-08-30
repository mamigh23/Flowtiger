import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Davet iptali — liste ekranından.
 *
 *   DELETE /invitations/{id} → 204 | 404 | 410 | 403
 *
 * 410 GONE BU FAZIN YENİ DURUMU. Customer ve Team'de hiç karşılaşmadık.
 * Zaten iptal edilmiş, kabul edilmiş ya da süresi dolmuş bir daveti
 * iptal etmek 410 döner ve backend ÜÇ AYRI KOD taşır:
 *   invitation_revoked | invitation_accepted | invitation_expired
 *
 * Arayüz bu üçünü ayırt eder: "iptal edilmiş" ile "kabul edilmiş"
 * kullanıcı için farklı şeylerdir ve ikisi de "davet artık geçerli
 * değil" demekten daha bilgilendiricidir.
 *
 * İPTAL DÜĞMESİ HER SATIRDA VARDIR — yalnızca `pending` olanlarda değil.
 * Durumu istemcide değerlendirip düğmeyi gizlemek, yetki/geçerlilik
 * kararını istemciye taşımak olurdu; üstelik liste ile sunucu arasında
 * geçen sürede durum değişebilir. Karar backend'e ait, 410 da onun
 * cevabı.
 */
describe('Davet iptali', () => {
  const session = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  const pending = fixtures.invitation({
    id: 41,
    email: 'a***@flowtiger.test',
    role: 'member',
    status: 'pending',
  });

  const accepted = fixtures.invitation({
    id: 42,
    email: 'b***@flowtiger.test',
    role: 'member',
    status: 'accepted',
  });

  it('iptal onay ister ve onaysız istek göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      '/invitations': () => jsonResponse(200, fixtures.paginated([pending], 1)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    await user.click(within(table).getByRole('button', { name: 'İptal et' }));

    expect(await screen.findByTestId('revoke-confirm')).toHaveTextContent(
      /a\*\*\*@flowtiger\.test.*iptal edilecek/,
    );

    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deletes).toHaveLength(0);
  });

  it('onaylanınca DELETE gönderir ve liste tazelenir', async () => {
    let revoked = false;

    const fetchMock = mockApi({
      ...session,
      '/invitations/41': (init) => {
        if ((init as RequestInit | undefined)?.method === 'DELETE') {
          revoked = true;
          return new Response(null, { status: 204 });
        }
        return jsonResponse(404, { message: 'Beklenmeyen çağrı' });
      },
      '/invitations': () =>
        jsonResponse(
          200,
          fixtures.paginated([revoked ? { ...pending, status: 'revoked' } : pending], 1),
        ),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    await user.click(within(table).getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    // Liste yeniden yüklenmiş ve durum değişmiş olmalı.
    expect(await screen.findByText('İptal edildi')).toBeInTheDocument();

    const deletes = fetchMock.mock.calls.filter(
      ([url, init]) =>
        (init as RequestInit | undefined)?.method === 'DELETE' &&
        String(url).endsWith('/invitations/41'),
    );
    expect(deletes).toHaveLength(1);
  });

  it('vazgeçilirse iptal isteği göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      '/invitations': () => jsonResponse(200, fixtures.paginated([pending], 1)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    await user.click(within(table).getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Vazgeç' }));

    await waitFor(() =>
      expect(screen.queryByTestId('revoke-confirm')).not.toBeInTheDocument(),
    );

    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deletes).toHaveLength(0);
  });

  /**
   * Durum istemcide değerlendirilmez: kabul edilmiş bir davette de
   * düğme vardır ve backend 410 ile cevaplar.
   */
  it('kabul edilmiş davette de iptal düğmesi gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations': () => jsonResponse(200, fixtures.paginated([accepted], 1)),
      }),
    );

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });

    expect(within(table).getByRole('button', { name: 'İptal et' })).toBeEnabled();
  });

  it('zaten iptal edilmiş davette 410 mesajını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations/41': (init) =>
          (init as RequestInit | undefined)?.method === 'DELETE'
            ? jsonResponse(410, {
                message: 'Davet artık kullanılamaz (durum: revoked).',
                code: 'invitation_revoked',
              })
            : jsonResponse(404, { message: 'Beklenmeyen çağrı' }),
        '/invitations': () => jsonResponse(200, fixtures.paginated([pending], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    await user.click(within(table).getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bu davet zaten iptal edilmiş.');
  });

  it('kabul edilmiş davette 410 için farklı mesaj gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations/42': (init) =>
          (init as RequestInit | undefined)?.method === 'DELETE'
            ? jsonResponse(410, {
                message: 'Davet artık kullanılamaz (durum: accepted).',
                code: 'invitation_accepted',
              })
            : jsonResponse(404, { message: 'Beklenmeyen çağrı' }),
        '/invitations': () => jsonResponse(200, fixtures.paginated([accepted], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    await user.click(within(table).getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bu davet zaten kabul edilmiş.');
    // İki 410 durumu birbirinden ayrılmalı.
    expect(alert.textContent).not.toContain('zaten iptal edilmiş');
  });

  it('süresi dolmuş davette 410 için kendi mesajını gösterir', async () => {
    const expired = fixtures.invitation({ id: 44, status: 'expired' });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations/44': (init) =>
          (init as RequestInit | undefined)?.method === 'DELETE'
            ? jsonResponse(410, {
                message: 'Davet artık kullanılamaz (durum: expired).',
                code: 'invitation_expired',
              })
            : jsonResponse(404, { message: 'Beklenmeyen çağrı' }),
        '/invitations': () => jsonResponse(200, fixtures.paginated([expired], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    await user.click(within(table).getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bu davetin süresi dolmuş.');
  });

  it('404 durumunda davet bulunamadı der', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations/41': (init) =>
          (init as RequestInit | undefined)?.method === 'DELETE'
            ? jsonResponse(404, {
                message: 'Davet bulunamadı.',
                code: 'invitation_not_found',
              })
            : jsonResponse(404, { message: 'Beklenmeyen çağrı' }),
        '/invitations': () => jsonResponse(200, fixtures.paginated([pending], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    await user.click(within(table).getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Davet bulunamadı.');
    expect(alert.textContent).not.toMatch(/sahiplere açık/i);
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations/41': (init) =>
          (init as RequestInit | undefined)?.method === 'DELETE'
            ? jsonResponse(403, { message: 'This action is unauthorized.' })
            : jsonResponse(404, { message: 'Beklenmeyen çağrı' }),
        '/invitations': () => jsonResponse(200, fixtures.paginated([pending], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    await user.click(within(table).getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });

  // --------------------------------------------------------- A11Y: odak

  it('onay açıldığında odak onay paneline geçer', async () => {
    const fetchMock = mockApi({
      ...session,
      '/invitations': () => jsonResponse(200, fixtures.paginated([pending], 1)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    await user.click(within(table).getByRole('button', { name: 'İptal et' }));

    // Panel gerçek bir modal değil; açılışta odağın panelin kendisine
    // (tabIndex=-1) taşındığını doğruluyoruz.
    const confirmText = await screen.findByTestId('revoke-confirm');
    expect(confirmText.closest('[tabindex="-1"]')).toBe(document.activeElement);
  });

  it('Escape onayı kapatır ve odağı İptal et düğmesine döndürür', async () => {
    const fetchMock = mockApi({
      ...session,
      '/invitations': () => jsonResponse(200, fixtures.paginated([pending], 1)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    const cancelButton = within(table).getByRole('button', { name: 'İptal et' });
    await user.click(cancelButton);
    await screen.findByTestId('revoke-confirm');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId('revoke-confirm')).not.toBeInTheDocument());
    expect(cancelButton).toHaveFocus();
  });

  it('Vazgeç sonrası odak İptal et düğmesine döner', async () => {
    const fetchMock = mockApi({
      ...session,
      '/invitations': () => jsonResponse(200, fixtures.paginated([pending], 1)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    const cancelButton = within(table).getByRole('button', { name: 'İptal et' });
    await user.click(cancelButton);
    await user.click(await screen.findByRole('button', { name: 'Vazgeç' }));

    await waitFor(() => expect(screen.queryByTestId('revoke-confirm')).not.toBeInTheDocument());
    expect(cancelButton).toHaveFocus();
  });

  /**
   * 410 (zaten geçersiz davet), kullanıcının sayfada kaldığı hata
   * senaryosudur — liste yeniden yüklenmez. Odağın kaybolmaması burada
   * özellikle önemlidir.
   */
  it('410 dönerse panel kapanır ve odak İptal et düğmesine döner', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/invitations/41': (init) =>
          (init as RequestInit | undefined)?.method === 'DELETE'
            ? jsonResponse(410, {
                message: 'Davet artık kullanılamaz (durum: revoked).',
                code: 'invitation_revoked',
              })
            : jsonResponse(404, { message: 'Beklenmeyen çağrı' }),
        '/invitations': () => jsonResponse(200, fixtures.paginated([pending], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    const cancelButton = within(table).getByRole('button', { name: 'İptal et' });
    await user.click(cancelButton);
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    await screen.findByRole('alert');
    await waitFor(() => expect(screen.queryByTestId('revoke-confirm')).not.toBeInTheDocument());
    expect(cancelButton).toHaveFocus();
  });

  /**
   * Onay paneli daha önce tabloDAN ÖNCE, tek bir <Card> içinde render
   * ediliyordu: ileri Tab akışı tetikleyici satırdan onay düğmelerine
   * HİÇ ULAŞAMIYORDU (panel DOM'da geriden geliyordu, yalnızca Shift+Tab
   * ile erişilebiliyordu). Artık onay, tetikleyici satırın hemen
   * ardında ikinci bir <tr> olarak render ediliyor.
   *
   * Panelin kendisi tabIndex=-1 taşıdığı (sıralı klavye gezinmesine
   * girmez) için buradaki odak, tetikleyiciden sonra doğrudan panelin
   * İLK gerçek tabbable alt öğesine ("Vazgeç") geçmeli.
   */
  it('ileri Tab akışı tetikleyici satırdan onay düğmelerine ulaşır', async () => {
    const fetchMock = mockApi({
      ...session,
      '/invitations': () => jsonResponse(200, fixtures.paginated([pending], 1)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/invitations', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Davetler' });
    const cancelButton = within(table).getByRole('button', { name: 'İptal et' });

    await user.click(cancelButton);
    await screen.findByTestId('revoke-confirm');

    // Açılış odağı (panelin kendisi) devre dışı bırakılıp tetikleyiciye
    // geri odaklanarak HAM ileri Tab sırası sınanır — bu, autofocus'a
    // bağlı kalmadan DOM bitişikliğini doğrular.
    cancelButton.focus();
    expect(cancelButton).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Vazgeç' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Evet, iptal et' })).toHaveFocus();
  });
});
