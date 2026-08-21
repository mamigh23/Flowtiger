import { ApiError, NetworkError } from '@/lib/api';

/**
 * Müşteri ekranlarının hata metinleri.
 *
 * İKİ KURAL:
 *
 * 1. 404 "bulunamadı"dır, "yetkiniz yok" DEĞİL. Backend başka tenant'ın
 *    müşterisini bilerek 404 ile gizler (403 değil) — "bu id'de bir kayıt
 *    var ama senin değil" bilgisi bile sızıntıdır. Arayüz "yetkiniz yok"
 *    derse backend'in sakladığı bilgiyi geri sızdırır.
 *
 * 2. 403 ROL kısıtı DEĞİLDİR. CustomerPolicy rol ayrımı yapmaz; owner da
 *    member da tüm CRUD'u yapabilir. 403 yalnızca "aktif şirket yok ya da
 *    üyelik iptal edilmiş" demektir. "Bu işlem için yetkiniz yok" demek
 *    kullanıcıya yanlış bir zihinsel model verir.
 */

/** Müşteri bulunamadı — 404'ün tek doğru karşılığı. */
export const CUSTOMER_NOT_FOUND = 'Müşteri bulunamadı.';

export function customerErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNotFound) return CUSTOMER_NOT_FOUND;

    // 403: backend'in kendi metni kullanılır. Rol diline çevrilmez.
    // 500: backend metni kullanılmaz — production'da "Server Error"
    // gelir ve kullanıcıya hiçbir şey anlatmaz.
    if (error.isServerError) return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

    return error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';
}

/** 422 alan hatası; başka durumlarda undefined. */
export function fieldErrorOf(error: unknown, field: string): string | undefined {
  return error instanceof ApiError && error.isValidation ? error.fieldError(field) : undefined;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.isNotFound;
}
