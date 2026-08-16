import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../core/storage/token_storage.dart';
import '../../models/models.dart';

/// Oturum durumu — web'deki AuthStatus ile aynı üç hâl.
enum AuthStatus { loading, authenticated, unauthenticated }

class AuthState {
  const AuthState({required this.status, this.user});

  const AuthState.loading() : this(status: AuthStatus.loading);
  const AuthState.unauthenticated() : this(status: AuthStatus.unauthenticated);

  final AuthStatus status;
  final User? user;

  bool get isAuthenticated => status == AuthStatus.authenticated;
}

/// Kimlik akışının tek sahibi.
///
/// Ekranlar token'a, depolamaya ya da API istemcisine doğrudan
/// dokunmaz; yalnızca bu controller'ı çağırır.
class AuthController extends StateNotifier<AuthState> {
  AuthController({required ApiClient api, required TokenStorage tokenStorage})
      : _api = api,
        _tokenStorage = tokenStorage,
        super(const AuthState.loading());

  final ApiClient _api;
  final TokenStorage _tokenStorage;

  /// Açılışta: cihazda token varsa kim olduğumuzu backend'e soralım.
  ///
  /// Token'ın varlığı yeterli değildir — iptal edilmiş ya da süresi
  /// dolmuş olabilir. Yetki kararı her zaman backend'e aittir.
  Future<void> restoreSession() async {
    final String? token = await _tokenStorage.read();

    if (token == null) {
      state = const AuthState.unauthenticated();
      return;
    }

    try {
      final Map<String, dynamic> payload = await _api.get<Map<String, dynamic>>('me');
      state = AuthState(status: AuthStatus.authenticated, user: User.fromJson(payload));
    } on Object {
      // 401'de token zaten temizlendi; diğer hatalarda da oturum açık
      // sayılmaz — fail closed.
      await _tokenStorage.clear();
      state = const AuthState.unauthenticated();
    }
  }

  Future<void> login({required String email, required String password}) async {
    final Map<String, dynamic> payload = await _api.post<Map<String, dynamic>>(
      'auth/login',
      body: <String, String>{'email': email, 'password': password},
      authenticated: false,
    );

    final LoginResult result = LoginResult.fromJson(payload);

    // Token yalnızca burada saklanır.
    await _tokenStorage.write(result.token);

    state = AuthState(status: AuthStatus.authenticated, user: result.user);
  }

  /// Backend herhangi bir istekte 401 döndü.
  ///
  /// Token ApiClient tarafından zaten silindi; burada yalnızca oturum
  /// durumu düşürülür. Sunucuya çıkış isteği GÖNDERİLMEZ — o istek de
  /// 401 alacaktı.
  void sessionExpired() {
    if (state.status == AuthStatus.unauthenticated) return;
    state = const AuthState.unauthenticated();
  }

  Future<void> logout() async {
    try {
      await _api.post<void>('auth/logout');
    } on Object {
      // Sunucuya ulaşılamasa bile yerel oturum kapanır: kullanıcı
      // "çıkış yaptım" dediyse cihazda token kalmamalı.
    } finally {
      await _tokenStorage.clear();
      state = const AuthState.unauthenticated();
    }
  }
}

final StateNotifierProvider<AuthController, AuthState> authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>(
  (Ref ref) => AuthController(
    api: ref.watch(apiClientProvider),
    tokenStorage: ref.watch(tokenStorageProvider),
  ),
);
