import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Ekip listesi — web ile AYNI sözleşme.
///
/// GET /members?page=N → { data, meta }
/// Sıralama SABİT; sort/search/filter parametresi YOK.
///
/// KRİTİK FARK — Customer'ın tersi: bu uçlarda 403 GERÇEKTEN rol
/// kısıtıdır (CompanyMemberPolicy → Role::managesMembers() → owner).
/// Ama bu bilgi İSTEMCİDE KARAR VERİLMEZ: arayüz rolüne bakıp isteği
/// engellemez, isteği yapar ve backend 403 dönerse açıklar.
void main() {
  Map<String, ApiRoute> sessionRoutes({String role = 'owner'}) => <String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, dynamic>{'data': userFixture()}),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture(role: role)],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      };

  final List<Map<String, dynamic>> threeMembers = <Map<String, dynamic>>[
    memberFixture(),
    memberFixture(id: 22, name: 'Mert Demir', email: 'mert@flowtiger.test', role: 'member'),
    memberFixture(id: 23, name: 'Elif Şahin', email: 'elif@flowtiger.test', role: 'member'),
  ];

  /// Liste isteği mi, yoksa panelin sayım isteği mi?
  ///
  /// Uygulama panel sekmesiyle açılır ve panel de /members'a istek atar —
  /// ama sayım için, `per_page=1` ile. Liste `page=N` gönderir. Durum
  /// bağımlı senaryolarda ikisi ayrılmazsa panelin isteği senaryoyu
  /// tüketir ve test yanlış şeyi ölçer.
  bool isListRequest(http.Request request) =>
      request.url.queryParameters.containsKey('page');

  /// Ekip sekmesine geçer.
  Future<void> openTeam(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Ekip'));
    await settle(tester);
  }

  testWidgets('üyeleri ad, e-posta ve rolle listeler', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members': (_) => jsonResponse(200, paginated(threeMembers, 3)),
        }),
      ),
    );
    await openTeam(tester);

    expect(find.text('Ada Lovelace'), findsOneWidget);
    expect(find.text('mert@flowtiger.test'), findsOneWidget);
    expect(find.text('Elif Şahin'), findsOneWidget);
  });

  testWidgets('rolleri Türkçe etiketle gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members': (_) => jsonResponse(200, paginated(threeMembers, 3)),
        }),
      ),
    );
    await openTeam(tester);

    // Üst çubuktaki rol rozeti de 'Sahip' yazar; liste içindekiyle
    // birlikte iki tane olmalı.
    expect(find.text('Sahip'), findsNWidgets(2));
    expect(find.text('Üye'), findsNWidgets(2));
  });

  /// Rol alanı pivot yüklenmediğinde HİÇ gelmez. Varsayım yapılmaz:
  /// 'member' varsaymak yanlış bir yetki izlenimi verirdi.
  testWidgets('rol alanı gelmezse rol yerine bilinmiyor gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members': (_) => jsonResponse(
                200,
                paginated(
                  <Map<String, dynamic>>[
                    memberFixture(id: 24, name: 'Rolsüz Üye', includeRole: false),
                  ],
                  1,
                ),
              ),
        }),
      ),
    );
    await openTeam(tester);

    expect(find.text('Rolsüz Üye'), findsOneWidget);
    expect(find.text('—'), findsOneWidget);
  });

  testWidgets('listeyi page=1 ile ister', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/members': (_) => jsonResponse(200, paginated(threeMembers, 3)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openTeam(tester);

    expect(
      recorder.paths.any((String url) => url.contains('/members?') && url.contains('page=1')),
      isTrue,
    );
  });

  testWidgets('liste boş dönerse boş durum gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await openTeam(tester);

    expect(find.text('Ekipte görüntülenecek üye yok.'), findsOneWidget);
  });

  testWidgets('sunucu hatasında hata durumu ve tekrar deneme sunar',
      (WidgetTester tester) async {
    int attempt = 0;

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members': (http.Request request) {
            // Panelin sayım isteği senaryoyu tüketmemeli.
            if (!isListRequest(request)) {
              return jsonResponse(200, paginated(threeMembers, 3));
            }

            attempt += 1;
            return attempt == 1
                ? jsonResponse(500, <String, dynamic>{'message': 'Server Error'})
                : jsonResponse(200, paginated(threeMembers, 3));
          },
        }),
      ),
    );
    await openTeam(tester);

    expect(find.textContaining('Beklenmedik bir hata'), findsOneWidget);
    expect(find.textContaining('Server Error'), findsNothing);

    await tester.tap(find.widgetWithText(FilledButton, 'Tekrar dene'));
    await settle(tester);

    expect(find.text('Elif Şahin'), findsOneWidget);
  });

  /// Ekip uçları owner'a özeldir; member 403 alır. Burada 403 GERÇEKTEN
  /// rol kısıtı olduğu için kullanıcıya bunu söylemek doğrudur.
  testWidgets('403 durumunda bölümün sahiplere açık olduğunu söyler',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(role: 'member'),
          '/members': (_) =>
              jsonResponse(403, <String, dynamic>{'message': 'This action is unauthorized.'}),
        }),
      ),
    );
    await openTeam(tester);

    expect(find.text('Bu bölüm yalnızca şirket sahiplerine açıktır.'), findsOneWidget);
    // Backend'in ham İngilizce metni kullanıcıya gösterilmez.
    expect(find.textContaining('This action is unauthorized.'), findsNothing);
  });

  /// İSTEMCİDE YETKİ KARARI YOK: rol `member` olsa bile istek yapılır.
  testWidgets('rol member olsa bile isteği yapar, istemcide engellemez',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(role: 'member'),
        '/members': (_) =>
            jsonResponse(403, <String, dynamic>{'message': 'This action is unauthorized.'}),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openTeam(tester);

    expect(
      recorder.paths.any((String url) => url.contains('/members?') && url.contains('page=')),
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
          '/members': (http.Request request) => isListRequest(request)
              ? jsonResponse(401, <String, dynamic>{'message': 'Unauthenticated.'})
              : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await openTeam(tester);

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
          '/members': (_) => jsonResponse(200, paginated(threeMembers, 3)),
        }),
      ),
    );
    await openTeam(tester);

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
          '/members': (_) =>
              jsonResponse(200, paginated(threeMembers, 40, currentPage: 1, lastPage: 3)),
        }),
      ),
    );
    await openTeam(tester);

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
      memberFixture(id: 31, name: 'İkinci Sayfa Üyesi', email: 'ikinci@flowtiger.test'),
    ];

    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/members': (http.Request request) {
          final String page = request.url.queryParameters['page'] ?? '1';

          return jsonResponse(
            200,
            paginated(
              page == '2' ? secondPage : threeMembers,
              40,
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
    await openTeam(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Sonraki'));
    await settle(tester);

    expect(find.text('İkinci Sayfa Üyesi'), findsOneWidget);
    expect(find.text('Elif Şahin'), findsNothing);
    expect(
      recorder.paths.any((String url) => url.contains('/members?') && url.contains('page=2')),
      isTrue,
    );
  });

  testWidgets('son sayfada sonraki düğmesi kapalıdır', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members': (_) =>
              jsonResponse(200, paginated(threeMembers, 40, currentPage: 3, lastPage: 3)),
        }),
      ),
    );
    await openTeam(tester);

    final TextButton next =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Sonraki'));
    expect(next.onPressed, isNull);

    final TextButton previous =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Önceki'));
    expect(previous.onPressed, isNotNull);
  });
}
