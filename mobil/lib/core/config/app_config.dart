/// Ortam yapılandırması.
///
/// Değerler `--dart-define` ile derleme sırasında verilir; kaynak koda
/// gömülü adres yoktur:
///
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api/v1
///   flutter build apk --dart-define=API_BASE_URL=https://api.flowtiger.com/api/v1
///
/// Ortam ayrımı (dev/staging/prod) tek bir değişkenle yapılır; ayrı
/// flavor altyapısı foundation aşamasında gereksiz karmaşıklık olurdu.
///
/// BURAYA SIR KONMAZ. --dart-define ile verilen değerler derlenmiş
/// pakete gömülür ve APK/IPA açılarak okunabilir. API adresi sır
/// değildir; API anahtarı, parola, token asla buraya girmez.
class AppConfig {
  const AppConfig({required this.apiBaseUrl, required this.environment});

  /// Derleme zamanı değerlerinden okur.
  ///
  /// Varsayılan Android emülatörünün host makineye baktığı adrestir
  /// (10.0.2.2 = geliştirme makinesinin localhost'u).
  factory AppConfig.fromEnvironment() {
    return const AppConfig(
      apiBaseUrl: String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://10.0.2.2:8000/api/v1',
      ),
      environment: String.fromEnvironment(
        'APP_ENV',
        defaultValue: 'development',
      ),
    );
  }

  final String apiBaseUrl;
  final String environment;

  bool get isProduction => environment == 'production';

  /// Hassas ayrıntıların loglanabileceği tek durum.
  bool get isDebugLoggingEnabled => !isProduction;
}
