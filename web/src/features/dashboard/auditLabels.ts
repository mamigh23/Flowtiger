/**
 * Audit action kodlarının okunabilir karşılıkları.
 *
 * Backend'in AuditAction enum'ıyla birebir eşleşir. Eşleşmeyen bir kod
 * geldiğinde ham değer gösterilir — uydurma bir metin üretmek, olayı
 * yanlış anlatmaktan iyidir.
 */
const LABELS: Record<string, string> = {
  'login.success': 'Giriş yapıldı',
  'login.failed': 'Başarısız giriş denemesi',
  logout: 'Çıkış yapıldı',

  'profile.updated': 'Profil güncellendi',
  'email.changed': 'E-posta değiştirildi',
  'email.verification_requested': 'Doğrulama bağlantısı istendi',
  'email.verified': 'E-posta doğrulandı',
  'password.changed': 'Parola değiştirildi',
  'password.reset.requested': 'Parola sıfırlama istendi',
  'password.reset.completed': 'Parola sıfırlandı',
  'session.revoked': 'Oturum kapatıldı',
  'sessions.revoked_others': 'Diğer oturumlar kapatıldı',

  'company.selected': 'Şirket seçildi',

  'member.created': 'Üye eklendi',
  'member.updated': 'Üye güncellendi',
  'member.removed': 'Üye çıkarıldı',
  'member.role_changed': 'Üye rolü değiştirildi',

  'invitation.created': 'Davet gönderildi',
  'invitation.revoked': 'Davet iptal edildi',
  'invitation.accepted': 'Davet kabul edildi',

  'customer.created': 'Müşteri oluşturuldu',
  'customer.updated': 'Müşteri güncellendi',
  'customer.deleted': 'Müşteri silindi',
};

export function auditActionLabel(action: string): string {
  return LABELS[action] ?? action;
}

/** Basit göreli zaman — ek bağımlılık getirmeden. */
export function relativeTime(isoDate: string | null): string {
  if (!isoDate) return '';

  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return '';

  const diffSeconds = Math.round((Date.now() - then) / 1000);

  if (diffSeconds < 60) return 'az önce';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} dk önce`;
  if (diffSeconds < 86_400) return `${Math.floor(diffSeconds / 3600)} sa önce`;

  return `${Math.floor(diffSeconds / 86_400)} gün önce`;
}
