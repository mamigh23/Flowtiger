import 'package:flutter_riverpod/flutter_riverpod.dart';

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
/// Herhangi bir istek 401 alırsa token silinir; authControllerProvider
/// bunu görüp kullanıcıyı giriş ekranına alır. Böylece oturum sonlandırma
/// tek noktada olur ve her çağrı yerinde tekrarlanmaz.
final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((Ref ref) {
  final TokenStorage storage = ref.watch(tokenStorageProvider);

  return ApiClient(
    config: ref.watch(appConfigProvider),
    tokenStorage: storage,
    onUnauthenticated: storage.clear,
  );
});
