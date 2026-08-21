import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Üye detayı — rol değişimi ve ekipten çıkarma.
///
///   GET    /members/{id}       → 200 | 404
///   PATCH  /members/{id}/role  → 200 | 422 | 403   gövde: { role }
///   DELETE /members/{id}       → 204 | 403
///
/// İKİ ÖZEL SONUÇ, İKİ FARKLI ANLAM:
///   422 + company_requires_an_owner → yetki sorunu DEĞİL; işlem şirketi
///        ownersız bırakırdı.
///   403 (çıkarma) → kullanıcı kendini çıkarmaya çalıştı. "Bölüm sahiplere
///        açık" DEĞİL; zaten owner, aksi hâlde bu ekranı göremezdi.
void main() {
  Map<String, ApiRoute> sessionRoutes() => <String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, dynamic>{'data': userFixture()}),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture()],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      };

  final Map<String, dynamic> member = memberFixture(
    id: 22,
    name: 'Mert Demir',
    email: 'mert@flowtiger.test',
    role: 'member',
  );

  Object? bodyOf(RecordingHandler recorder, String method) {
    final Iterable<http.Request> matching =
        recorder.requests.where((http.Request request) => request.method == method);
    return matching.isEmpty ? null : jsonDecode(matching.first.body);
  }

  /// Ekip sekmesini açıp üyenin detayına girer.
  Future<void> openDetail(WidgetTester tester, {String name = 'Mert Demir'}) async {
    await settle(tester);
    await tester.tap(find.text('Ekip'));
    await settle(tester);
    await tester.tap(find.text(name));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  testWidgets('üyenin adını, e-postasını ve rolünü gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members/22': (_) => jsonResponse(200, <String, dynamic>{'data': member}),
          '/members': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[member], 1)),
        }),
      ),
    );
    await openDetail(tester);

    expect(find.text('E-posta'), findsOneWidget);
    expect(find.text('mert@flowtiger.test'), findsWidgets);
    expect(find.text('Rol'), findsOneWidget);
  });

  testWidgets('bilinmeyen üyede bulunamadı der, yetki hatası demez',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members/22': (_) =>
              jsonResponse(404, <String, dynamic>{'message': 'Kayıt bulunamadı.'}),
          '/members': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[member], 1)),
        }),
      ),
    );
    await openDetail(tester);

    expect(find.text('Üye bulunamadı.'), findsOneWidget);
    expect(find.textContaining('sahiplerine açıktır'), findsNothing);
  });

  // --------------------------------------------------------- rol değişimi

  testWidgets('rol değişimini PATCH ile ve yalnızca role alanıyla gönderir',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/members/22/role': (_) => jsonResponse(200, <String, dynamic>{
              'data': memberFixture(id: 22, name: 'Mert Demir', role: 'owner'),
            }),
        '/members/22': (_) => jsonResponse(200, <String, dynamic>{'data': member}),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[member], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openDetail(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Sahip yap'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(bodyOf(recorder, 'PATCH'), <String, dynamic>{'role': 'owner'});
    expect(
      recorder.requests.any(
        (http.Request request) =>
            request.method == 'PATCH' && request.url.path.endsWith('/members/22/role'),
      ),
      isTrue,
    );
  });

  testWidgets('rol değişimi sonrası güncel rolü gösterir',
      (WidgetTester tester) async {
    String role = 'member';

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members/22/role': (_) {
            role = 'owner';
            return jsonResponse(200, <String, dynamic>{
              'data': memberFixture(id: 22, name: 'Mert Demir', role: role),
            });
          },
          '/members/22': (_) => jsonResponse(200, <String, dynamic>{
                'data': memberFixture(id: 22, name: 'Mert Demir', role: role),
              }),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[member], 1)),
        }),
      ),
    );
    await openDetail(tester);

    expect(find.widgetWithText(FilledButton, 'Sahip yap'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Sahip yap'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    // Rol owner olunca düğme tersine döner.
    expect(find.widgetWithText(FilledButton, 'Üye yap'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sahip yap'), findsNothing);
  });

  /// Son owner member'a düşürülemez. Bu bir YETKİ hatası değil: isteği
  /// yapanın yetkisi tamdır, ama işlem şirketi ownersız bırakırdı.
  testWidgets('son owner düşürülemediğinde 422 mesajını gösterir',
      (WidgetTester tester) async {
    final Map<String, dynamic> owner =
        memberFixture(id: 21, name: 'Ada Lovelace', role: 'owner');

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members/21/role': (_) => jsonResponse(422, <String, dynamic>{
                'message':
                    "Bu işlem şirketi owner'sız bırakırdı. Önce başka bir üyeye owner rolü verin.",
                'code': 'company_requires_an_owner',
              }),
          '/members/21': (_) => jsonResponse(200, <String, dynamic>{'data': owner}),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[owner], 1)),
        }),
      ),
    );
    await openDetail(tester, name: 'Ada Lovelace');

    await tester.tap(find.widgetWithText(FilledButton, 'Üye yap'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.textContaining("şirketi owner'sız bırakırdı"), findsOneWidget);

    // Rol değişmemiş olmalı: düğme hâlâ "Üye yap" diyor.
    expect(find.widgetWithText(FilledButton, 'Üye yap'), findsOneWidget);
  });

  // ------------------------------------------------------- ekipten çıkarma

  testWidgets('çıkarma işlemi onay ister ve onaysız istek göndermez',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/members/22': (_) => jsonResponse(200, <String, dynamic>{'data': member}),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[member], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openDetail(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Ekipten çıkar'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.textContaining('Mert Demir ekipten çıkarılacak'), findsOneWidget);

    expect(
      recorder.requests.where((http.Request request) => request.method == 'DELETE'),
      isEmpty,
    );
  });

  testWidgets('onaylanınca DELETE gönderir ve ekip listesine döner',
      (WidgetTester tester) async {
    bool removed = false;

    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/members/22': (http.Request request) {
          if (request.method == 'DELETE') {
            removed = true;
            return http.Response('', 204);
          }
          return jsonResponse(200, <String, dynamic>{'data': member});
        },
        '/members': (_) => jsonResponse(
              200,
              removed
                  ? paginated(<Map<String, dynamic>>[], 0)
                  : paginated(<Map<String, dynamic>>[member], 1),
            ),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openDetail(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Ekipten çıkar'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.tap(find.widgetWithText(FilledButton, 'Evet, çıkar'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Ekipte görüntülenecek üye yok.'), findsOneWidget);
    expect(find.text('E-posta'), findsNothing, reason: 'detay ekranı kapanmalı');

    expect(
      recorder.requests
          .where(
            (http.Request request) =>
                request.method == 'DELETE' && request.url.path.endsWith('/members/22'),
          )
          .length,
      1,
    );
  });

  testWidgets('vazgeçilirse çıkarma isteği göndermez', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/members/22': (_) => jsonResponse(200, <String, dynamic>{'data': member}),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[member], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openDetail(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Ekipten çıkar'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.tap(find.widgetWithText(TextButton, 'Vazgeç'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.textContaining('ekipten çıkarılacak'), findsNothing);
    expect(
      recorder.requests.where((http.Request request) => request.method == 'DELETE'),
      isEmpty,
    );
  });

  /// Owner kendini çıkaramaz — son owner olmasa bile. Policy bu kontrolü
  /// yetki kontrolünden ÖNCE yapar ve 403 döner.
  testWidgets('kendini çıkarmaya çalışınca 403 mesajını açıklar',
      (WidgetTester tester) async {
    final Map<String, dynamic> self =
        memberFixture(id: 21, name: 'Ada Lovelace', role: 'owner');

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/members/21': (http.Request request) => request.method == 'DELETE'
              ? jsonResponse(403, <String, dynamic>{'message': 'This action is unauthorized.'})
              : jsonResponse(200, <String, dynamic>{'data': self}),
          '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[self], 1)),
        }),
      ),
    );
    await openDetail(tester, name: 'Ada Lovelace');

    await tester.tap(find.widgetWithText(TextButton, 'Ekipten çıkar'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.tap(find.widgetWithText(FilledButton, 'Evet, çıkar'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Kendinizi ekipten çıkaramazsınız.'), findsOneWidget);
    expect(find.textContaining('This action is unauthorized.'), findsNothing);
    expect(find.textContaining('sahiplerine açıktır'), findsNothing);
  });
}
