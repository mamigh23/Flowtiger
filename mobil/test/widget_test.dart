import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'harness.dart';

/// Uygulama açılış (smoke) testleri.
///
/// Burada kanıtlanan iki şey:
///   1. Uygulama gerçekten açılıyor.
///   2. Açılışta oturum durumu doğru ekrana götürüyor — token yoksa
///      giriş, geçerli token + aktif şirket varsa ürün kabuğu.
///
/// Ekran içeriğinin ayrıntıları login_screen_test, company_select_test
/// ve dashboard_test dosyalarında sınanır.
void main() {
  testWidgets('token yokken giriş ekranını gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(appWith(storage: InMemoryTokenStorage()));
    await settle(tester);

    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsOneWidget);
    expect(find.text('Devam etmek için giriş yapın.'), findsOneWidget);
  });

  testWidgets('geçerli token ve aktif şirket ile ürün kabuğunu açar',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          '/me': (_) => jsonResponse(200, <String, dynamic>{'data': userFixture()}),
          '/companies': (_) => jsonResponse(200, <String, dynamic>{
                'data': <Map<String, dynamic>>[companyFixture()],
                'meta': <String, dynamic>{'active_company_id': 7},
              }),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await settle(tester);

    // Üst çubuk aktif şirketi ve rolü kalıcı olarak gösterir.
    expect(find.text('Kaplan Yazılım'), findsWidgets);
    expect(find.text('Sahip'), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsNothing);
  });

  testWidgets('geçersiz token oturumu düşürür ve giriş ekranına döner',
      (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage('artik-gecersiz');

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: (_) => jsonResponse(401, <String, dynamic>{'message': 'Unauthenticated.'}),
      ),
    );
    await settle(tester);

    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsOneWidget);

    // 401 alındığında token cihazdan silinmiş olmalı.
    expect(await storage.read(), isNull);
  });
}
