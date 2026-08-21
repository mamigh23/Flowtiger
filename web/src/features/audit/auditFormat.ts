import { roleLabel } from '@/lib/company/roleLabel';

/**
 * Denetim ayrıntısının GÖRÜNÜRLÜK KURALLARI.
 *
 * Audit kaydı üç serbest biçimli sözlük taşır: `metadata`, `old_values`,
 * `new_values`. İçerikleri eyleme göre değişir ve zamanla genişler. Bu
 * yüzden burada BEYAZ LİSTE vardır, kara liste değil:
 *
 *   kara liste  → yeni eklenen bir alanı varsayılan olarak GÖSTERİR
 *   beyaz liste → yeni eklenen bir alanı varsayılan olarak GİZLER
 *
 * BACKEND ZATEN TEMİZLİYOR (AuditLogService::filterSensitive): parola,
 * token, secret, authorization, cookie, session, credential, api_key,
 * private_key, signature, otp içeren anahtarlar YAZILMADAN önce
 * düşürülür; `email` ise tek yönlü `email_hash`e çevrilir.
 *
 * Buradaki liste o temizliğin yerine geçmez, ÜSTÜNE gelir ve farklı bir
 * amaca hizmet eder:
 *
 *   backend  → sır sızmasın                (güvenlik)
 *   burada   → anlamsız veri gösterilmesin (netlik) + ikinci savunma
 *
 * `email_hash` bunun en iyi örneği: sızıntı değildir, ama kullanıcıya
 * 64 karakterlik bir sha256 göstermek hiçbir şey anlatmaz.
 *
 * HAM JSON HİÇBİR YERDE BASILMAZ. Ham sözlüğü ekrana dökmek, bugün
 * zararsız görünen bir alanın yarın kullanıcıya görünmesi demektir —
 * üstelik kimse bunu fark etmeden.
 */

export interface MetadataEntry {
  label: string;
  value: string;
}

export interface ChangeEntry {
  label: string;
  /** Oluşturma kaydında yoktur. */
  from: string | null;
  /** Silme kaydında yoktur. */
  to: string | null;
}

interface Field {
  key: string;
  label: string;
}

/**
 * Gösterilebilir metadata anahtarları.
 *
 * Liste backend servislerinde gerçekten yazılan anahtarlardan
 * çıkarılmıştır (InvitationService, SessionService, ProfileService,
 * PasswordResetService). `email_hash` bilerek DIŞARIDA.
 *
 * Sıra, sözlüğün rastgele anahtar sırasına değil bu diziye bağlıdır;
 * aynı olay her seferinde aynı biçimde okunur.
 */
const METADATA_FIELDS: readonly Field[] = [
  { key: 'role', label: 'Rol' },
  { key: 'device_name', label: 'Cihaz' },
  { key: 'was_current_device', label: 'Bu cihaz' },
  { key: 'created_new_account', label: 'Yeni hesap oluşturuldu' },
  { key: 'verification_reset', label: 'Doğrulama sıfırlandı' },
  { key: 'other_logins_revoked', label: 'Kapatılan diğer oturum' },
];

/**
 * old_values / new_values içinde gösterilebilir alanlar.
 *
 * `id`, `company_id`, `created_at`, `updated_at`, `email_hash` bilerek
 * dışarıda: ilki gürültü, `company_id` ise çok kiracılı bir üründe
 * kullanıcıya hiçbir şey anlatmayan bir iç yapı ayrıntısı.
 */
const VALUE_FIELDS: readonly Field[] = [
  { key: 'name', label: 'Ad' },
  { key: 'phone', label: 'Telefon' },
  { key: 'customer_no', label: 'Müşteri no' },
  { key: 'role', label: 'Rol' },
];

/**
 * Ham değeri kullanıcıya gösterilecek metne çevirir.
 *
 * `null` dönmesi "gösterilecek değer yok" demektir; `false` bir değerdir
 * ve gösterilir ("Hayır"), yokluk değildir.
 */
function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (key === 'role' && (value === 'owner' || value === 'member')) {
    return roleLabel(value);
  }

  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';

  if (typeof value === 'number') return String(value);

  if (typeof value === 'string') return value;

  // Nesne ya da dizi: beyaz listedeki bir alanın beklenmedik bir biçimde
  // gelmesi. Ham hâlini basmak yerine hiç gösterilmez.
  return null;
}

export function visibleMetadata(metadata: Record<string, unknown> | null): MetadataEntry[] {
  if (metadata === null) return [];

  const entries: MetadataEntry[] = [];

  for (const field of METADATA_FIELDS) {
    const value = formatValue(field.key, metadata[field.key]);
    if (value !== null) entries.push({ label: field.label, value });
  }

  return entries;
}

export function describeChanges(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): ChangeEntry[] {
  const changes: ChangeEntry[] = [];

  for (const field of VALUE_FIELDS) {
    const from = formatValue(field.key, oldValues?.[field.key]);
    const to = formatValue(field.key, newValues?.[field.key]);

    // Hiç yok: alan bu kayda dahil değil.
    if (from === null && to === null) continue;

    // Değişmemiş alan listelenmez. "Ad: Zeynep → Zeynep" satırı, gerçek
    // değişikliği gözden kaçırtan bir gürültüdür.
    if (from === to) continue;

    changes.push({ label: field.label, from, to });
  }

  return changes;
}

/** Ayrıntı panelinde gösterilecek bir şey var mı? */
export function hasVisibleDetails(log: {
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}): boolean {
  return (
    describeChanges(log.old_values, log.new_values).length > 0 ||
    visibleMetadata(log.metadata).length > 0
  );
}
