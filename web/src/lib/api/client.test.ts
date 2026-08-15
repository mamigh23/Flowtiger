import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client';
import { ApiError, NetworkError } from './errors';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** fetch imzasıyla birebir uyumlu mock — çağrı argümanları tipli kalır. */
function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init),
  );

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function createClient(token: string | null = 'test-token') {
  const onUnauthenticated = vi.fn();

  const client = new ApiClient({
    baseUrl: 'https://api.test/api/v1',
    getToken: () => token,
    onUnauthenticated,
  });

  return { client, onUnauthenticated };
}

/** Hatanın gerçekten ApiError olduğunu doğrular ve tipli döndürür. */
async function captureApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }

  throw new Error('ApiError bekleniyordu ama istek başarılı oldu.');
}

describe('ApiClient', () => {
  it('data zarfını açar', async () => {
    mockFetch(async () => jsonResponse(200, { data: { id: 1, name: 'Ada' } }));
    const { client } = createClient();

    await expect(client.get('me')).resolves.toEqual({ id: 1, name: 'Ada' });
  });

  it('Authorization başlığını ekler', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(200, { data: null }));
    const { client } = createClient();

    await client.get('me');

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
  });

  it('authenticated:false verildiğinde token göndermez', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(200, { data: null }));
    const { client } = createClient();

    await client.post('auth/login', { email: 'a@b.test' }, { authenticated: false });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).not.toHaveProperty('Authorization');
  });

  it('sorgu parametrelerini kurar ve boşları atlar', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(200, { data: [] }));
    const { client } = createClient();

    await client.get('customers', { query: { page: 2, per_page: undefined } });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/api/v1/customers?page=2');
  });

  it('204 yanıtını gövdesiz döndürür', async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    const { client } = createClient();

    await expect(client.delete('customers/1')).resolves.toBeUndefined();
  });

  it('401 alındığında oturumu merkezî olarak düşürür', async () => {
    mockFetch(async () => jsonResponse(401, { message: 'Unauthenticated.' }));
    const { client, onUnauthenticated } = createClient();

    await captureApiError(client.get('me'));

    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('403 için isForbidden ve kodu taşır', async () => {
    mockFetch(async () =>
      jsonResponse(403, { message: 'Yetkiniz yok.', code: 'no_active_company' }),
    );
    const { client } = createClient();

    const error = await captureApiError(client.get('customers'));

    expect(error.isForbidden).toBe(true);
    expect(error.code).toBe('no_active_company');
  });

  it('404 için isNotFound işaretler', async () => {
    mockFetch(async () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }));
    const { client } = createClient();

    const error = await captureApiError(client.get('customers/9'));

    expect(error.isNotFound).toBe(true);
  });

  it('422 doğrulama hatalarını alan bazında sunar', async () => {
    mockFetch(async () =>
      jsonResponse(422, {
        message: 'Gönderilen bilgiler geçersiz.',
        errors: { email: ['E-posta gerekli.'] },
      }),
    );
    const { client } = createClient();

    const error = await captureApiError(client.post('customers', {}));

    expect(error.isValidation).toBe(true);
    expect(error.fieldError('email')).toBe('E-posta gerekli.');
  });

  it('429 için Retry-After saniyesini taşır', async () => {
    mockFetch(async () =>
      jsonResponse(429, { message: 'Çok fazla deneme.' }, { 'Retry-After': '42' }),
    );
    const { client } = createClient();

    const error = await captureApiError(client.post('auth/login', {}));

    expect(error.isRateLimited).toBe(true);
    expect(error.retryAfterSeconds).toBe(42);
  });

  it('500 için isServerError işaretler', async () => {
    mockFetch(async () => jsonResponse(500, { message: 'Server Error' }));
    const { client } = createClient();

    const error = await captureApiError(client.get('me'));

    expect(error.isServerError).toBe(true);
  });

  it('ağ hatasını NetworkError olarak sarar', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { client } = createClient();

    await expect(client.get('me')).rejects.toBeInstanceOf(NetworkError);
  });

  it('JSON olmayan gövdeyi kullanıcıya sızdırmaz', async () => {
    mockFetch(async () => new Response('<html>proxy hatası</html>', { status: 502 }));
    const { client } = createClient();

    const error = await captureApiError(client.get('me'));

    expect(error.message).not.toContain('html');
    expect(error.isServerError).toBe(true);
  });
});
