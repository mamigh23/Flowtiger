import 'dart:convert';

import 'package:flowtiger/core/config/app_config.dart';
import 'package:flowtiger/core/network/api_client.dart';
import 'package:flowtiger/core/providers.dart';
import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flowtiger/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Uygulama açılış (smoke) testleri.
///
/// Bu dosya `flutter create` tarafından üretilen sayaç şablonunun yerine
/// geçer; şablon var olmayan bir `MyApp` sınıfını varsayıyordu.
///
/// Burada kanıtlanan iki şey:
///   1. Uygulama gerçekten açılıyor.
///   2. Açılışta oturum durumu doğru ekrana götürüyor — token yoksa
///      giriş, varsa kabuk.
///
/// Gerçek Keychain/Keystore ve gerçek ağ KULLANILMAZ: her ikisi de
/// provider override ile değiştirilir (Riverpod'un seçilme sebebi buydu).
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

  /// Zamanlayıcıya bağlı beklemek yerine sabit sayıda kare çeviririz.
  ///
  /// pumpAndSettle KULLANILMAZ: yükleme sırasında ekranda sonsuz dönen
  /// bir CircularProgressIndicator varken "animasyon bitene kadar bekle"
  /// davranışı testi askıda bırakabilir.
  Future<void> settle(WidgetTester tester) async {
    for (int i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Widget appWith({
    required TokenStorage storage,
    http.Response Function(http.Request request)? handler,
  }) {
    return ProviderScope(
      overrides: <Override>[
        appConfigProvider.overrideWithValue(config),
        tokenStorageProvider.overrideWithValue(storage),
        if (handler != null)
          apiClientProvider.overrideWith(
            (Ref ref) => ApiClient(
              config: config,
              tokenStorage: storage,
              httpClient: MockClient((http.Request request) async => handler(request)),
              onUnauthenticated: storage.clear,
            ),
          ),
      ],
      child: const FlowTigerApp(),
    );
  }

  testWidgets('token yokken giriş ekranını gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(appWith(storage: InMemoryTokenStorage()));
    await settle(tester);

    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsOneWidget);
    expect(find.text('Devam etmek için giriş yapın.'), findsOneWidget);
  });

  testWidgets('geçerli token ile kimlik doğrulanmış kabuğu gösterir',
      (WidgetTester tester) async {
    final InMemoryTokenStorage storage = InMemoryTokenStorage();
    await storage.write('gecerli-token');

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: (http.Request request) {
          final String path = request.url.path;

          if (path.endsWith('/me')) {
            return json(200, <String, dynamic>{
              'data': <String, dynamic>{
                'id': 1,
                'name': 'Ada',
                'email': 'ada@flowtiger.test',
                'active_company_id': 7,
              },
            });
          }

          if (path.endsWith('/companies')) {
            return json(200, <String, dynamic>{
              'data': <dynamic>[
                <String, dynamic>{'id': 7, 'name': 'Sirket A', 'role': 'owner'},
              ],
              'meta': <String, dynamic>{'active_company_id': 7},
            });
          }

          return json(404, <String, dynamic>{'message': 'not found'});
        },
      ),
    );

    await settle(tester);

    expect(find.text('ada@flowtiger.test'), findsOneWidget);
    expect(find.text('Sirket A'), findsOneWidget);
    expect(find.text('aktif'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsNothing);
  });

  testWidgets('geçersiz token oturumu düşürür ve giriş ekranına döner',
      (WidgetTester tester) async {
    final InMemoryTokenStorage storage = InMemoryTokenStorage();
    await storage.write('artik-gecersiz');

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: (_) => json(401, <String, dynamic>{'message': 'Unauthenticated.'}),
      ),
    );

    await settle(tester);

    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsOneWidget);

    // 401 alındığında token cihazdan silinmiş olmalı.
    expect(await storage.read(), isNull);
  });
}
