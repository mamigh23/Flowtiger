import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Davet listesi — web ile AYNI sözleşme.
///
/// GET /invitations?page=N → { data, meta }
/// Sıralama created_at DESC, id DESC — SABİT.
/// sort/search/durum filtresi YOK.
///
/// `email` MASKELİ gelir; arayüz maskeyi çözmeye çalışmaz.
///
/// 403 Team ile aynı: uçlar owner'a özeldir. Ama bu bilgi İSTEMCİDE
/// KARAR VERİLMEZ — istek yapılır, backend 403 dönerse açıklanır.
void main() {
  Map<String, ApiRoute> sessionRoutes({String role = 'owner'}) => <String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, dynamic>{'data': userFixture()}),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture(role: role)],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      };

  final List<Map<String, dynamic>> fourStatuses = <Map<String, dynamic>>[
    invitationFixture(id: 41, email: 'a***@flowtiger.test'),
    invitationFixture(id: 42, email: 'b***@flowtiger.test', role: 'owner', status: 'accepted'),
    invitationFixture(id: 43, email: 'c***@flowtiger.test', status: 'revoked'),
    invitationFixture(id: 44, email: 'd***@flowtiger.test', status: 'expired'),
  ];

  /// Davetler sekmesine geçer.
  Future<void> openInvitations(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Davetler'));
    await settle(tester);
  }

  testWidgets('davetleri maskeli e-posta ve rolle listeler',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations': (_) => jsonResponse(200, paginated(fourStatuses, 4)),
        }),
      ),
    );
    await openInvitations(tester);

    expect(find.text('a***@flowtiger.test'), findsOneWidget);
    expect(find.text('b***@flowtiger.test'), findsOneWidget);
    expect(find.text('d***@flowtiger.test'), findsOneWidget);
  });

  testWidgets('dört durumu da ayrı ayrı etiketler', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations': (_) => jsonResponse(200, paginated(fourStatuses, 4)),
        }),
      ),
    );
    await openInvitations(tester);

    expect(find.text('Bekliyor'), findsOneWidget);
    expect(find.text('Kabul edildi'), findsOneWidget);
    expect(find.text('İptal edildi'), findsOneWidget);
    expect(find.text('Süresi doldu'), findsOneWidget);
  });

  testWidgets('listeyi page=1 ile ister', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/invitations': (_) => jsonResponse(200, paginated(fourStatuses, 4)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openInvitations(tester);

    expect(
      recorder.paths
          .any((String url) => url.contains('/invitations?') && url.contains('page=1')),
      isTrue,
    );
  });

  testWidgets('hiç davet yokken boş durum gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await openInvitations(tester);

    expect(find.text('Henüz davet yok.'), findsOneWidget);
  });

  testWidgets('sunucu hatasında hata durumu ve tekrar deneme sunar',
      (WidgetTester tester) async {
    int attempt = 0;

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations': (_) {
            attempt += 1;
            return attempt == 1
                ? jsonResponse(500, <String, dynamic>{'message': 'Server Error'})
                : jsonResponse(200, paginated(fourStatuses, 4));
          },
        }),
      ),
    );
    await openInvitations(tester);

    expect(find.textContaining('Beklenmedik bir hata'), findsOneWidget);
    expect(find.textContaining('Server Error'), findsNothing);

    await tester.tap(find.widgetWithText(FilledButton, 'Tekrar dene'));
    await settle(tester);

    expect(find.text('a***@flowtiger.test'), findsOneWidget);
  });

  testWidgets('403 durumunda bölümün sahiplere açık olduğunu söyler',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(role: 'member'),
          '/invitations': (_) =>
              jsonResponse(403, <String, dynamic>{'message': 'This action is unauthorized.'}),
        }),
      ),
    );
    await openInvitations(tester);

    expect(find.text('Bu bölüm yalnızca şirket sahiplerine açıktır.'), findsOneWidget);
    expect(find.textContaining('This action is unauthorized.'), findsNothing);
  });

  /// İSTEMCİDE YETKİ KARARI YOK: rol `member` olsa bile istek yapılır.
  testWidgets('rol member olsa bile isteği yapar, istemcide engellemez',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(role: 'member'),
        '/invitations': (_) =>
            jsonResponse(403, <String, dynamic>{'message': 'This action is unauthorized.'}),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openInvitations(tester);

    expect(
      recorder.paths.any((String url) => url.contains('/invitations?')),
      isTrue,
      reason: 'rol member diye istek engellenmemeli',
    );
  });

  testWidgets('401 durumunda oturumu kapatır', (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage('artik-gecersiz');

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations': (_) =>
              jsonResponse(401, <String, dynamic>{'message': 'Unauthenticated.'}),
        }),
      ),
    );
    await openInvitations(tester);

    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsOneWidget);
    expect(await storage.read(), isNull);
  });

  // ------------------------------------------------------------ sayfalama

  testWidgets('tek sayfa varsa sayfalama göstermez', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations': (_) => jsonResponse(200, paginated(fourStatuses, 4)),
        }),
      ),
    );
    await openInvitations(tester);

    expect(find.text('Sonraki'), findsNothing);
    expect(find.text('Önceki'), findsNothing);
  });

  testWidgets('birden çok sayfa varsa sayfa bilgisini gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations': (_) =>
              jsonResponse(200, paginated(fourStatuses, 45, currentPage: 1, lastPage: 3)),
        }),
      ),
    );
    await openInvitations(tester);

    expect(find.text('Sayfa 1 / 3'), findsOneWidget);

    final TextButton previous =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Önceki'));
    expect(previous.onPressed, isNull);

    final TextButton next =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Sonraki'));
    expect(next.onPressed, isNotNull);
  });

  testWidgets('sonraki sayfaya geçince page=2 ister ve o içeriği gösterir',
      (WidgetTester tester) async {
    final List<Map<String, dynamic>> secondPage = <Map<String, dynamic>>[
      invitationFixture(id: 61, email: 'z***@flowtiger.test'),
    ];

    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/invitations': (http.Request request) {
          final String page = request.url.queryParameters['page'] ?? '1';

          return jsonResponse(
            200,
            paginated(
              page == '2' ? secondPage : fourStatuses,
              45,
              currentPage: int.parse(page),
              lastPage: 3,
            ),
          );
        },
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openInvitations(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Sonraki'));
    await settle(tester);

    expect(find.text('z***@flowtiger.test'), findsOneWidget);
    expect(find.text('a***@flowtiger.test'), findsNothing);
    expect(
      recorder.paths
          .any((String url) => url.contains('/invitations?') && url.contains('page=2')),
      isTrue,
    );
  });

  testWidgets('son sayfada sonraki düğmesi kapalıdır', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations': (_) =>
              jsonResponse(200, paginated(fourStatuses, 45, currentPage: 3, lastPage: 3)),
        }),
      ),
    );
    await openInvitations(tester);

    final TextButton next =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Sonraki'));
    expect(next.onPressed, isNull);

    final TextButton previous =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Önceki'));
    expect(previous.onPressed, isNotNull);
  });
}
