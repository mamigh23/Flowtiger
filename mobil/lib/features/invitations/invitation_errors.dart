import '../../core/network/api_exception.dart';
import '../../models/models.dart';

/// Davet ekranlarının hata metinleri — web'deki invitationErrors.ts ile
/// birebir aynı kurallar.
///
/// 410 GONE bu fazın yeni durumu. Backend, kullanılamayan bir daveti
/// iptal etmeye çalışıldığında ÜÇ AYRI KOD taşır
/// (InvitationException::notUsable):
///
///   invitation_revoked  → zaten iptal edilmiş
///   invitation_accepted → zaten kabul edilmiş
///   invitation_expired  → süresi dolmuş
///
/// Üçünü "davet artık geçerli değil" diye birleştirmek kolaydı ama
/// kullanıcı için sonuçları farklı: kabul edilmişse kişi zaten ekipte,
/// süresi dolmuşsa yeniden davet göndermesi gerekiyor.
///
/// 403 Team ile aynı anlamda: uçlar owner'a özeldir. Bu bilgi İSTEMCİDE
/// KARAR VERİLMEZ — istek yapılır, backend 403 dönerse açıklanır.
const String invitationNotFound = 'Davet bulunamadı.';
const String ownerOnlySection = 'Bu bölüm yalnızca şirket sahiplerine açıktır.';

/// 410'un üç sebebi — backend'in makine-okunur kodlarına karşılık.
const Map<String, String> _goneMessages = <String, String>{
  'invitation_revoked': 'Bu davet zaten iptal edilmiş.',
  'invitation_accepted': 'Bu davet zaten kabul edilmiş.',
  'invitation_expired': 'Bu davetin süresi dolmuş.',
};

/// Durum rozetlerinin Türkçe karşılığı.
String invitationStatusLabel(InvitationStatus status) => switch (status) {
      InvitationStatus.pending => 'Bekliyor',
      InvitationStatus.accepted => 'Kabul edildi',
      InvitationStatus.revoked => 'İptal edildi',
      InvitationStatus.expired => 'Süresi doldu',
    };

String invitationErrorMessage(Object? error) {
  if (error is ApiException) {
    if (error.isNotFound) return invitationNotFound;
    if (error.isForbidden) return ownerOnlySection;

    // 410: koda göre ayrıştırılır. Tanınmayan bir kod gelirse backend'in
    // kendi mesajı gösterilir — sessizce genel bir metne düşmek, yeni
    // eklenmiş bir sebebi görünmez kılardı.
    if (error.statusCode == 410) {
      final String? code = error.code;
      return (code == null ? null : _goneMessages[code]) ?? error.message;
    }

    // 422 hem alan hatalarını hem invitation_already_member'ı taşır;
    // userMessage 500'ü maskeler, 422'yi olduğu gibi geçirir.
    return error.userMessage;
  }

  if (error is NetworkException) return error.userMessage;

  return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';
}

/// 422 alan hatası; `invitation_already_member` için null döner.
String? invitationFieldError(Object? error, String field) {
  if (error is ApiException && error.isValidation) return error.fieldError(field);
  return null;
}
