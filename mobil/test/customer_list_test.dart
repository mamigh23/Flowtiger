import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Müşteri listesi — web ile AYNI sözleşme.
///
/// GET /customers?page=N → { data, links, meta }
/// Sıralama backend'de sabit (customer_no artan); uçta sort/search/filter
/// parametresi YOK, dolayısıyla arayüzde de arama ya da sıralama kontrolü
/// olmayacak.
///
/// 403 burada ROL yetkisi demek DEĞİLDİR: CustomerPolicy rol ayrımı yapmaz,
/// owner da member da tüm CRUD'u yapabilir. 403 yalnızca "aktif şirket yok
/// ya da üyelik iptal edilmiş" anlamına gelir.
void main() {
  Map<String, ApiRoute> sessionRoutes() => <String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, dynamic>{'data': userFixture()}),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture()],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      };

  final List<Map<String, dynamic>> threeCustomers = <Map<String, dynamic>>[
    customerFixture(),
    customerFixture(id: 502, customerNo: 2, name: 'Mert Demir', phone: null),
    customerFixture(id: 503, customerNo: 3, name: 'Elif Şahin', phone: '05339998877'),
  ];

  /// Liste isteği mi, yoksa panelin sayım isteği mi?
  ///
  /// Uygulama açıldığında ÖNCE panel sekmesi gelir ve o da /customers'a
  /// istek atar — ama sayım için, `per_page=1` ile. Liste ise `page=N`
  /// gönderir. Durum bağımlı senaryolarda ikisi ayrılmazsa panelin isteği
  /// senaryoyu tüketir ve test yanlış şeyi ölçer.
  bool isListRequest(http.Request request) =>
      request.url.queryParameters.containsKey('page');

  /// Müşteriler sekmesine geçer.
  Future<void> openCustomers(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Müşteriler'));
    await settle(tester);
  }

  testWidgets('müşterileri numara, ad ve telefonla listeler',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(200, paginated(threeCustomers, 3)),
        }),
      ),
    );
    await openCustomers(tester);

    expect(find.text('Zeynep Kaya'), findsOneWidget);
    expect(find.text('Mert Demir'), findsOneWidget);
    expect(find.text('Elif Şahin'), findsOneWidget);

    // Kullanıcıya gösterilen numara customer_no'dur, id değil.
    expect(find.text('#1'), findsOneWidget);
    expect(find.text('501'), findsNothing);

    expect(find.text('05551112233'), findsOneWidget);
  });

  testWidgets('telefonu olmayan müşteride uydurma değer göstermez',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(
                200,
                paginated(<Map<String, dynamic>>[threeCustomers[1]], 1),
              ),
        }),
      ),
    );
    await openCustomers(tester);

    expect(find.text('—'), findsOneWidget);
  });

  testWidgets('listeyi page=1 ile ister', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers': (_) => jsonResponse(200, paginated(threeCustomers, 3)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openCustomers(tester);

    expect(
      recorder.paths.any((String url) => url.contains('/customers?') && url.contains('page=1')),
      isTrue,
    );
  });

  testWidgets('hiç müşteri yokken boş durum gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await openCustomers(tester);

    expect(find.text('Henüz müşteri yok.'), findsOneWidget);
  });

  testWidgets('sunucu hatasında hata durumu ve tekrar deneme sunar',
      (WidgetTester tester) async {
    int attempt = 0;

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (http.Request request) {
            // Panelin sayım isteği senaryoyu tüketmemeli.
            if (!isListRequest(request)) {
              return jsonResponse(200, paginated(threeCustomers, 3));
            }

            attempt += 1;
            return attempt == 1
                ? jsonResponse(500, <String, dynamic>{'message': 'Server Error'})
                : jsonResponse(200, paginated(threeCustomers, 3));
          },
        }),
      ),
    );
    await openCustomers(tester);

    // 500'ün backend metni kullanıcıya gösterilmez.
    expect(find.textContaining('Beklenmedik bir hata'), findsOneWidget);
    expect(find.textContaining('Server Error'), findsNothing);

    await tester.tap(find.widgetWithText(FilledButton, 'Tekrar dene'));
    await settle(tester);

    expect(find.text('Zeynep Kaya'), findsOneWidget);
  });

  /// Üyelik iptal edilmişse backend 403 döner. Bu bir ROL kısıtı değildir.
  testWidgets('403 durumunu rol yetkisi gibi göstermez',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(403, <String, dynamic>{
                'message': 'Aktif şirket bulunamadı ya da doğrulanamadı. Erişim reddedildi.',
                'code': 'company_context_unavailable',
              }),
        }),
      ),
    );
    await openCustomers(tester);

    expect(find.textContaining('Erişim reddedildi.'), findsOneWidget);
    expect(find.textContaining('Bu işlem için yetkiniz yok'), findsNothing);
    expect(find.textContaining('rolünüz'), findsNothing);
  });

  testWidgets('401 durumunda oturumu kapatır', (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage('artik-gecersiz');

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (http.Request request) => isListRequest(request)
              ? jsonResponse(401, <String, dynamic>{'message': 'Unauthenticated.'})
              : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await openCustomers(tester);

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
          '/customers': (_) => jsonResponse(200, paginated(threeCustomers, 3)),
        }),
      ),
    );
    await openCustomers(tester);

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
          '/customers': (_) => jsonResponse(
                200,
                paginated(threeCustomers, 52, currentPage: 1, lastPage: 4),
              ),
        }),
      ),
    );
    await openCustomers(tester);

    expect(find.text('Sayfa 1 / 4'), findsOneWidget);

    final TextButton previous =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Önceki'));
    expect(previous.onPressed, isNull, reason: 'ilk sayfada Önceki kapalı olmalı');

    final TextButton next =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Sonraki'));
    expect(next.onPressed, isNotNull);
  });

  testWidgets('sonraki sayfaya geçince page=2 ister ve o içeriği gösterir',
      (WidgetTester tester) async {
    final List<Map<String, dynamic>> secondPage = <Map<String, dynamic>>[
      customerFixture(id: 601, customerNo: 16, name: 'İkinci Sayfa Müşterisi'),
    ];

    // Sunucu gerçekten istenen sayfayı döndürür; yoksa test yalnızca
    // isteğin gittiğini doğrular, sonucun değiştiğini değil.
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers': (http.Request request) {
          final String page = request.url.queryParameters['page'] ?? '1';

          return jsonResponse(
            200,
            paginated(
              page == '2' ? secondPage : threeCustomers,
              52,
              currentPage: int.parse(page),
              lastPage: 4,
            ),
          );
        },
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openCustomers(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Sonraki'));
    await settle(tester);

    expect(find.text('İkinci Sayfa Müşterisi'), findsOneWidget);
    expect(find.text('Zeynep Kaya'), findsNothing);
    expect(
      recorder.paths.any((String url) => url.contains('/customers?') && url.contains('page=2')),
      isTrue,
    );
  });

  testWidgets('son sayfada sonraki düğmesi kapalıdır', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(
                200,
                paginated(threeCustomers, 52, currentPage: 4, lastPage: 4),
              ),
        }),
      ),
    );
    await openCustomers(tester);

    final TextButton next =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Sonraki'));
    expect(next.onPressed, isNull);

    final TextButton previous =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Önceki'));
    expect(previous.onPressed, isNotNull);
  });
}
