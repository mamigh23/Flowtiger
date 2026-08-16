import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Şirket seçimi.
///
/// En kritik kural (playbook §3.1): aktif şirket İSTEMCİDE seçilmez.
/// İstemci yalnızca select ucunu çağırır; hiçbir istek gövdesinde
/// active_company_id göndermez.
void main() {
  final List<Map<String, dynamic>> twoCompanies = <Map<String, dynamic>>[
    companyFixture(),
    companyFixture(id: 9, name: 'Bengal Danışmanlık', role: 'member'),
  ];

  Map<String, ApiRoute> baseRoutes({
    required List<Map<String, dynamic>> companies,
    int? activeCompanyId,
  }) {
    return <String, ApiRoute>{
      '/me': (_) => jsonResponse(200, <String, dynamic>{
            'data': userFixture(activeCompanyId: activeCompanyId),
          }),
      '/companies': (_) => jsonResponse(200, <String, dynamic>{
            'data': companies,
            'meta': <String, dynamic>{'active_company_id': activeCompanyId},
          }),
    };
  }

  testWidgets('birden fazla şirket varsa seçim ekranını gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(baseRoutes(companies: twoCompanies)),
      ),
    );
    await settle(tester);

    expect(find.text('Şirket seçin'), findsOneWidget);
    expect(find.text('Kaplan Yazılım'), findsOneWidget);
    expect(find.text('Bengal Danışmanlık'), findsOneWidget);
  });

  testWidgets('her şirket kartında rolü gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(baseRoutes(companies: twoCompanies)),
      ),
    );
    await settle(tester);

    expect(find.text('Sahip'), findsOneWidget);
    expect(find.text('Üye'), findsOneWidget);
  });

  testWidgets('seçim yalnızca select ucunu çağırır ve active_company_id göndermez',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        // Daha özel yol önce gelmeli.
        '/companies/9/select': (_) =>
            jsonResponse(200, <String, dynamic>{'data': twoCompanies[1]}),
        ...baseRoutes(companies: twoCompanies),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await settle(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Seç').last);
    await settle(tester);

    expect(recorder.hitPath('/companies/9/select'), isTrue);

    // Hiçbir istek gövdesinde active_company_id geçmemeli.
    for (final http.Request request in recorder.requests) {
      expect(request.body.contains('active_company_id'), isFalse);
    }
  });

  testWidgets('seçim başarılı olduğunda panel açılır', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          '/companies/9/select': (_) =>
              jsonResponse(200, <String, dynamic>{'data': twoCompanies[1]}),
          ...baseRoutes(companies: twoCompanies),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 12)),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 3)),
          '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await settle(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Seç').last);
    await settle(tester);

    expect(find.textContaining('Hoş geldin'), findsOneWidget);
    expect(find.text('Şirket seçin'), findsNothing);
  });

  /// Üye olunmayan bir şirket seçilmeye çalışılırsa backend 403 döner.
  /// İstemci bunu göstermeli, sessizce yutmamalı.
  testWidgets('403 durumunda seçimin başarısız olduğunu bildirir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          '/companies/9/select': (_) => jsonResponse(
                403,
                <String, dynamic>{'message': 'Bu şirkete erişim yetkiniz yok.'},
              ),
          ...baseRoutes(companies: twoCompanies),
        }),
      ),
    );
    await settle(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Seç').last);
    await settle(tester);

    expect(find.text('Bu şirkete erişim yetkiniz yok.'), findsOneWidget);
    expect(find.text('Şirket seçin'), findsOneWidget);
  });

  testWidgets('tek şirket varsa otomatik seçip paneli açar',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        '/companies/7/select': (_) =>
            jsonResponse(200, <String, dynamic>{'data': companyFixture()}),
        ...baseRoutes(companies: <Map<String, dynamic>>[companyFixture()]),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 4)),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 2)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await settle(tester);

    expect(recorder.hitPath('/companies/7/select'), isTrue);
    expect(find.textContaining('Hoş geldin'), findsOneWidget);
    expect(find.text('Şirket seçin'), findsNothing);
  });

  testWidgets('hiç şirket yoksa boş durum gösterir ve seçim istemez',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(baseRoutes(companies: <Map<String, dynamic>>[])),
      ),
    );
    await settle(tester);

    expect(find.textContaining('Henüz hiçbir şirkete üye değilsiniz'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Seç'), findsNothing);
  });

  testWidgets('şirket listesi 401 dönerse oturumu kapatır',
      (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage('artik-gecersiz');

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(<String, ApiRoute>{
          '/me': (_) => jsonResponse(200, <String, dynamic>{
                'data': userFixture(activeCompanyId: null),
              }),
          '/companies': (_) =>
              jsonResponse(401, <String, dynamic>{'message': 'Unauthenticated.'}),
        }),
      ),
    );
    await settle(tester);

    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsOneWidget);
    expect(await storage.read(), isNull);
  });
}
