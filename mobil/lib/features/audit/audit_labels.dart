/// Denetim kaydı eylem kodlarının okunabilir karşılıkları.
///
/// BU DOSYA features/dashboard'dan BURAYA TAŞINDI (kopyalanmadı). Panel
/// son hareket akışında, denetim ekranı tam listede aynı etiketleri
/// kullanıyor; iki kopya tutmak, bir gün yalnızca birinin güncellenmesi
/// demekti.
///
/// TAŞIMA SIRASINDA GERÇEK BİR KUSUR DÜZELTİLDİ. Önceki mobil tablo,
/// backend'de HİÇ OLMAYAN kodlar içeriyordu — 'auth.login',
/// 'auth.logout', 'auth.password_changed', 'member.invited',
/// 'member.joined', 'company.created', 'company.updated' — ve gerçekten
/// gelen on iki kodu kaçırıyordu. Sonuç: panelde bazı hareketler ham kod
/// olarak görünüyordu. Aşağıdaki liste backend'in AuditAction enum'ıyla
/// BİREBİR aynıdır (23 değer).
///
/// Eşleşmeyen bir kod GİZLENMEZ — ham hâliyle gösterilir. Uydurma bir
/// metin üretmek, olayı yanlış anlatmaktan iyidir; hiç göstermemek ise
/// yeni bir eylem türü eklendiğinde kullanıcının hareketi hiç
/// görememesi demek olurdu.
library;

const Map<String, String> _labels = <String, String>{
  'login.success': 'Giriş yapıldı',
  'login.failed': 'Başarısız giriş denemesi',
  'logout': 'Çıkış yapıldı',

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

String auditActionLabel(String action) => _labels[action] ?? action;

/// `auditable.type` kısa adının okunur karşılığı.
///
/// Tanınmayan bir tür ham hâliyle gösterilir; eylem kodunda olduğu gibi
/// burada da uydurma bir metin üretilmez.
const Map<String, String> _auditableTypes = <String, String>{
  'customer': 'Müşteri',
  'user': 'Kullanıcı',
  'company': 'Şirket',
  'invitation': 'Davet',
};

String auditableTypeLabel(String type) => _auditableTypes[type] ?? type;

/// Denetim listesinde MUTLAK zaman kullanılır, göreli değil.
///
/// Panelde "3 sa önce" yeterlidir çünkü soru "son ne oldu"dur. Denetimde
/// soru "bu tam olarak ne zaman oldu"dur; bir olayı raporlamak ya da
/// başka bir kayıtla eşleştirmek göreli ifadeyle yapılamaz.
///
/// Intl KULLANILMIYOR: yerelleştirme paketinin kurulumu ve ICU verisi
/// ortama göre değişir; biçim burada belirlenirse her ortamda aynıdır.
///
/// Bozuk ya da eksik tarihte null döner — çağıran taraf belirsizlik
/// işareti gösterir, uydurma bir tarih değil.
String? formatDateTime(String? isoDate) {
  if (isoDate == null) return null;

  final DateTime? parsed = DateTime.tryParse(isoDate);
  if (parsed == null) return null;

  final DateTime local = parsed.toLocal();

  String pad(int value) => value.toString().padLeft(2, '0');

  return '${pad(local.day)}.${pad(local.month)}.${local.year} '
      '${pad(local.hour)}:${pad(local.minute)}';
}
