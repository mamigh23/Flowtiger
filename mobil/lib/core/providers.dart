import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../features/auth/auth_controller.dart';
import 'config/app_config.dart';
import 'network/api_client.dart';
import 'storage/token_storage.dart';

/// Uygulamanın bağımlılık kökü.
///
/// Testler bu provider'ları `overrideWith` ile değiştirerek gerçek ağ ve
/// gerçek Keychain olmadan çalışır — Riverpod'un seçilme sebeplerinden
/// biri buydu.

final Provider<AppConfig> appConfigProvider = Provider<AppConfig>(
  (Ref ref) => AppConfig.fromEnvironment(),
);

final Provider<TokenStorage> tokenStorageProvider = Provider<TokenStorage>(
  (Ref ref) => SecureTokenStorage(),
);

/// 401 davranışı burada bağlanır.
///
/// Herhangi bir istek 401 alırsa iki şey olur: token cihazdan silinir ve
/// oturum durumu düşürülür. TEK NOKTADA yapılır — her çağrı yerinde
/// "acaba 401 mi geldi" kontrolü tekrarlanmaz; bir yerde unutulursa
/// kullanıcı geçersiz bir oturumla ürünün içinde kalırdı.
/// Testlerin ağ katmanını değiştirdiği tek nokta.
///
/// Testler apiClientProvider'ı DEĞİL bunu override eder; böylece aşağıdaki
/// 401 bağlantısı testlerde de gerçekten çalışır. apiClientProvider
/// override edilseydi, testler kendi kurdukları sahte bir 401 davranışını
/// doğrulamış olurdu — yani hiçbir şeyi.
final Provider<http.Client?> httpClientProvider = Provider<http.Client?>((Ref ref) => null);

final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((Ref ref) {
  final TokenStorage storage = ref.watch(tokenStorageProvider);

  return ApiClient(
    config: ref.watch(appConfigProvider),
    tokenStorage: storage,
    httpClient: ref.watch(httpClientProvider),
    onUnauthenticated: () async {
      await storage.clear();

      // ref.read GEÇ çalışır (istek anında), bu yüzden provider'lar
      // arasında kurulum sırası sorunu doğmaz.
      ref.read(authControllerProvider.notifier).sessionExpired();
    },
  );
});
