import { ApiError, NetworkError } from '@/lib/api';

/**
 * Ekip ekranlarının hata metinleri.
 *
 * Customer'ın TERSİ bir 403 anlamı var ve bu ayrımı kaybetmemek önemli:
 *
 *   Customer: 403 = "aktif şirket yok / üyelik iptal". Rol kısıtı DEĞİL.
 *   Team:     403 = ROL kısıtı. CompanyMemberPolicy → Role::managesMembers()
 *             → owner. Member rolündeki kullanıcı viewAny dahil her şeyde
 *             403 alır.
 *
 * Bu yüzden burada kullanıcıya "yalnızca şirket sahiplerine açık" demek
 * doğrudur. AMA bu bilgi İSTEMCİDE KARAR VERİLMEZ (playbook §3.1):
 * arayüz rolüne bakıp isteği engellemez, isteği yapar ve backend 403
 * dönerse açıklar. Aksi hâlde yetki kuralı iki ayrı yerde tanımlı olur
 * ve zamanla ayrışır.
 *
 * Laravel'in ham "This action is unauthorized." metni kullanıcıya
 * gösterilmez: İngilizce ve hiçbir şey anlatmıyor.
 */

export const MEMBER_NOT_FOUND = 'Üye bulunamadı.';
export const OWNER_ONLY_SECTION = 'Bu bölüm yalnızca şirket sahiplerine açıktır.';
export const CANNOT_REMOVE_SELF = 'Kendinizi ekipten çıkaramazsınız.';

/** Son owner kuralının backend'deki makine-okunur kodu. */
export const LAST_OWNER_CODE = 'company_requires_an_owner';

/**
 * Genel (liste/detay/düzenleme) hata metni.
 *
 * 403 burada rol kısıtıdır; kendini çıkarma gibi FİİL'e özgü 403'ler
 * için `removeErrorMessage` kullanılır.
 */
export function memberErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNotFound) return MEMBER_NOT_FOUND;
    if (error.isForbidden) return OWNER_ONLY_SECTION;

    // Son owner kuralı: yetki sorunu DEĞİL (422). İsteği yapanın yetkisi
    // tamdır, ama işlem şirketi ownersız bırakırdı. Backend'in mesajı
    // kullanıcıya uygun; olduğu gibi gösterilir.
    if (error.isValidation) return error.message;

    if (error.isServerError) return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

    return error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';
}

/**
 * Ekipten çıkarma fiiline özgü hata metni.
 *
 * Buradaki 403 "bölüm sahiplere açık" demek DEĞİLDİR — kullanıcı zaten
 * owner, aksi hâlde detayı bile göremezdi. Policy, kendini çıkarma
 * kontrolünü yetki kontrolünden ÖNCE yapar ve 403 döner.
 */
export function removeErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.isForbidden) return CANNOT_REMOVE_SELF;

  return memberErrorMessage(error);
}

/** 422 alan hatası; son owner kuralında `errors` gelmez, undefined döner. */
export function memberFieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError && error.isValidation ? error.fieldError(field) : undefined;
}
