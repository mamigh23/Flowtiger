import '../../core/network/api_exception.dart';

/// Profil ve güvenlik ekranlarının hata metinleri — web'deki
/// `toUserMessage()` ile aynı kurallar.
///
/// BU UÇLARIN HİÇBİRİ OWNER-ONLY DEĞİLDİR. Kullanıcı kendi kaydını
/// yönetiyor; yetkilendirilecek bir "başkası" kavramı hiç oluşmuyor. Bu
/// yüzden burada 403'e karşılık gelen özel bir metin YOKTUR — olmayan bir
/// duruma metin yazmak, bir gün yanlış yerde gösterilecek bir metin
/// yazmaktır.
///
/// YANLIŞ MEVCUT PAROLA 422'DİR, 401 DEĞİL. Bu ayrım hayatidir:
/// kullanıcının kimliği doğrulanmış durumda, hatalı olan tek şey
/// gönderdiği alan. Burada hiçbir yerde oturum kapatılmaz; 401 zaten
/// merkezî olarak ApiClient'ta ele alınır.
///
/// `userMessage` üç işi birden yapar ve yeniden yazılmaz:
///   500 → maskelenir (production'da "Server Error" gelir)
///   429 → backend'in Retry-After başlığındaki saniyeyi kullanır
///   422 → backend'in kendi mesajını olduğu gibi geçirir
const String profileUnexpectedError = 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

String profileErrorMessage(Object? error) {
  if (error is ApiException) return error.userMessage;
  if (error is NetworkException) return error.userMessage;

  return profileUnexpectedError;
}

/// 422 alan hatası; başka durumlarda null döner.
String? profileFieldError(Object? error, String field) {
  if (error is ApiException && error.isValidation) return error.fieldError(field);
  return null;
}
