/**
 * API hatalarının tek temsili.
 *
 * Backend hata zarfı: { "message": "...", "code"?: "...", "errors"?: {...} }
 * Bu sınıf o zarfı olduğu gibi taşır; UI katmanı `status` ve `code`
 * üzerinden karar verir, string eşleştirmesi yapmaz.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Backend'in makine-okunur kodu (invitation_expired, no_active_company...) */
    readonly code?: string,
    /** 422'de alan bazlı doğrulama hataları */
    readonly errors?: Record<string, string[]>,
    /** 429'da Retry-After saniyesi */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Oturum geçersiz — istemci kimliği temizlenmeli. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** Kimlik geçerli ama yetki yok. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isValidation(): boolean {
    return this.status === 422;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  /** Bir alanın ilk doğrulama hatası. */
  fieldError(field: string): string | undefined {
    return this.errors?.[field]?.[0];
  }
}

/** Ağ seviyesinde hata: sunucuya hiç ulaşılamadı. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * Kullanıcıya gösterilebilecek güvenli mesaj.
 *
 * 500 için backend'in mesajı kullanılmaz: production'da "Server Error"
 * gelir ve kullanıcıya bir şey anlatmaz.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof NetworkError) return error.message;

  if (error instanceof ApiError) {
    if (error.isServerError) return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';
    if (error.isRateLimited) {
      const wait = error.retryAfterSeconds;
      return wait
        ? `Çok fazla deneme yapıldı. ${wait} saniye sonra tekrar deneyin.`
        : 'Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.';
    }
    return error.message;
  }

  return 'Beklenmedik bir hata oluştu.';
}
