import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { tokenStorage } from './tokenStorage';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AuthContext', () => {
  it('token yokken unauthenticated durumunda başlar', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeNull();
  });

  it('login başarılı olduğunda token saklar ve authenticated olur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          data: {
            token: 'yeni-token',
            user: { id: 1, name: 'Ada', email: 'ada@flowtiger.test' },
          },
        }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    await act(async () => {
      await result.current.login('ada@flowtiger.test', 'parola');
    });

    expect(result.current.status).toBe('authenticated');
    expect(result.current.user?.email).toBe('ada@flowtiger.test');
    expect(tokenStorage.get()).toBe('yeni-token');
  });

  it('logout, sunucu hata verse bile yerel oturumu kapatır', async () => {
    tokenStorage.set('bir-token');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) {
          return jsonResponse(200, { data: { id: 1, name: 'Ada', email: 'ada@flowtiger.test' } });
        }

        // logout 500 dönüyor
        return jsonResponse(500, { message: 'Server Error' });
      }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.logout();
    });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(tokenStorage.get()).toBeNull();
  });

  it('token dışarıdan düşerse oturum kapanır', async () => {
    tokenStorage.set('bir-token');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { data: { id: 1, name: 'Ada', email: 'a@b.test' } })),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // ApiClient 401 aldığında tam olarak bunu yapar.
    act(() => tokenStorage.clear());

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeNull();
  });
});
