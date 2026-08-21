import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Üye düzenleme.
 *
 * Backend sözleşmesi (MemberUpdateRequest):
 *   PUT /members/{user}  { name: zorunlu, email: zorunlu+unique }
 *
 * ROL BU GÖVDEDE YOKTUR. Rol ayrı bir uçla (PATCH /members/{user}/role)
 * değişir; backend bunu bilinçli ayırmış çünkü rol değişimi kaydın en
 * tehlikeli özniteliği ve kazara başka bir güncellemenin içine
 * karışmamalı. Formda rol alanı olsaydı bu ayrımı istemcide bozmuş
 * olurduk.
 */
describe('MemberEditPage', () => {
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

  function putBody(fetchMock: ReturnType<typeof mockApi>): unknown {
    const put = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    return bodyOf(put?.[1] as RequestInit | undefined);
  }

  it('mevcut ad ve e-postayı forma doldurur', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/22': () => jsonResponse(200, { data: member }),
      }),
    );

    renderApp('/app/team/22/edit', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Ad')).toHaveValue('Mert Demir');
    expect(screen.getByLabelText('E-posta')).toHaveValue('mert@flowtiger.test');
  });

  /**
   * REGRESYON: formda rol alanı OLMAMALI. Rol yalnızca PATCH ile değişir.
   */
  it('rol alanı içermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/22': () => jsonResponse(200, { data: member }),
      }),
    );

    renderApp('/app/team/22/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');

    expect(screen.queryByLabelText('Rol')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /rol/i })).not.toBeInTheDocument();
  });

  /**
   * REGRESYON: gövdede yalnızca name ve email bulunur. role gönderilirse
   * backend onu sessizce düşürür ama istemci "rolü de buradan
   * değiştirebilirim" yanılgısına düşmüş olurdu.
   */
  it('yalnızca ad ve e-posta gönderir, rol göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      '/members/22': (init) =>
        (init as RequestInit | undefined)?.method === 'PUT'
          ? jsonResponse(200, { data: { ...member, name: 'Mert Demir-Kaya' } })
          : jsonResponse(200, { data: member }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/team/22/edit', { token: 'gecerli-token' });

    const name = await screen.findByLabelText('Ad');
    await user.clear(name);
    await user.type(name, 'Mert Demir-Kaya');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      const body = putBody(fetchMock) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['email', 'name']);
      expect(body).toEqual({ name: 'Mert Demir-Kaya', email: 'mert@flowtiger.test' });
    });
  });

  it('422 doğrulama hatalarını alan altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/22': (init) =>
          (init as RequestInit | undefined)?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'Gönderilen bilgiler geçersiz.',
                errors: {
                  name: ['Ad alanı zorunludur.'],
                  email: ['Bu e-posta zaten kullanılıyor.'],
                },
              })
            : jsonResponse(200, { data: member }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/team/22/edit', { token: 'gecerli-token' });

    await user.clear(await screen.findByLabelText('Ad'));
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Ad alanı zorunludur.')).toBeInTheDocument();
    expect(screen.getByText('Bu e-posta zaten kullanılıyor.')).toBeInTheDocument();
  });

  it('kaydedince üye detayına döner', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/22': () =>
          jsonResponse(200, { data: { ...member, name: 'Güncellenmiş Ad' } }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/team/22/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Ad');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('heading', { name: 'Güncellenmiş Ad' })).toBeInTheDocument();
  });

  it('bilinmeyen üyede bulunamadı der', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/999': () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }),
      }),
    );

    renderApp('/app/team/999/edit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Üye bulunamadı.');
    expect(alert.textContent).not.toMatch(/sahiplere açık/i);
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/members/22': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    renderApp('/app/team/22/edit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });
});
