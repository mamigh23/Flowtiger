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
  int _revision = 0;
  int? _pendingLoginRevision;
  Future<void> _storageWork = Future<void>.value();

  bool _current(int revision) => mounted && revision == _revision;

  // Secure storage operations must finish in order: a delayed clear/write
  // cannot run over a newer login. Errors still reach the original caller.
  Future<T> _withStorage<T>(Future<T> Function() action) {
    final Future<T> result = _storageWork.then((_) => action());
    _storageWork = result.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return result;
  }

  /// Açılışta: cihazda token varsa kim olduğumuzu backend'e soralım.
  ///
  /// Token'ın varlığı yeterli değildir — iptal edilmiş ya da süresi
  /// dolmuş olabilir. Yetki kararı her zaman backend'e aittir.
  Future<void> restoreSession() async {
    final int revision = ++_revision;
    try {
      final String? token = await _withStorage(_tokenStorage.read);
      if (!_current(revision)) return;
      if (token == null) {
        state = const AuthState.unauthenticated();
        return;
      }
      final Map<String, dynamic> payload = await _api.get<Map<String, dynamic>>('me');
      if (!_current(revision)) return;
      state = AuthState(
        status: AuthStatus.authenticated,
        user: User.fromJson(payload),
      );
    } on Object {
      await _withStorage(() async {
        if (!_current(revision)) return;
        state = const AuthState.unauthenticated();
        await _tokenStorage.clear();
      });
    }
  }

  Future<void> login({required String email, required String password}) async {
    final int revision = ++_revision;
    _pendingLoginRevision = revision;
    try {
      final Map<String, dynamic> payload = await _api.post<Map<String, dynamic>>(
        'auth/login',
        body: <String, String>{'email': email, 'password': password},
        authenticated: false,
      );

      if (!_current(revision)) return;
      final LoginResult result = LoginResult.fromJson(payload);
      await _withStorage(() async {
        if (!_current(revision)) return;
        await _tokenStorage.write(result.token);
        if (!_current(revision)) {
          // A logout/dispose/new login happened while the platform was writing.
          await _tokenStorage.clear();
          return;
        }
        state = AuthState(status: AuthStatus.authenticated, user: result.user);
      });
    } finally {
      if (_pendingLoginRevision == revision) _pendingLoginRevision = null;
    }
  }

  /// Backend herhangi bir istekte 401 döndü.
  ///
  /// Yalnızca isteğin token'ı hâlâ güncelse oturum kapatılır.
  Future<void> sessionExpired(String requestToken) => _withStorage(() async {
        if (!mounted) return;
        final String? currentToken = await _tokenStorage.read();
        if (!mounted || currentToken != requestToken) return;
        // Expire the current token without cancelling an explicit newer login.
        if (_pendingLoginRevision != _revision) ++_revision;
        state = const AuthState.unauthenticated();
        await _tokenStorage.clear();
      });

  Future<void> logout() async {
    ++_revision;
    if (mounted) state = const AuthState.unauthenticated();
    // Queue immediately, before a later login can queue its token write.
    final String? token = await _withStorage(() async {
      final String? token = await _tokenStorage.read();
      await _tokenStorage.clear();
      return token;
    });
    if (token == null) return;
    try {
      await _api.post<void>('auth/logout', accessToken: token);
    } on Object {
      // Sunucuya ulaşılamasa bile yerel oturum kapanır: kullanıcı
      // "çıkış yaptım" dediyse cihazda token kalmamalı.
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
