import { ApiError, NetworkError } from '@/lib/api';
import type { InvitationStatus } from '@/types/api';

/**
 * Davet ekranlarının hata metinleri.
 *
 * 410 GONE BU FAZIN YENİ DURUMU. Customer ve Team'de hiç karşılaşmadık.
 * Backend, kullanılamayan bir daveti iptal etmeye çalışıldığında ÜÇ AYRI
 * KOD taşır (InvitationException::notUsable):
 *
 *   invitation_revoked  → zaten iptal edilmiş
 *   invitation_accepted → zaten kabul edilmiş
 *   invitation_expired  → süresi dolmuş
 *
 * Üçünü "davet artık geçerli değil" diye birleştirmek kolaydı ama
 * kullanıcı için sonuçları farklı: kabul edilmişse kişi zaten ekipte,
 * süresi dolmuşsa yeniden davet göndermesi gerekiyor.
 *
 * 403 Team ile aynı anlamda: uçlar owner'a özeldir. Bu bilgi İSTEMCİDE
 * KARAR VERİLMEZ — istek yapılır, backend 403 dönerse açıklanır
 * (playbook §3.1).
 */

export const INVITATION_NOT_FOUND = 'Davet bulunamadı.';
export const OWNER_ONLY_SECTION = 'Bu bölüm yalnızca şirket sahiplerine açıktır.';

/** 410'un üç sebebi — backend'in makine-okunur kodlarına karşılık. */
const GONE_MESSAGES: Record<string, string> = {
  invitation_revoked: 'Bu davet zaten iptal edilmiş.',
  invitation_accepted: 'Bu davet zaten kabul edilmiş.',
  invitation_expired: 'Bu davetin süresi dolmuş.',
};

/** Durum rozetlerinin Türkçe karşılığı. */
const STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: 'Bekliyor',
  accepted: 'Kabul edildi',
  revoked: 'İptal edildi',
  expired: 'Süresi doldu',
};

export function invitationStatusLabel(status: InvitationStatus): string {
  return STATUS_LABELS[status];
}

export function invitationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNotFound) return INVITATION_NOT_FOUND;
    if (error.isForbidden) return OWNER_ONLY_SECTION;

    // 410: koda göre ayrıştırılır. Tanınmayan bir kod gelirse backend'in
    // kendi mesajı gösterilir — sessizce genel bir metne düşmek, yeni
    // eklenmiş bir sebebi görünmez kılardı.
    if (error.status === 410) {
      return (error.code && GONE_MESSAGES[error.code]) ?? error.message;
    }

    // 422: hem alan hataları hem de invitation_already_member buraya
    // düşer. İkincisinde `errors` gelmez; mesaj form seviyesinde gösterilir.
    if (error.isValidation) return error.message;

    // 500 için backend metni KULLANILMAZ: production'da "Server Error"
    // gelir ve kullanıcıya hiçbir şey anlatmaz.
    if (error.isServerError) return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

    return error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';
}

/** 422 alan hatası; `invitation_already_member` için undefined döner. */
export function invitationFieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError && error.isValidation ? error.fieldError(field) : undefined;
}
