/// Denetim kaydı eylem kodlarının okunabilir karşılıkları.
///
/// Backend makine-okunur kodlar döndürür (customer.created). Kullanıcıya
/// bu kodlar gösterilmez. Eşleşmeyen bir kod GİZLENMEZ — ham hâliyle
/// gösterilir; aksi hâlde yeni bir eylem türü eklendiğinde kullanıcı
/// hareketin olduğunu hiç göremezdi.
const Map<String, String> _labels = <String, String>{
  'customer.created': 'Müşteri oluşturuldu',
  'customer.updated': 'Müşteri güncellendi',
  'customer.deleted': 'Müşteri silindi',
  'member.invited': 'Üye davet edildi',
  'member.joined': 'Üye katıldı',
  'member.removed': 'Üye çıkarıldı',
  'member.role_changed': 'Üye rolü değiştirildi',
  'invitation.created': 'Davet gönderildi',
  'invitation.accepted': 'Davet kabul edildi',
  'invitation.revoked': 'Davet iptal edildi',
  'auth.login': 'Giriş yapıldı',
  'auth.logout': 'Çıkış yapıldı',
  'auth.password_changed': 'Parola değiştirildi',
  'company.created': 'Şirket oluşturuldu',
  'company.updated': 'Şirket güncellendi',
  'session.revoked': 'Oturum sonlandırıldı',
};

String auditActionLabel(String action) => _labels[action] ?? action;
