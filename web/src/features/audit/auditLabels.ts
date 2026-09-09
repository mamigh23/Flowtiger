/**
 * Audit action kodlarının okunabilir karşılıkları.
 *
 * Backend'in AuditAction enum'ıyla birebir eşleşir. Eşleşmeyen bir kod
 * geldiğinde ham değer gösterilir — uydurma bir metin üretmek, olayı
 * yanlış anlatmaktan iyidir.
 *
 * BU DOSYA features/dashboard'dan BURAYA TAŞINDI (kopyalanmadı).
 * Panel son etkinlik akışında, denetim ekranı ise tam listede aynı
 * etiketleri kullanıyor. İki kopya tutmak, bir gün yalnızca birinin
 * güncellenmesi demekti.
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

  'company.created': 'Şirket oluşturuldu',
  'company.selected': 'Şirket seçildi',
  'company.billing_updated': 'Şirket fatura bilgileri güncellendi',

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
  'customer.billing_updated': 'Müşteri fatura bilgileri güncellendi',

  /*
   * Finans ve ödeme.
   *
   * `voided` "silindi" DEĞİL "iptal edildi"dir ve öyle yazılmalıdır:
   * kayıt yerinde duruyor, yalnızca mali geçerliliği sona erdi. "Silindi"
   * demek, bir denetimde olayı yanlış anlatmak olurdu.
   */
  'finance_entry.created': 'Finans kaydı oluşturuldu',
  'finance_entry.updated': 'Finans kaydı güncellendi',
  'finance_entry.voided': 'Finans kaydı iptal edildi',

  'payment.created': 'Yeni ödeme oluşturuldu',
  'payment.updated': 'Ödeme güncellendi',
  'payment.voided': 'Ödeme iptal edildi',

  'task.deleted': 'Görev silindi',
};

export function auditActionLabel(action: string): string {
  return LABELS[action] ?? action;
}

/**
 * Eylemin AİT OLDUĞU ALAN — akışta görsel ayrım için.
 *
 * Panel bir tabloya dönüşmeden, "para" ile "kimlik" olaylarını gözle
 * ayırmaya yarar. RENK TEK BAŞINA TAŞIYICI DEĞİL: eylem adı zaten metin
 * olarak orada; ton yalnızca göz taramasını hızlandırır (WCAG 1.4.1).
 *
 * Tanınmayan kod 'other' döner — uydurma bir sınıflandırma, olayı yanlış
 * gruplamaktan iyidir.
 */
export type AuditTone = 'auth' | 'team' | 'customer' | 'money' | 'task' | 'other';

export function auditActionTone(action: string): AuditTone {
  if (action.startsWith('payment.') || action.startsWith('finance_entry.')) return 'money';
  if (action.startsWith('customer.')) return 'customer';
  if (action.startsWith('member.') || action.startsWith('invitation.')) return 'team';
  if (action.startsWith('task.')) return 'task';

  if (
    action.startsWith('login.') ||
    action === 'logout' ||
    action.startsWith('password.') ||
    action.startsWith('email.') ||
    action.startsWith('session') ||
    action === 'profile.updated'
  ) {
    return 'auth';
  }

  return 'other';
}

/**
 * Tonun dekoratif işareti.
 *
 * `aria-hidden` bir süs: anlamı taşıyan şey eylemin adıdır. Simgeler
 * kenar çubuğununkilerle aynı ailedendir — aynı şey iki farklı işaretle
 * anlatılmasın.
 */
const TONE_GLYPHS: Record<AuditTone, string> = {
  auth: '⌂',
  team: '◎',
  customer: '☺',
  money: '₺',
  task: '✓',
  other: '◈',
};

export function auditActionGlyph(action: string): string {
  return TONE_GLYPHS[auditActionTone(action)];
}

/**
 * `auditable.type` kısa adının okunur karşılığı.
 *
 * Backend sınıf yolunu DEĞİL kısa adı gönderir ('customer', 'user').
 * Tanınmayan bir tür ham hâliyle gösterilir; eylem kodunda olduğu gibi
 * burada da uydurma bir metin üretilmez.
 */
const AUDITABLE_TYPES: Record<string, string> = {
  customer: 'Müşteri',
  user: 'Kullanıcı',
  company: 'Şirket',
  invitation: 'Davet',
};

export function auditableTypeLabel(type: string): string {
  return AUDITABLE_TYPES[type] ?? type;
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

/**
 * Denetim listesinde MUTLAK zaman kullanılır, göreli değil.
 *
 * Panelde "3 sa önce" yeterlidir çünkü soru "son ne oldu"dur. Denetimde
 * soru "bu tam olarak ne zaman oldu"dur; bir olayı raporlamak ya da
 * başka bir kayıtla eşleştirmek göreli ifadeyle yapılamaz.
 *
 * Intl KULLANILMIYOR: Node'un ICU derlemesi ortama göre değişir ve
 * tr-TR desteği olmayan bir derlemede sessizce en-US biçimine düşer.
 * Biçim burada belirlenirse her ortamda aynıdır.
 */
export function formatDateTime(isoDate: string | null): string | null {
  if (!isoDate) return null;

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (value: number): string => String(value).padStart(2, '0');

  return (
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
