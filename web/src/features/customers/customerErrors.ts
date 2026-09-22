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
 * 2. 403 İKİ FARKLI ŞEY OLABİLİR — ve ayrım `code` ile yapılır.
 *
 *    Burada eskiden "CustomerPolicy rol ayrımı yapmaz; owner da member da
 *    tüm CRUD'u yapabilir" yazıyordu. BU ARTIK DOĞRU DEĞİL:
 *    `Role::deletesCustomers()` OWNER-ONLY'dir, yani müşteri SİLME 403'ü
 *    gerçek bir rol kısıtıdır. Üstelik backend o reddi Laravel'in
 *    varsayılan İNGİLİZCE metniyle gönderiyor ("This action is
 *    unauthorized.") — gerçek tarayıcıda ölçüldü: üye "Sil" dediğinde
 *    ekranda bu metni görüyordu.
 *
 *    Ayrım METİNLE DEĞİL, `code` ile yapılır:
 *
 *      code VAR  → backend bilerek yazılmış (Türkçe) bir mesaj gönderiyor;
 *                  olduğu gibi kullanılır. Şirket bağlamı düştüğünde
 *                  kullanıcının okuması gereken şey odur.
 *      code YOK  → çerçevenin İngilizce varsayılanı; Türkçeye çevrilir.
 *
 *    Çeviri cümlesi KASITLI OLARAK GENELDİR: istemci "silme yetkin yok"
 *    ile "şirket bağlamın düştü" arasını ayıramaz — ayırmak için
 *    istemcide rol kararı vermek gerekirdi (playbook §3.1 bunu
 *    yasaklıyor). Genel ama doğru bir cümle, ayrıntılı ama bazen yanlış
 *    bir cümleden iyidir.
 */

/** Müşteri bulunamadı — 404'ün tek doğru karşılığı. */
export const CUSTOMER_NOT_FOUND = 'Müşteri bulunamadı.';

/** Kodsuz 403 — çerçevenin İngilizce varsayılanının karşılığı. */
export const CUSTOMER_FORBIDDEN = 'Bu işlem için yetkiniz yok.';

export function customerErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNotFound) return CUSTOMER_NOT_FOUND;

    // 500: backend metni kullanılmaz — production'da "Server Error"
    // gelir ve kullanıcıya hiçbir şey anlatmaz.
    if (error.isServerError) return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

    // 403: kodsuzsa çerçevenin İngilizce varsayılanıdır, çevrilir.
    if (error.isForbidden && error.code === undefined) return CUSTOMER_FORBIDDEN;

    // 403 (kodlu) ve 422: backend'in kendi metni.
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
