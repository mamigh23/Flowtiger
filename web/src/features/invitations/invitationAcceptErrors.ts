import { ApiError, toUserMessage } from '@/lib/api';

/**
 * Davet KABUL ekranının hata metinleri.
 *
 * `invitationErrors.ts`'teki `invitationErrorMessage` BİLEREK yeniden
 * kullanılmadı: o fonksiyon HER 403'ü "Bu bölüm yalnızca şirket
 * sahiplerine açıktır." diye okur — bu doğrudur çünkü o ekranlar
 * (liste/iptal) gerçekten owner-only'dir. Kabul ucu owner-only DEĞİLDİR;
 * kendi 403'lerinin anlamı tamamen farklıdır (bkz. aşağı).
 *
 * 410 GONE üç sebep taşır (InvitationException::notUsable, aynı liste/
 * iptal ekranlarındaki gibi):
 *
 *   invitation_revoked  → zaten iptal edilmiş
 *   invitation_accepted → zaten kabul edilmiş
 *   invitation_expired  → süresi dolmuş
 *
 * 403 KABUL UCUNA ÖZGÜ İKİ AYRI SEBEP taşır (InvitationController::accept,
 * InvitationService::resolveAcceptingUser):
 *
 *   invitation_requires_authentication → davet edilen e-postanın zaten
 *     bir hesabı var; sahibi ÖNCE o hesapla giriş yapmalı. Sızmış bir
 *     davet linkinin, hesap sahibinden habersiz o hesabı bir şirkete
 *     bağlamasını engelleyen kural.
 *   invitation_email_mismatch → giriş yapmış kullanıcının e-postası
 *     davetinkiyle uyuşmuyor.
 *
 * Bu ikisini "yetkin yok" gibi TEK bir mesaja indirmek yanlış olurdu:
 * biri "önce giriş yap" derken diğeri "bu davet sana ait değil" der —
 * kullanıcının yapması gereken şey ikisinde de farklı (§ 403/404
 * ayrımını bozma).
 *
 * 422: hem alan hataları (token/name/password) hem de
 * `invitation_already_member` buraya düşer. İkincisinde `errors` gelmez;
 * mesaj form seviyesinde gösterilir (bkz. AcceptInvitationPage).
 */

const GONE_MESSAGES: Record<string, string> = {
  invitation_revoked: 'Bu davet zaten iptal edilmiş.',
  invitation_accepted: 'Bu davet zaten kabul edilmiş.',
  invitation_expired: 'Bu davetin süresi dolmuş.',
};

const FORBIDDEN_MESSAGES: Record<string, string> = {
  invitation_requires_authentication:
    'Bu e-postanın zaten bir hesabı var. Daveti kabul etmek için önce o hesapla giriş yapın.',
  invitation_email_mismatch: 'Bu davet başka bir e-posta adresi için oluşturulmuş.',
};

export const ACCEPT_INVITATION_NOT_FOUND = 'Davet bulunamadı.';

export function acceptInvitationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNotFound) return ACCEPT_INVITATION_NOT_FOUND;

    // 410: koda göre ayrıştırılır. Tanınmayan bir kod gelirse backend'in
    // kendi mesajı gösterilir — sessizce genel bir metne düşmek, yeni
    // eklenmiş bir sebebi görünmez kılardı.
    if (error.status === 410) {
      return (error.code && GONE_MESSAGES[error.code]) ?? error.message;
    }

    // 403: owner-only mesajı DEĞİL — bu ucun kendi iki sebebi.
    if (error.isForbidden) {
      return (error.code && FORBIDDEN_MESSAGES[error.code]) ?? error.message;
    }

    // 422: alan hataları çağıran tarafta ayrıca okunur; form seviyesi
    // için (ör. invitation_already_member) backend mesajı kullanılır.
    if (error.isValidation) return error.message;
  }

  // Ağ hatası, 429, 5xx: merkezi kurallar (§ tekrarlanmaz).
  return toUserMessage(error);
}

/** 422 alan hatası; `invitation_already_member` için undefined döner. */
export function acceptInvitationFieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError && error.isValidation ? error.fieldError(field) : undefined;
}
