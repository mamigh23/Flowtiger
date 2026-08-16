import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { App } from '@/app/App';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Test yardımcıları.
 *
 * Gerçek backend KULLANILMAZ (§21): fetch taklit edilir. Böylece
 * testler ağa, veritabanına ya da çalışan bir Laravel'e bağımlı olmaz.
 */

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Backend'in gerçek yanıt şekillerini taklit eden hazır gövdeler. */
export const fixtures = {
  user: (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    name: 'Ada Lovelace',
    email: 'ada@flowtiger.test',
    email_verified_at: '2026-08-01T10:00:00+00:00',
    active_company_id: 7,
    created_at: '2026-08-01T10:00:00+00:00',
    ...overrides,
  }),

  company: (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    name: 'Kaplan Yazılım',
    role: 'owner',
    created_at: '2026-08-01T10:00:00+00:00',
    ...overrides,
  }),

  /** Laravel paginator meta'sı. */
  paginated: (items: unknown[], total: number) => ({
    data: items,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: items.length ? 1 : null,
      last_page: 1,
      path: '/',
      per_page: 1,
      to: items.length ? items.length : null,
      total,
    },
  }),

  auditLog: (overrides: Record<string, unknown> = {}) => ({
    id: 100,
    action: 'customer.created',
    actor: { id: 1, name: 'Ada Lovelace' },
    auditable: { type: 'customer', id: 5 },
    old_values: null,
    new_values: null,
    metadata: null,
    ip_address: '203.0.113.10',
    created_at: '2026-08-16T09:30:00+00:00',
    ...overrides,
  }),
};

/**
 * Yol → yanıt eşlemesi ile fetch taklidi.
 *
 * Eşleşmeyen yol 404 döner; böylece testin beklemediği bir çağrı
 * sessizce başarılı olmaz.
 */
export function mockApi(routes: Record<string, () => Response>) {
  // İmza gerçek fetch ile aynı tutulur; böylece testler
  // mock.calls[i][1] üzerinden gönderilen gövdeyi tipli okuyabilir.
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);

    for (const [pattern, respond] of Object.entries(routes)) {
      // Sorgu parametrelerini yok sayarak yol eşleştirmesi.
      const [path] = url.split('?');
      if (path?.endsWith(pattern)) return respond();
    }

    return jsonResponse(404, { message: `Taklit edilmemiş uç: ${url}` });
  });
}

/** Uygulamayı belirli bir yolda ve isteğe bağlı token ile açar. */
export function renderApp(initialPath: string, options: { token?: string } = {}): ReturnType<typeof render> {
  if (options.token) tokenStorage.set(options.token);

  return renderElement(<App />, initialPath);
}

export function renderElement(element: ReactElement, initialPath = '/'): ReturnType<typeof render> {
  return render(<MemoryRouter initialEntries={[initialPath]}>{element}</MemoryRouter>);
}
