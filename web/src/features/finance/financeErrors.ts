import { ApiError, NetworkError } from '@/lib/api';

/**
 * Finans ekranlarının hata metinleri.
 *
 * ÜÇ DURUM BİRBİRİNE ÇEVRİLMEZ:
 *
 * 1. 404 "bulunamadı"dır. Başka tenant'ın kaydı da 404 döner (403 değil):
 *    route model binding sorgusu CompanyScope'un altından geçer ve kayıt
 *    hiç bulunmaz. "Yetkiniz yok" demek, backend'in bilerek sakladığı
 *    "bu id'de bir kayıt var" bilgisini geri sızdırırdı.
 *
 * 2. 403 GERÇEKTEN rol kısıtıdır: FinanceEntryPolicy owner-only
 *    (Role::viewsFinance / managesFinance). Kayıt vardır, kullanıcı da
 *    şirketin üyesidir; eksik olan yalnızca yetkidir. Ama bu bilgi
 *    İSTEMCİDE KARAR VERİLMEZ (playbook §3.1): arayüz kullanıcının rolüne
 *    bakıp isteği engellemez, isteği yapar ve backend 403 dönerse açıklar.
 *
 * 3. 422 iş kuralıdır. FinanceEntryException'ın metinleri kullanıcıya
 *    gösterilmek üzere yazılmıştır ve hiçbir iç ayrıntı içermez; bu yüzden
 *    OLDUĞU GİBİ gösterilir. Backend'in makine-okunur kodları burada
 *    yeniden adlandırılmaz — `code` neyse odur.
 *
 * 500 için backend metni KULLANILMAZ: production'da "Server Error" gelir
 * ve kullanıcıya hiçbir şey anlatmaz.
 *
 * 401 burada ele alınmaz; ApiClient merkezî olarak token'ı siler ve
 * AuthContext oturumu düşürür.
 */

export const FINANCE_NOT_FOUND = 'Finans kaydı bulunamadı.';
export const FINANCE_OWNER_ONLY = 'Bu bölüm yalnızca şirket sahiplerine açıktır.';
export const FINANCE_UNEXPECTED = 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

/**
 * Backend'in makine-okunur kodları.
 *
 * Yeniden adlandırılmadan, olduğu gibi taşınırlar. Arayüz bunlara göre
 * KARAR verir (string eşleştirmesi yapmaz); metin backend'den gelir.
 */
export const FINANCE_ENTRY_VOIDED = 'finance_entry_voided';
export const FINANCE_ENTRY_ALREADY_VOIDED = 'finance_entry_already_voided';

/**
 * İptal edilmiş kaydın düzenlenemeyeceğini söyleyen metin.
 *
 * Backend'in `FinanceEntryException::voided()` metniyle AYNI cümledir ve
 * bu bilinçlidir: kullanıcı aynı kuralı iki farklı yerde iki farklı
 * cümleyle duymamalı. Arayüz bu durumu isteği yapmadan ÖNCE de bilir
 * (kayıtta `voided_at` doludur), o yüzden metin burada da bulunmak
 * zorunda.
 */
export const FINANCE_ENTRY_VOIDED_MESSAGE = 'İptal edilmiş bir finans kaydı değiştirilemez.';

export function financeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNotFound) return FINANCE_NOT_FOUND;
    if (error.isForbidden) return FINANCE_OWNER_ONLY;
    if (error.isServerError) return FINANCE_UNEXPECTED;

    // 422 (hem alan doğrulaması hem iş kuralı) ve 429: backend'in metni.
    return error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return FINANCE_UNEXPECTED;
}

/** 422 alan hatası; başka durumlarda undefined. */
export function fieldErrorOf(error: unknown, field: string): string | undefined {
  return error instanceof ApiError && error.isValidation ? error.fieldError(field) : undefined;
}
