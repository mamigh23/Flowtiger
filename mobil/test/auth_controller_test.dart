import 'dart:convert';

import 'package:flowtiger/core/config/app_config.dart';
import 'package:flowtiger/core/network/api_client.dart';
import 'package:flowtiger/core/providers.dart';
import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flowtiger/features/auth/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// AuthController, widget ağacı kurmadan test edilir — Riverpod'un
/// ProviderContainer'ı sayesinde.
void main() {
  const AppConfig config = AppConfig(
    apiBaseUrl: 'https://api.test/api/v1',
    environment: 'test',
  );

  http.Response json(int status, Object body) => http.Response(
        jsonEncode(body),
        status,
        headers: <String, String>{'content-type': 'application/json'},
      );

  ProviderContainer containerWith({
    required http.Response Function(http.Request request) handler,
    required TokenStorage storage,
  }) {
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        appConfigProvider.overrideWithValue(config),
        tokenStorageProvider.overrideWithValue(storage),
        apiClientProvider.overrideWith(
          (Ref ref) => ApiClient(
            config: config,
            tokenStorage: storage,
            httpClient: MockClient((http.Request request) async => handler(request)),
            onUnauthenticated: storage.clear,
          ),
        ),
      ],
    );

    addTearDown(container.dispose);

    return container;
  }

  group('AuthController', () {
    test('token yokken unauthenticated olur', () async {
      final ProviderContainer container = containerWith(
        handler: (_) => json(200, <String, dynamic>{}),
        storage: InMemoryTokenStorage(),
      );

      await container.read(authControllerProvider.notifier).restoreSession();

      expect(container.read(authControllerProvider).status, AuthStatus.unauthenticated);
    });

    test('login başarılı olduğunda token saklanır', () async {
      final InMemoryTokenStorage storage = InMemoryTokenStorage();

      final ProviderContainer container = containerWith(
        storage: storage,
        handler: (_) => json(200, <String, dynamic>{
          'data': <String, dynamic>{
            'token': 'yeni-token',
            'user': <String, dynamic>{
              'id': 1,
              'name': 'Ada',
              'email': 'ada@flowtiger.test',
            },
          },
        }),
      );

      await container
          .read(authControllerProvider.notifier)
          .login(email: 'ada@flowtiger.test', password: 'parola');

      final AuthState state = container.read(authControllerProvider);

      expect(state.status, AuthStatus.authenticated);
      expect(state.user?.email, 'ada@flowtiger.test');
      expect(await storage.read(), 'yeni-token');
    });

    test('geçersiz token ile oturum geri yüklenmez ve token silinir', () async {
      final InMemoryTokenStorage storage = InMemoryTokenStorage();
      await storage.write('artik-gecersiz');

      final ProviderContainer container = containerWith(
        storage: storage,
        handler: (_) => json(401, <String, dynamic>{'message': 'Unauthenticated.'}),
      );

      await container.read(authControllerProvider.notifier).restoreSession();

      expect(container.read(authControllerProvider).status, AuthStatus.unauthenticated);
      expect(await storage.read(), isNull);
    });

    test('logout, sunucu hata verse bile yerel oturumu kapatır', () async {
      final InMemoryTokenStorage storage = InMemoryTokenStorage();
      await storage.write('bir-token');

      final ProviderContainer container = containerWith(
        storage: storage,
        handler: (_) => json(500, <String, dynamic>{'message': 'Server Error'}),
      );

      await container.read(authControllerProvider.notifier).logout();

      expect(container.read(authControllerProvider).status, AuthStatus.unauthenticated);
      expect(await storage.read(), isNull);
    });
  });

  group('TokenStorage', () {
    test('yazar, okur ve siler', () async {
      final InMemoryTokenStorage storage = InMemoryTokenStorage();

      expect(await storage.read(), isNull);

      await storage.write('abc');
      expect(await storage.read(), 'abc');

      await storage.clear();
      expect(await storage.read(), isNull);
    });
  });
}
