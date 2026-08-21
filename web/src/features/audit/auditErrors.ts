import { ApiError, NetworkError } from '@/lib/api';

/**
 * Denetim ekranının hata metinleri.
 *
 * BU UÇTA 404 YOKTUR: tekil audit ucu yok, yalnızca liste var. 429 da
 * yoktur: uçta throttle tanımlı değil. Bu yüzden burada onlara karşılık
 * gelen özel bir metin de yok — olmayan bir duruma metin yazmak, bir gün
 * yanlış yerde gösterilecek bir metin yazmaktır.
 *
 * 403 Team ve Invitation ile aynı anlamda GERÇEKTEN rol kısıtıdır
 * (AuditLogPolicy → Role::viewsAuditLogs() → yalnızca owner). Ama bu
 * bilgi İSTEMCİDE KARAR VERİLMEZ (playbook §3.1): arayüz kullanıcının
 * rolüne bakıp isteği engellemez, isteği yapar ve backend 403 dönerse
 * açıklar.
 *
 * 401 burada ele alınmaz; ApiClient merkezî olarak token'ı siler ve
 * oturumu düşürür.
 */

export const AUDIT_OWNER_ONLY = 'Bu bölüm yalnızca şirket sahiplerine açıktır.';
export const AUDIT_UNEXPECTED = 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

export function auditErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isForbidden) return AUDIT_OWNER_ONLY;

    // 500 için backend metni KULLANILMAZ: production'da "Server Error"
    // gelir ve kullanıcıya hiçbir şey anlatmaz.
    if (error.isServerError) return AUDIT_UNEXPECTED;

    // 422 yalnızca `per_page` geçersizse doğar ve arayüz `per_page`
    // göndermez — yani normal kullanımda hiç görülmez. Yine de
    // maskelenmez: maskelenirse, bir gün gerçekten olduğunda kimse
    // sebebini öğrenemez.
    return error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return AUDIT_UNEXPECTED;
}
