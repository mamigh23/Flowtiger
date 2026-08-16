import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'harness.dart';

/// Panel (dashboard).
///
/// KURAL: sahte veri YOK. Ekrandaki her sayı gerçek bir uçtan gelir:
///   müşteri sayısı → GET /customers?per_page=1  → meta.total
///   ekip sayısı    → GET /members?per_page=1    → meta.total
///   son hareketler → GET /audit-logs?per_page=5 → data[]
///
/// members ve audit-logs yalnızca owner'a açıktır; member rolündeki
/// kullanıcı 403 alır. Bu bir arıza değil, beklenen bir durumdur ve
/// kart bazında ayrı ele alınır.
void main() {
  Map<String, ApiRoute> sessionRoutes({String role = 'owner'}) => <String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, dynamic>{'data': userFixture()}),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture(role: role)],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
      };

  testWidgets('aktif şirketi, kullanıcıyı ve rolü gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await settle(tester);

    expect(find.textContaining('Hoş geldin, Ada Lovelace'), findsOneWidget);
    expect(find.text('Kaplan Yazılım'), findsWidgets);
    expect(find.text('Sahip'), findsOneWidget);
  });

  testWidgets('müşteri ve ekip sayısını meta.total üzerinden gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 128)),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 6)),
          '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await settle(tester);

    expect(find.text('128'), findsOneWidget);
    expect(find.text('6'), findsOneWidget);
    expect(find.text('Müşteri'), findsOneWidget);
    expect(find.text('Ekip üyesi'), findsOneWidget);
  });

  testWidgets('sayım isteklerini per_page=1 ile yapar', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 3)),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 3)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await settle(tester);

    final List<String> urls = recorder.paths;

    expect(urls.any((String url) => url.contains('/customers?per_page=1')), isTrue);
    expect(urls.any((String url) => url.contains('/members?per_page=1')), isTrue);
    expect(urls.any((String url) => url.contains('/audit-logs?per_page=5')), isTrue);
  });

  testWidgets('son hareketleri denetim kayıtlarından listeler',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 1)),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 1)),
          '/audit-logs': (_) => jsonResponse(
                200,
                paginated(
                  <Map<String, dynamic>>[
                    auditLogFixture(),
                    auditLogFixture(id: 2, action: 'member.role_changed'),
                  ],
                  2,
                ),
              ),
        }),
      ),
    );
    await settle(tester);

    expect(find.text('Müşteri oluşturuldu'), findsOneWidget);
    expect(find.text('Üye rolü değiştirildi'), findsOneWidget);
  });

  testWidgets('403 dönen kartları hata değil yetki durumu olarak gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(role: 'member'),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 42)),
          '/members': (_) => jsonResponse(
                403,
                <String, dynamic>{'message': 'Bu işlem için yetkiniz yok.'},
              ),
          '/audit-logs': (_) => jsonResponse(
                403,
                <String, dynamic>{'message': 'Bu işlem için yetkiniz yok.'},
              ),
        }),
      ),
    );
    await settle(tester);

    // Erişilebilen kart yine dolar.
    expect(find.text('42'), findsOneWidget);

    // Yetki gerektiren kartlar kendi durumlarını gösterir.
    expect(find.text('Yetkiniz yok'), findsNWidgets(2));

    // 403 bir arıza değil: genel hata uyarısı çıkmamalı.
    expect(find.textContaining('Beklenmedik bir hata'), findsNothing);
  });

  testWidgets('veri yokken boş durum gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 1)),
          '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await settle(tester);

    expect(find.text('Henüz hareket yok.'), findsOneWidget);
  });

  testWidgets('sunucu hatasında kart bazında hata durumu gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) =>
              jsonResponse(500, <String, dynamic>{'message': 'Server Error'}),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 2)),
          '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await settle(tester);

    expect(find.text('Alınamadı'), findsOneWidget);
    // Diğer kart etkilenmemeli.
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('alt gezinme çubuğunda ürün bölümlerini gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await settle(tester);

    expect(find.byType(NavigationBar), findsOneWidget);

    for (final String label in <String>['Panel', 'Müşteriler', 'Ekip', 'Profil']) {
      expect(find.text(label), findsWidgets, reason: '$label sekmesi yok');
    }
  });

  testWidgets('sekme değiştirince ilgili bölüm açılır', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await settle(tester);

    await tester.tap(find.text('Profil'));
    await settle(tester);

    // Profil bölümünde oturum bilgisi ve çıkış bulunur.
    expect(find.text('ada@flowtiger.test'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Çıkış yap'), findsOneWidget);
  });
}
