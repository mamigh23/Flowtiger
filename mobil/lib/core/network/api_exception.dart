/// API hatalarının tek temsili.
///
/// Backend hata zarfı: { "message": ..., "code"?: ..., "errors"?: {...} }
/// UI katmanı durum koduna ve `code` alanına bakar; mesaj eşleştirmesi
/// yapmaz.
class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.message,
    this.code,
    this.errors,
    this.retryAfterSeconds,
  });

  final int statusCode;
  final String message;

  /// Backend'in makine-okunur kodu (no_active_company, invitation_expired...).
  final String? code;

  /// 422'de alan bazlı doğrulama hataları.
  final Map<String, List<String>>? errors;

  /// 429'da Retry-After saniyesi.
  final int? retryAfterSeconds;

  bool get isUnauthenticated => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isValidation => statusCode == 422;
  bool get isRateLimited => statusCode == 429;
  bool get isServerError => statusCode >= 500;

  String? fieldError(String field) {
    final List<String>? messages = errors?[field];
    return (messages == null || messages.isEmpty) ? null : messages.first;
  }

  /// Kullanıcıya gösterilebilecek güvenli metin.
  ///
  /// 500 için backend mesajı kullanılmaz: production'da "Server Error"
  /// gelir ve kullanıcıya hiçbir şey anlatmaz.
  String get userMessage {
    if (isServerError) {
      return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';
    }

    if (isRateLimited) {
      final int? wait = retryAfterSeconds;
      return wait == null
          ? 'Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.'
          : 'Çok fazla deneme yapıldı. $wait saniye sonra tekrar deneyin.';
    }

    return message;
  }

  @override
  String toString() => 'ApiException($statusCode, $code)';
}

/// Sunucuya hiç ulaşılamadı.
class NetworkException implements Exception {
  const NetworkException();

  String get userMessage => 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.';

  @override
  String toString() => 'NetworkException';
}
