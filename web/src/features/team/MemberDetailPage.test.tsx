import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Üye detayı — rol değişimi ve ekipten çıkarma.
 *
 * Backend sözleşmesi:
 *   GET    /members/{user}       → 200 { data } | 404
 *   PATCH  /members/{user}/role  → 200 { data } | 422 | 403
 *   DELETE /members/{user}       → 204 | 403
 *
 * ROL DEĞİŞİMİ AYRI UÇ ve PATCH: kaydın tamamı değil tek bir özniteliği
 * değişir. Backend bunu bilinçli ayırmış — "en tehlikeli işlem kazara
 * başka bir güncellemenin içine karışmamalı".
 *
 * İKİ ÖZEL DURUM:
 *   son owner düşürülemez → 422 + code: company_requires_an_owner
 *   owner kendini çıkaramaz → 403 (son owner olmasa bile)
 */
describe('MemberDetailPage', () => {
  const session = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  const member = fixtures.member({
    id: 22,
    name: 'Mert Demir',
    email: 'mert@flowtiger.test',
    role: 'member',
  });

  function patchBody(fetchMock: ReturnType<typeof mockApi>): unknown {
    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    );
    return bodyOf(patch?.[1] as RequestInit | undefined);
  }

  it('üyenin adını, e-postasını ve rolünü gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/22': () => jsonResponse(200, { data: member }),
      }),
    );

    renderApp('/app/team/22', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Mert Demir' })).toBeInTheDocument();
    expect(screen.getByText('mert@flowtiger.test')).toBeInTheDocument();
    expect(screen.getByTestId('member-role')).toHaveTextContent('Üye');
  });

  it('bilinmeyen üyede bulunamadı der, yetki hatası demez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/999': () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }),
      }),
    );

    renderApp('/app/team/999', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Üye bulunamadı.');
    expect(alert.textContent).not.toMatch(/sahiplere açık|yetkiniz yok/i);

    expect(screen.getByRole('link', { name: 'Ekibe dön' })).toHaveAttribute('href', '/app/team');
  });

  it('düzenleme bağlantısı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/22': () => jsonResponse(200, { data: member }),
      }),
    );

    renderApp('/app/team/22', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Düzenle' })).toHaveAttribute(
      'href',
      '/app/team/22/edit',
    );
  });

  // --------------------------------------------------------- rol değişimi

  it('rol değişimini PATCH ile ve yalnızca role alanıyla gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/members/22/role': () =>
        jsonResponse(200, { data: { ...member, role: 'owner' } }),
      '/members/22': () => jsonResponse(200, { data: member }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/team/22', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Mert Demir' });
    await user.click(screen.getByRole('button', { name: 'Sahip yap' }));

    await waitFor(() => expect(patchBody(fetchMock)).toEqual({ role: 'owner' }));

    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(String(patchCall?.[0])).toContain('/members/22/role');
  });

  it('rol değişimi sonrası güncel rolü gösterir', async () => {
    let role = 'member';

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/22/role': () => {
          role = 'owner';
          return jsonResponse(200, { data: { ...member, role } });
        },
        '/members/22': () => jsonResponse(200, { data: { ...member, role } }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/team/22', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Mert Demir' });
    expect(screen.getByTestId('member-role')).toHaveTextContent('Üye');

    await user.click(screen.getByRole('button', { name: 'Sahip yap' }));

    await waitFor(() => expect(screen.getByTestId('member-role')).toHaveTextContent('Sahip'));
  });

  /**
   * Son owner member'a düşürülemez. Bu bir YETKİ hatası değil: isteği
   * yapanın yetkisi tamdır, ama işlem şirketi ownersız bırakırdı.
   * Backend bu yüzden 403 değil 422 + makine-okunur kod döner.
   */
  it('son owner düşürülemediğinde 422 mesajını gösterir', async () => {
    const owner = fixtures.member({ id: 21, name: 'Ada Lovelace', role: 'owner' });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/21/role': () =>
          jsonResponse(422, {
            message:
              "Bu işlem şirketi owner'sız bırakırdı. Önce başka bir üyeye owner rolü verin.",
            code: 'company_requires_an_owner',
          }),
        '/members/21': () => jsonResponse(200, { data: owner }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/team/21', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Ada Lovelace' });
    await user.click(screen.getByRole('button', { name: 'Üye yap' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Bu işlem şirketi owner'sız bırakırdı.");

    // Rol değişmemiş olmalı.
    expect(screen.getByTestId('member-role')).toHaveTextContent('Sahip');
  });

  // ------------------------------------------------------- ekipten çıkarma

  it('çıkarma işlemi onay ister ve onaysız istek göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      '/members/22': () => jsonResponse(200, { data: member }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/team/22', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Mert Demir' });
    await user.click(screen.getByRole('button', { name: 'Ekipten çıkar' }));

    expect(await screen.findByTestId('remove-confirm')).toHaveTextContent(
      /Mert Demir ekipten çıkarılacak/,
    );

    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deletes).toHaveLength(0);
  });

  it('onaylanınca DELETE gönderir ve ekip listesine döner', async () => {
    let removed = false;

    const fetchMock = mockApi({
      ...session,
      '/members/22': (init) => {
        if ((init as RequestInit | undefined)?.method === 'DELETE') {
          removed = true;
          return new Response(null, { status: 204 });
        }
        return jsonResponse(200, { data: member });
      },
      '/members': () =>
        jsonResponse(
          200,
          fixtures.paginated(removed ? [] : [member], removed ? 0 : 1),
        ),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/team/22', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Mert Demir' });
    await user.click(screen.getByRole('button', { name: 'Ekipten çıkar' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, çıkar' }));

    expect(await screen.findByText('Ekipte görüntülenecek üye yok.')).toBeInTheDocument();

    const deletes = fetchMock.mock.calls.filter(
      ([url, init]) =>
        (init as RequestInit | undefined)?.method === 'DELETE' &&
        String(url).endsWith('/members/22'),
    );
    expect(deletes).toHaveLength(1);
  });

  it('vazgeçilirse çıkarma isteği göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      '/members/22': () => jsonResponse(200, { data: member }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/team/22', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Mert Demir' });
    await user.click(screen.getByRole('button', { name: 'Ekipten çıkar' }));
    await user.click(await screen.findByRole('button', { name: 'Vazgeç' }));

    await waitFor(() =>
      expect(screen.queryByTestId('remove-confirm')).not.toBeInTheDocument(),
    );

    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deletes).toHaveLength(0);
  });

  /**
   * Owner kendini çıkaramaz — son owner olmasa bile. Policy bu kontrolü
   * yetki kontrolünden ÖNCE yapar ve 403 döner. Laravel'in ham İngilizce
   * mesajı kullanıcıya gösterilmez.
   */
  it('kendini çıkarmaya çalışınca 403 mesajını açıklar', async () => {
    const self = fixtures.member({ id: 21, name: 'Ada Lovelace', role: 'owner' });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/21': (init) =>
          (init as RequestInit | undefined)?.method === 'DELETE'
            ? jsonResponse(403, { message: 'This action is unauthorized.' })
            : jsonResponse(200, { data: self }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/team/21', { token: 'gecerli-token' });

    await screen.findByRole('heading', { name: 'Ada Lovelace' });
    await user.click(screen.getByRole('button', { name: 'Ekipten çıkar' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, çıkar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kendinizi ekipten çıkaramazsınız.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });
});
