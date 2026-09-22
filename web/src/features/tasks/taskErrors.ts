import { ApiError, NetworkError } from '@/lib/api';

/**
 * Görev ekranlarının hata metinleri.
 *
 * 404 "bulunamadı"dır. Başka tenant'ın görevi de 404 döner (403 değil):
 * route model binding sorgusu CompanyScope'un altından geçer ve kayıt hiç
 * bulunmaz. "Yetkiniz yok" demek, backend'in bilerek sakladığı "bu id'de
 * bir kayıt var" bilgisini geri sızdırırdı.
 *
 * 403 TÜRKÇEYE ÇEVRİLİR — ESKİDEN ÇEVRİLMİYORDU.
 *
 * Burada eskiden "backend'in kendi metni kullanılır" yazıyordu ve
 * gerekçesi şuydu: TaskPolicy owner-only değil, dolayısıyla 403 yalnızca
 * "aktif şirket yok" demektir. İKİSİ DE ARTIK DOĞRU DEĞİL:
 *
 *   1. `Role::deletesTasks()` OWNER-ONLY (P0-04 sertleştirmesi). Yani
 *      görev SİLME 403'ü gerçek bir rol kısıtıdır.
 *   2. Backend bu 403'ü Laravel'in varsayılan İNGİLİZCE metniyle
 *      gönderiyor: "This action is unauthorized." Gerçek tarayıcıda
 *      ölçüldü — üye "Sil" dediğinde ekranda bu metni görüyordu.
 *
 * AYRIM `code` İLE YAPILIR, METİNLE DEĞİL.
 *
 * Ölçüldü: politika reddi `code` TAŞIMAZ (Laravel'in kendi
 * AccessDeniedHttpException'ı), şirket bağlamı hatası ise taşır
 * (`company_context_unavailable`) ve Türkçe, anlamlı bir mesajla gelir.
 *
 *   code VAR  → backend bilerek yazılmış bir mesaj gönderiyor; kullanılır
 *   code YOK  → çerçevenin İngilizce varsayılanı; Türkçeye çevrilir
 *
 * Metin eşleştirmesi YAPILMAZ ("This action..." aramak gibi): mesaj
 * metni bir sözleşme değildir, `code` sözleşmedir (bkz. errors.ts).
 *
 * 422 hâlâ backend'in metnidir: TaskException mesajları Türkçe yazılmış
 * ve kullanıcıya gösterilmek üzere tasarlanmıştır.
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
export const TASK_FORBIDDEN = 'Bu işlem için yetkiniz yok.';
export const TASK_UNEXPECTED = 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

/** Backend kodları — olduğu gibi taşınır. */
export const TASK_ALREADY_COMPLETED = 'task_already_completed';
export const TASK_NOT_COMPLETED = 'task_not_completed';

export function taskErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNotFound) return TASK_NOT_FOUND;
    if (error.isServerError) return TASK_UNEXPECTED;

    // 403: kodsuzsa çerçevenin İngilizce varsayılanıdır, çevrilir.
    if (error.isForbidden && error.code === undefined) return TASK_FORBIDDEN;

    // 422: backend'in kendi (Türkçe) iş kuralı metni.
    return error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return TASK_UNEXPECTED;
}

/** 422 alan hatası; başka durumlarda undefined. */
export function fieldErrorOf(error: unknown, field: string): string | undefined {
  return error instanceof ApiError && error.isValidation ? error.fieldError(field) : undefined;
}
