import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Foundation testleri: uygulama açılıyor mu, rota koruması çalışıyor mu,
 * oturum düştüğünde istemci temizleniyor mu.
 *
 * fetch her testte taklit edilir; gerçek backend'e bağımlılık yok.
 */
function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('App', () => {
  it('token yokken korumalı rotadan login\'e yönlendirir', async () => {
    vi.stubGlobal('fetch', vi.fn());

    renderApp('/app');

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  it('kök yolu /app\'e yönlendirir (ve oradan login\'e)', async () => {
    vi.stubGlobal('fetch', vi.fn());

    renderApp('/');

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  it('geçerli token ile korumalı alanı gösterir', async () => {
    tokenStorage.set('gecerli-token');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) {
          return jsonResponse(200, {
            data: { id: 1, name: 'Ada', email: 'ada@flowtiger.test', active_company_id: 7 },
          });
        }

        if (url.endsWith('/companies')) {
          return jsonResponse(200, {
            data: [{ id: 7, name: 'Sirket A', role: 'owner' }],
            meta: { active_company_id: 7 },
          });
        }

        return jsonResponse(404, { message: 'not found' });
      }),
    );

    renderApp('/app');

    expect(await screen.findByText('ada@flowtiger.test')).toBeInTheDocument();
    expect(await screen.findByText('Sirket A')).toBeInTheDocument();
    expect(await screen.findByText('aktif')).toBeInTheDocument();
  });

  /**
   * En kritik davranış: backend 401 döndüğünde istemci oturumu
   * kendiliğinden temizlemeli ve kullanıcıyı login'e almalı (§12).
   */
  it('backend 401 döndüğünde oturumu temizler ve login\'e döner', async () => {
    tokenStorage.set('artik-gecersiz-token');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { message: 'Unauthenticated.' })),
    );

    renderApp('/app');

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();

    await waitFor(() => {
      expect(tokenStorage.get()).toBeNull();
    });
  });
});
