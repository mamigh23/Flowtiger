import { ApiError, NetworkError } from './errors';
import type { ApiEnvelope } from '@/types/api';

/**
 * Merkezi API istemcisi.
 *
 * Uygulamada fetch() çağıran BAŞKA bir yer olmamalı. Token ekleme,
 * hata normalizasyonu ve 401 davranışı burada bir kez tanımlanır;
 * özellik kodu bunları tekrar etmez ve unutamaz.
 */

export interface ApiClientOptions {
  baseUrl: string;
  /** İsteğe eklenecek Bearer token (yoksa null). */
  getToken: () => string | null;
  /** 401 alındığında çağrılır: oturum temizliği burada yapılır. */
  onUnauthenticated?: () => void;
}

interface RequestOptions {
  /** Sorgu parametreleri; undefined/null olanlar atlanır. */
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
  /** Bearer token eklensin mi? Public uçlarda false. */
  authenticated?: boolean;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('POST', path, { ...options, body });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PUT', path, { ...options, body });
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  delete<T = void>(path: string, options?: RequestOptions) {
    return this.request<T>('DELETE', path, options);
  }

  /**
   * Sayfalanmış uçlar links/meta da taşır; zarf açılmaz.
   */
  async getPaginated<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.rawRequest<T>('GET', path, options);
  }

  /**
   * Zarfı açar: { data: X } → X
   */
  private async request<T>(method: Method, path: string, options?: RequestOptions): Promise<T> {
    const payload = await this.rawRequest<ApiEnvelope<T> | T | null>(method, path, options);

    if (payload && typeof payload === 'object' && 'data' in payload) {
      return (payload as ApiEnvelope<T>).data;
    }

    // 204 No Content ve zarfsız yanıtlar.
    return payload as T;
  }

  private async rawRequest<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
    const { query, body, signal, authenticated = true } = options;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (authenticated) {
      const token = this.options.getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;

    try {
      response = await fetch(this.buildUrl(path, query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      // AbortError'ı hata saymayız: çağıran bilinçli olarak iptal etti.
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new NetworkError(cause);
    }

    if (response.status === 204 || response.status === 205) {
      return undefined as T;
    }

    const payload = await this.parseJson(response);

    if (!response.ok) {
      throw this.toApiError(response, payload);
    }

    return payload as T;
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    const url = new URL(`${base}/${path.replace(/^\/+/, '')}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }

  private async parseJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      // Backend her zaman JSON döner; JSON olmayan bir gövde
      // (proxy hata sayfası, HTML) ham hâliyle kullanıcıya
      // gösterilmemeli.
      return null;
    }
  }

  private toApiError(response: Response, payload: unknown): ApiError {
    const data = (payload ?? {}) as {
      message?: string;
      code?: string;
      errors?: Record<string, string[]>;
    };

    // 401 tek noktadan işlenir: özellik kodu oturum temizliğiyle
    // uğraşmaz (§12, §13).
    if (response.status === 401) {
      this.options.onUnauthenticated?.();
    }

    const retryAfter = response.headers.get('Retry-After');

    return new ApiError(
      response.status,
      data.message || this.defaultMessageFor(response.status),
      data.code,
      data.errors,
      retryAfter ? Number(retryAfter) : undefined,
    );
  }

  private defaultMessageFor(status: number): string {
    switch (status) {
      case 401:
        return 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.';
      case 403:
        return 'Bu işlem için yetkiniz yok.';
      case 404:
        return 'Kayıt bulunamadı.';
      case 422:
        return 'Gönderilen bilgiler geçersiz.';
      case 429:
        return 'Çok fazla deneme yapıldı.';
      default:
        return 'Beklenmedik bir hata oluştu.';
    }
  }
}
