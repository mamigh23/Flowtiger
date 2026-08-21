import '../../models/models.dart';
import '../companies/company_select_screen.dart' show roleLabel;

/// Denetim ayrıntısının GÖRÜNÜRLÜK KURALLARI — web'deki auditFormat.ts
/// ile birebir aynı sözleşme.
///
/// Audit kaydı üç serbest biçimli sözlük taşır: `metadata`, `old_values`,
/// `new_values`. İçerikleri eyleme göre değişir ve zamanla genişler. Bu
/// yüzden burada BEYAZ LİSTE vardır, kara liste değil:
///
///   kara liste  → yeni eklenen bir alanı varsayılan olarak GÖSTERİR
///   beyaz liste → yeni eklenen bir alanı varsayılan olarak GİZLER
///
/// BACKEND ZATEN TEMİZLİYOR (AuditLogService::filterSensitive): parola,
/// token, secret, authorization, cookie, session, credential, api_key,
/// private_key, signature, otp içeren anahtarlar YAZILMADAN önce
/// düşürülür; `email` ise tek yönlü `email_hash`e çevrilir.
///
/// Buradaki liste o temizliğin yerine geçmez, ÜSTÜNE gelir ve farklı bir
/// amaca hizmet eder:
///
///   backend  → sır sızmasın                (güvenlik)
///   burada   → anlamsız veri gösterilmesin (netlik) + ikinci savunma
///
/// `email_hash` bunun en iyi örneği: sızıntı değildir, ama kullanıcıya
/// 64 karakterlik bir sha256 göstermek hiçbir şey anlatmaz.
///
/// HAM JSON HİÇBİR YERDE BASILMAZ. Ham sözlüğü ekrana dökmek, bugün
/// zararsız görünen bir alanın yarın kullanıcıya görünmesi demektir —
/// üstelik kimse fark etmeden.
class MetadataEntry {
  const MetadataEntry({required this.label, required this.value});

  final String label;
  final String value;
}

class ChangeEntry {
  const ChangeEntry({required this.label, this.from, this.to});

  final String label;

  /// Oluşturma kaydında YOKTUR. Boş tarafa "—" konmaz: olmayan bir eski
  /// değeri varmış gibi göstermek sahte bir değişim iddiasıdır.
  final String? from;

  /// Silme kaydında YOKTUR.
  final String? to;
}

class _Field {
  const _Field(this.key, this.label);

  final String key;
  final String label;
}

/// Gösterilebilir metadata anahtarları.
///
/// Liste backend servislerinde gerçekten yazılan anahtarlardan
/// çıkarılmıştır (InvitationService, SessionService, ProfileService,
/// PasswordResetService). `email_hash` bilerek DIŞARIDA.
///
/// Sıra, sözlüğün rastgele anahtar sırasına değil bu diziye bağlıdır;
/// aynı olay her seferinde aynı biçimde okunur.
const List<_Field> _metadataFields = <_Field>[
  _Field('role', 'Rol'),
  _Field('device_name', 'Cihaz'),
  _Field('was_current_device', 'Bu cihaz'),
  _Field('created_new_account', 'Yeni hesap oluşturuldu'),
  _Field('verification_reset', 'Doğrulama sıfırlandı'),
  _Field('other_logins_revoked', 'Kapatılan diğer oturum'),
];

/// old_values / new_values içinde gösterilebilir alanlar.
///
/// `id`, `company_id`, `created_at`, `updated_at`, `email_hash` bilerek
/// dışarıda: ilki gürültü, `company_id` ise çok kiracılı bir üründe
/// kullanıcıya hiçbir şey anlatmayan bir iç yapı ayrıntısı.
const List<_Field> _valueFields = <_Field>[
  _Field('name', 'Ad'),
  _Field('phone', 'Telefon'),
  _Field('customer_no', 'Müşteri no'),
  _Field('role', 'Rol'),
];

/// Ham değeri kullanıcıya gösterilecek metne çevirir.
///
/// null dönmesi "gösterilecek değer yok" demektir. `false` bir DEĞERDİR
/// ve gösterilir ("Hayır") — yokluk değildir.
String? _formatValue(String key, Object? value) {
  if (value == null) return null;

  // Rol yalnızca bilinen iki değerde çevrilir. Role.fromJson tanımadığı
  // her şeyi 'member' sayar; buraya doğrudan verilseydi bilinmeyen bir
  // rol kullanıcıya "Üye" diye gösterilirdi.
  if (key == 'role' && (value == 'owner' || value == 'member')) {
    return roleLabel(Role.fromJson(value as String));
  }

  if (value is bool) return value ? 'Evet' : 'Hayır';
  if (value is num) return value.toString();
  if (value is String) return value;

  // Nesne ya da dizi: beyaz listedeki bir alanın beklenmedik bir biçimde
  // gelmesi. Ham hâlini basmak yerine hiç gösterilmez.
  return null;
}

List<MetadataEntry> visibleMetadata(Map<String, dynamic>? metadata) {
  if (metadata == null) return const <MetadataEntry>[];

  final List<MetadataEntry> entries = <MetadataEntry>[];

  for (final _Field field in _metadataFields) {
    // `as Object?` bilinçli: strict-casts açıkken dynamic'ten örtük
    // dönüşüme güvenilmez.
    final String? value = _formatValue(field.key, metadata[field.key] as Object?);
    if (value != null) entries.add(MetadataEntry(label: field.label, value: value));
  }

  return entries;
}

List<ChangeEntry> describeChanges(
  Map<String, dynamic>? oldValues,
  Map<String, dynamic>? newValues,
) {
  final List<ChangeEntry> changes = <ChangeEntry>[];

  for (final _Field field in _valueFields) {
    final String? from = _formatValue(field.key, oldValues?[field.key] as Object?);
    final String? to = _formatValue(field.key, newValues?[field.key] as Object?);

    // Hiç yok: alan bu kayda dahil değil.
    if (from == null && to == null) continue;

    // Değişmemiş alan listelenmez. "Ad: Zeynep → Zeynep" satırı, gerçek
    // değişikliği gözden kaçırtan bir gürültüdür.
    if (from == to) continue;

    changes.add(ChangeEntry(label: field.label, from: from, to: to));
  }

  return changes;
}

/// Ayrıntı panelinde gösterilecek bir şey var mı?
///
/// Yoksa açma düğmesi HİÇ ÇIKMAZ: boş bir paneli açan düğme, kullanıcıya
/// bilgi gizlendiği izlenimi verir.
bool hasVisibleDetails(AuditLog log) =>
    describeChanges(log.oldValues, log.newValues).isNotEmpty ||
    visibleMetadata(log.metadata).isNotEmpty;
