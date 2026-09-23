import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, mockApi, renderApp } from '@/test/harness';

describe('SecurityPage', () => {
  const sessions = [
    {
      id: 11,
      name: 'Chrome · Windows',
      current: true,
      abilities: null,
      last_used_at: '2026-09-23T18:00:00Z',
      expires_at: null,
      created_at: '2026-09-23T10:00:00Z',
    },
    {
      id: 12,
      name: 'Safari · iPhone',
      current: false,
      abilities: null,
      last_used_at: '2026-09-22T12:00:00Z',
      expires_at: null,
      created_at: '2026-09-20T12:00:00Z',
    },
  ];

  const session = {
    '/me': () =>
      jsonResponse(200, {
        data: {
          id: 1,
          name: 'Ada Lovelace',
          email: 'ada@flowtiger.test',
          email_verified_at: '2026-09-01T10:00:00Z',
          active_company_id: 7,
          created_at: '2026-09-01T09:00:00Z',
        },
      }),
    '/companies': () =>
      jsonResponse(200, {
        data: [{ id: 7, name: 'FlowTiger', role: 'owner', created_at: '2026-09-01T09:00:00Z' }],
        meta: { active_company_id: 7 },
      }),
    '/profile/sessions': () =>
      jsonResponse(200, {
        data: sessions,
      }),
    '/profile/security-events': () =>
      jsonResponse(200, {
        data: [
          {
            id: 21,
            action: 'login.success',
            ip_address: '203.0.113.10',
            metadata: null,
            created_at: '2026-09-23T18:00:00Z',
          },
        ],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          from: 1,
          last_page: 1,
          path: '/api/profile/security-events',
          per_page: 20,
          to: 1,
          total: 1,
        },
      }),
  };

  it('oturumları ve güvenlik hareketlerini gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(session));

    renderApp('/app/profile/security', { token: 'gecerli-token' });

    expect(await screen.findByText('Chrome · Windows')).toBeInTheDocument();
    expect(screen.getByText('Safari · iPhone')).toBeInTheDocument();
    expect(screen.getByText('Giriş yapıldı')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.10')).toBeInTheDocument();
  });

  it('başka bir oturumu kapatır ve listeyi yeniler', async () => {
    const user = userEvent.setup();
    let closeCount = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/sessions/12': (init) => {
          expect(init?.method).toBe('DELETE');
          closeCount += 1;
          return jsonResponse(204, null);
        },
        '/profile/sessions': () =>
          jsonResponse(200, {
            data: closeCount ? [sessions[0]] : sessions,
          }),
      }),
    );

    renderApp('/app/profile/security', { token: 'gecerli-token' });

    const closeButton = await screen.findByRole('button', { name: 'Kapat' });
    await user.click(closeButton);

    await waitFor(() => expect(screen.queryByText('Safari · iPhone')).not.toBeInTheDocument());
    expect(closeCount).toBe(1);
  });

  it('diğer oturumları kapatır', async () => {
    const user = userEvent.setup();
    let revokeOthersCount = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/sessions/others': (init) => {
          expect(init?.method).toBe('DELETE');
          revokeOthersCount += 1;
          return jsonResponse(204, null);
        },
        '/profile/sessions': () =>
          jsonResponse(200, {
            data: [sessions[0]],
          }),
      }),
    );

    renderApp('/app/profile/security', { token: 'gecerli-token' });

    await user.click(await screen.findByRole('button', { name: 'Diğerlerini kapat' }));

    await waitFor(() => expect(screen.queryByText('Safari · iPhone')).not.toBeInTheDocument());
    expect(revokeOthersCount).toBe(1);
  });
});
