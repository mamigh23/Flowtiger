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

  /**
   * Üye — backend MemberResource ile birebir alanlar.
   *
   * `role` pivot'tan gelir ve pivot yüklenmemişse alan HİÇ görünmez;
   * o durum `fixtures.member({ role: undefined })` ile değil, alanı
   * hiç taşımayan bir nesneyle kurulur (bkz. MemberListPage testleri).
   */
  member: (overrides: Record<string, unknown> = {}) => ({
    id: 21,
    name: 'Ada Lovelace',
    email: 'ada@flowtiger.test',
    role: 'owner',
    created_at: '2026-07-01T08:00:00+00:00',
    updated_at: '2026-08-01T12:00:00+00:00',
    ...overrides,
  }),

  /**
   * Davet — backend InvitationResource ile birebir alanlar.
   *
   * `email` MASKELİ gelir; gerçek adres backend'den hiç çıkmaz.
   * `status` hesaplanan alandır, veritabanında yoktur.
   * `token` yanıtta ASLA yer almaz.
   */
  invitation: (overrides: Record<string, unknown> = {}) => ({
    id: 41,
    email: 'a***@flowtiger.test',
    role: 'member',
    status: 'pending',
    expires_at: '2026-08-24T09:00:00+00:00',
    created_at: '2026-08-17T09:00:00+00:00',
    ...overrides,
  }),

  customer: (overrides: Record<string, unknown> = {}) => ({
    id: 501,
    customer_no: 1,
    name: 'Zeynep Kaya',
    phone: '05551112233',
    created_at: '2026-08-10T08:00:00+00:00',
    updated_at: '2026-08-12T14:30:00+00:00',
    ...overrides,
  }),

  /**
   * Laravel paginator meta'sı.
   *
   * Varsayılanlar tek sayfalık bir sonuç üretir; sayfalama testleri
   * `page` seçenekleriyle çok sayfalı yanıtı kurar. Varsayılan değerler
   * bilinçli olarak DEĞİŞTİRİLMEDİ — mevcut testler bunlara dayanıyor.
   */
  paginated: (
    items: unknown[],
    total: number,
    page: { currentPage?: number; lastPage?: number; perPage?: number } = {},
  ) => ({
    data: items,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: page.currentPage ?? 1,
      from: items.length ? 1 : null,
      last_page: page.lastPage ?? 1,
      path: '/',
      per_page: page.perPage ?? 1,
      to: items.length ? items.length : null,
      total,
    },
  }),

  /**
   * Finans kaydı — backend FinanceEntryResource ile birebir alanlar.
   *
   * VARSAYILAN DEĞERLER KENDİ İÇİNDE TUTARLIDIR:
   *   net 100000 + KDV 20000 = brüt 120000, oran 2000bp (%20).
   * Tutarsız bir varsayılan, testlerin gerçekte olmayan bir yanıtı
   * doğrulaması demek olurdu.
   *
   * `calculation` SAKLANMAZ, backend her okumada hesaplar. Override
   * verilirken blok BÜTÜN olarak değiştirilir (mevcut fixture'ların
   * spread davranışı).
   *
   * `customer` TAM KAYIT DEĞİL, özettir: id + customer_no + name.
   */
  financeEntry: (overrides: Record<string, unknown> = {}) => ({
    id: 900,
    direction: 'in',
    financial_date: '2026-08-20',
    category: 'Danışmanlık',
    note: null,
    net_minor: 100000,
    vat_rate_bp: 2000,
    vat_minor: 20000,
    gross_minor: 120000,
    currency: 'TRY',
    customer: null,
    calculation: { basis: 'net', rounding: 'half_up', vat_applicable: true },
    voided_at: null,
    void_reason: null,
    created_at: '2026-08-20T10:00:00+00:00',
    updated_at: '2026-08-20T10:00:00+00:00',
    ...overrides,
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
 * Yanıt üreticisi.
 *
 * `init` verilir ki aynı yola gelen farklı metodlar (GET / PUT / DELETE)
 * ayrıştırılabilsin — müşteri detayında üçü de aynı yolu kullanıyor.
 * `url` verilir ki sorgu parametrelerine göre gerçekçi yanıt üretilebilsin;
 * sayfalama testinde sunucu gerçekten istenen sayfayı döndürmeli, yoksa
 * test yalnızca isteğin gittiğini doğrular, sonucunu değil.
 *
 * İki parametre de İSTEĞE BAĞLIDIR: onları kullanmayan mevcut kayıtlar
 * (`() => jsonResponse(...)`) olduğu gibi çalışmaya devam eder.
 */
export type RouteResponder = (init?: RequestInit, url?: string) => Response;

/**
 * Yol → yanıt eşlemesi ile fetch taklidi.
 *
 * Eşleşmeyen yol 404 döner; böylece testin beklemediği bir çağrı
 * sessizce başarılı olmaz.
 */
export function mockApi(routes: Record<string, RouteResponder>) {
  // İmza gerçek fetch ile aynı tutulur; böylece testler
  // mock.calls[i][1] üzerinden gönderilen gövdeyi tipli okuyabilir.
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    for (const [pattern, respond] of Object.entries(routes)) {
      // Sorgu parametrelerini yok sayarak yol eşleştirmesi.
      const [path] = url.split('?');
      if (path?.endsWith(pattern)) return respond(init, url);
    }

    return jsonResponse(404, { message: `Taklit edilmemiş uç: ${url}` });
  });
}

/** Bir isteğin JSON gövdesini tipli okur. */
export function bodyOf(init: RequestInit | undefined): unknown {
  const body = init?.body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

/** Uygulamayı belirli bir yolda ve isteğe bağlı token ile açar. */
export function renderApp(initialPath: string, options: { token?: string } = {}): ReturnType<typeof render> {
  if (options.token) tokenStorage.set(options.token);

  return renderElement(<App />, initialPath);
}

export function renderElement(element: ReactElement, initialPath = '/'): ReturnType<typeof render> {
  return render(<MemoryRouter initialEntries={[initialPath]}>{element}</MemoryRouter>);
}
