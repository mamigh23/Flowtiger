import { ApiError, NetworkError } from '@/lib/api';

/**
 * Görev ekranlarının hata metinleri.
 *
 * 404 "bulunamadı"dır. Başka tenant'ın görevi de 404 döner (403 değil):
 * route model binding sorgusu CompanyScope'un altından geçer ve kayıt hiç
 * bulunmaz. "Yetkiniz yok" demek, backend'in bilerek sakladığı "bu id'de
 * bir kayıt var" bilgisini geri sızdırırdı.
 *
 * 403 BURADA ROL KISITI DEĞİLDİR — ve bu, finans/denetim ekranlarından
 * AYRILDIĞIMIZ nokta. TaskPolicy owner-only değil: owner da member da
 * görevleri görür ve yönetir. Buradaki 403 yalnızca "aktif şirket yok ya
 * da üyelik iptal edilmiş" demektir. "Bu bölüm yalnızca şirket
 * sahiplerine açıktır" metnini buraya kopyalamak, kullanıcıya yanlış bir
 * zihinsel model verirdi (customerErrors.ts ile aynı gerekçe).
 *
 * 422 iş kuralıdır ve backend'in metni kullanılır: TaskException'ın
 * mesajları kullanıcıya gösterilmek üzere yazılmıştır. Makine-okunur
 * kodlar burada yeniden adlandırılmaz.
 *
 * 500 için backend metni kullanılmaz: production'da "Server Error" gelir
 * ve kullanıcıya hiçbir şey anlatmaz.
 *
 * 401 burada ele alınmaz; ApiClient merkezî olarak token'ı siler.
 */

export const TASK_NOT_FOUND = 'Görev bulunamadı.';
export const TASK_UNEXPECTED = 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

/** Backend kodları — olduğu gibi taşınır. */
export const TASK_ALREADY_COMPLETED = 'task_already_completed';
export const TASK_NOT_COMPLETED = 'task_not_completed';

export function taskErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNotFound) return TASK_NOT_FOUND;
    if (error.isServerError) return TASK_UNEXPECTED;

    // 403 ve 422: backend'in kendi metni. Rol diline çevrilmez.
    return error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return TASK_UNEXPECTED;
}

/** 422 alan hatası; başka durumlarda undefined. */
export function fieldErrorOf(error: unknown, field: string): string | undefined {
  return error instanceof ApiError && error.isValidation ? error.fieldError(field) : undefined;
}
