import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Erişim token'ının saklandığı tek yer.
///
/// Uygulama kodu hiçbir yerde depolama API'sini doğrudan çağırmaz;
/// yalnızca bu arayüzü kullanır. Böylece depolama stratejisi
/// değiştiğinde (ör. biyometrik kilit eklendiğinde) tek dosya değişir.
abstract interface class TokenStorage {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

/// İşletim sisteminin güvenli deposu: Android Keystore / iOS Keychain.
///
/// SharedPreferences KULLANILMAZ: orada değerler düz metin tutulur ve
/// root'lu/jailbreak'li bir cihazda ya da yedeklerden okunabilir.
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(
                // Cihaz kilidi açıldıktan sonra erişilebilir, yedeklere
                // taşınmaz: çalınan bir yedekten token çıkmaz.
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  static const String _tokenKey = 'flowtiger.access_token';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: _tokenKey);

  @override
  Future<void> write(String token) => _storage.write(key: _tokenKey, value: token);

  @override
  Future<void> clear() => _storage.delete(key: _tokenKey);
}

/// Testler için bellek içi uygulama.
class InMemoryTokenStorage implements TokenStorage {
  String? _token;

  @override
  Future<String?> read() async => _token;

  @override
  Future<void> write(String token) async => _token = token;

  @override
  Future<void> clear() async => _token = null;
}
