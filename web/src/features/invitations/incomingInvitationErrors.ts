import { ApiError, toUserMessage } from '@/lib/api';

/**
 * GELEN DAVETLER ekranının hata metinleri.
 *
 * `invitationErrors.ts` (owner listesi) BİLEREK yeniden kullanılmadı: o
 * dosya HER 403'ü "Bu bölüm yalnızca şirket sahiplerine açıktır." diye
 * okur. Bu doğrudur çünkü o ekranlar gerçekten owner-only'dir. Buradaki
 * 403 ise TAMAMEN BAŞKA bir anlam taşır: e-posta doğrulanmamış. İki
 * farklı 403'ü tek metne indirmek, kullanıcıya yapması gereken şeyi
 * yanlış söylerdi.
 *
 * `invitationAcceptErrors.ts` (token ile kabul) de yeniden kullanılmadı:
 * oradaki 403 sebepleri token akışına özgüdür
 * (invitation_requires_authentication, invitation_email_mismatch) ve bu
 * uçlarda hiç oluşmaz. Burada oluşabilecek tek 403 doğrulama kapısıdır.
 *
 * KARAR `code` ALANINA GÖRE VERİLİR, METİN EŞLEŞTİRİLEREK DEĞİL:
 * backend metni bir gün değişebilir; metne bakan bir arayüz o gün sessizce
 * yanlış davranır.
 *
 * 404 ve 410 SEMANTİK OLARAK AYRIDIR ve ayrı kalmalıdır:
 *   404 → davet YOK ya da BAŞKASININ. Sunucu ikisini bilinçli olarak
 *         ayırt etmez, dolayısıyla istemci de "senin değil" diyemez.
 *   410 → davet VARDI, artık kullanılamaz (iptal / kabul edilmiş /
 *         süresi dolmuş). Kullanıcının kendi davetidir ve neden
 *         kabul edilemediği söylenmelidir.
 */

/** Doğrulama kapısı — 403 + email_verification_required. */
export const EMAIL_VERIFICATION_REQUIRED = 'email_verification_required';

const GONE_MESSAGES: Record<string, string> = {
  invitation_revoked: 'Bu davet iptal edilmiş.',
  invitation_accepted: 'Bu daveti zaten kabul ettiniz.',
  invitation_expired: 'Bu davetin süresi dolmuş.',
};

/**
 * Kullanılamaz davet için gösterilecek metin.
 *
 * Tanınmayan bir kod gelirse backend'in kendi mesajı gösterilir —
 * sessizce genel bir metne düşmek, yeni eklenmiş bir sebebi görünmez
 * kılardı.
 */
export function unusableInvitationMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 410) {
    return (error.code && GONE_MESSAGES[error.code]) ?? error.message;
  }

  if (error instanceof ApiError && error.isNotFound) {
    return 'Bu davet artık kullanılamıyor.';
  }

  return toUserMessage(error);
}

/**
 * Liste isteğinin hatası.
 *
 * 403 DOĞRULAMA KAPISIDIR, yetki eksikliği değil. Çağıran bunu ayrıca
 * `isEmailVerificationRequired` ile ayırt edip doğrulama akışını
 * gösterir; bu metin yalnızca o akışın başlığı olarak kullanılır.
 */
export function incomingListErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.isForbidden) {
    return 'Gelen davetlerinizi görmek için önce e-posta adresinizi doğrulamanız gerekiyor.';
  }

  return toUserMessage(error);
}

/** 403 + email_verification_required mı? Ekranın doğrulama dalını bu belirler. */
export function isEmailVerificationRequired(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.isForbidden &&
    error.code === EMAIL_VERIFICATION_REQUIRED
  );
}

/** Başarılı kabulden sonra gösterilen doğrulama adımı metinleri. */
export const VERIFICATION_SENT =
  'Doğrulama bağlantısı e-posta adresinize gönderildi. Bağlantıya tıkladıktan sonra aşağıdaki düğmeyle devam edin.';
export const VERIFICATION_ALREADY_DONE = 'E-posta adresiniz zaten doğrulanmış.';
