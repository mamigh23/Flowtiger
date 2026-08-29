import { ApiError, NetworkError } from '@/lib/api';

/**
 * Ödeme ekranlarının hata metinleri.
 *
 * 403 İLE 404 BİRBİRİNE ÇEVRİLMEZ:
 *   404 → kayıt yok ya da başka tenant'ın. Route model binding sorgusu
 *         CompanyScope'un altından geçer ve kayıt hiç bulunmaz;
 *         controller'a ulaşmaz. "Yetkiniz yok" demek, backend'in bilerek
 *         sakladığı "bu id'de bir kayıt var" bilgisini geri sızdırırdı.
 *   403 → kayıt VAR, kullanıcı da şirketin üyesi; eksik olan yalnızca rol
 *         yetkisi (PaymentPolicy owner-only). Burada varlık gizlemenin
 *         anlamı yok.
 *
 * 422 İŞ KURALIDIR VE BACKEND'İN METNİ KULLANILIR. PaymentException'ın
 * mesajları kullanıcıya gösterilmek üzere yazılmıştır ve hiçbir iç ayrıntı
 * içermez. Makine-okunur kodlar burada YENİDEN ADLANDIRILMAZ.
 *
 * 500 için backend metni kullanılmaz: production'da "Server Error" gelir
 * ve kullanıcıya hiçbir şey anlatmaz.
 *
 * 401 burada ele alınmaz; ApiClient merkezî olarak token'ı siler.
 */

export const PAYMENT_NOT_FOUND = 'Ödeme bulunamadı.';
export const PAYMENT_OWNER_ONLY = 'Bu bölüm yalnızca şirket sahiplerine açıktır.';
export const PAYMENT_UNEXPECTED = 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

/** Backend kodları — olduğu gibi taşınır. */
export const PAYMENT_VOIDED = 'payment_voided';
export const PAYMENT_ALREADY_VOIDED = 'payment_already_voided';
export const PAYMENT_OVER_ALLOCATED = 'payment_over_allocated';

/**
 * İptal edilmiş ödemenin değiştirilemeyeceğini söyleyen metin.
 *
 * Backend'in `PaymentException::voided()` metniyle AYNI cümledir ve bu
 * bilinçlidir: kullanıcı aynı kuralı iki farklı yerde iki farklı cümleyle
 * duymamalı. Arayüz bu durumu isteği yapmadan ÖNCE de bilir (kayıtta
 * `voided_at` doludur), o yüzden metin burada da bulunmak zorunda.
 */
export const PAYMENT_VOIDED_MESSAGE = 'İptal edilmiş bir ödeme değiştirilemez.';

export function paymentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNotFound) return PAYMENT_NOT_FOUND;
    if (error.isForbidden) return PAYMENT_OWNER_ONLY;
    if (error.isServerError) return PAYMENT_UNEXPECTED;

    return error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return PAYMENT_UNEXPECTED;
}

/** 422 alan hatası; başka durumlarda undefined. */
export function fieldErrorOf(error: unknown, field: string): string | undefined {
  return error instanceof ApiError && error.isValidation ? error.fieldError(field) : undefined;
}

/**
 * Forma bağlanamayan doğrulama hataları.
 *
 * Bir alan hatası hiçbir alanın altına düşemiyorsa (ör. `allocations.3.*`
 * ama formda üç satır var, ya da backend'in ileride ekleyeceği bir alan)
 * YUTULMAZ. Yutulsaydı kullanıcı "Kaydet"e basar, hiçbir şey olmaz ve
 * sebebini asla öğrenemezdi.
 *
 * @param handled Formda gösterilen alan anahtarları.
 */
export function unhandledValidationMessages(error: unknown, handled: Set<string>): string[] {
  if (!(error instanceof ApiError) || !error.isValidation) return [];

  return Object.entries(error.errors ?? {})
    .filter(([field]) => !handled.has(field))
    .map(([, messages]) => messages[0])
    .filter((message): message is string => message !== undefined);
}
