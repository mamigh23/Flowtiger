import '../../core/network/api_exception.dart';

/// Müşteri ekranlarının hata metinleri — web'deki customerErrors.ts ile
/// birebir aynı kurallar.
///
/// İKİ KURAL:
///
/// 1. 404 "bulunamadı"dır, "yetkiniz yok" DEĞİL. Backend başka tenant'ın
///    müşterisini bilerek 404 ile gizler (403 değil) — "bu id'de bir kayıt
///    var ama senin değil" bilgisi bile sızıntıdır. Arayüz "yetkiniz yok"
///    derse backend'in sakladığı bilgiyi geri sızdırır.
///
/// 2. 403 ROL kısıtı DEĞİLDİR. CustomerPolicy rol ayrımı yapmaz; owner da
///    member da tüm CRUD'u yapabilir. 403 yalnızca "aktif şirket yok ya da
///    üyelik iptal edilmiş" demektir, bu yüzden backend'in kendi metni
///    olduğu gibi gösterilir; rol diline çevrilmez.
const String customerNotFound = 'Müşteri bulunamadı.';

String customerErrorMessage(Object? error) {
  if (error is ApiException) {
    if (error.isNotFound) return customerNotFound;

    // 500 için backend metni KULLANILMAZ: production'da "Server Error"
    // gelir ve kullanıcıya hiçbir şey anlatmaz.
    return error.userMessage;
  }

  if (error is NetworkException) return error.userMessage;

  return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';
}

/// 422 alan hatası; başka durumlarda null.
String? customerFieldError(Object? error, String field) {
  if (error is ApiException && error.isValidation) return error.fieldError(field);
  return null;
}

bool isCustomerNotFound(Object? error) => error is ApiException && error.isNotFound;
