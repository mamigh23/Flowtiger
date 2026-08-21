import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Üye düzenleme — web ile AYNI sözleşme.
///
///   PUT /members/{id}  { name, email }
///
/// ROL BU GÖVDEDE YOKTUR. Rol ayrı bir uçla değişir
/// (PATCH /members/{id}/role, üye detayında). Backend bu ayrımı bilinçli
/// yapmış: rol kaydın en tehlikeli özniteliği ve kazara başka bir
/// güncellemenin içine karışmamalı. Forma rol alanı koymak, backend'in
/// özenle ayırdığı iki işlemi istemcide yeniden birleştirmek olurdu.
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

  Object? putBody(RecordingHandler recorder) {
    final Iterable<http.Request> matching =
        recorder.requests.where((http.Request request) => request.method == 'PUT');
    return matching.isEmpty ? null : jsonDecode(matching.first.body);
  }

  /// Ekip → üye detayı → düzenleme.
  Future<void> openEdit(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Ekip'));
    await settle(tester);
    await tester.tap(find.text('Mert Demir'));
    await settle(tester, advance: const Duration(milliseconds: 16));
    await tester.tap(find.widgetWithText(TextButton, 'Düzenle'));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  Map<String, ApiRoute> detailRoutes(ApiRoute memberRoute) => <String, ApiRoute>{
        ...sessionRoutes(),
        '/members/22': memberRoute,
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[member], 1)),
      };

  testWidgets('mevcut ad ve e-postayı forma doldurur', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          detailRoutes((_) => jsonResponse(200, <String, dynamic>{'data': member})),
        ),
      ),
    );
    await openEdit(tester);

    final TextField name = tester.widget<TextField>(find.byKey(const Key('member-name')));
    final TextField email = tester.widget<TextField>(find.byKey(const Key('member-email')));

    expect(name.controller?.text, 'Mert Demir');
    expect(email.controller?.text, 'mert@flowtiger.test');
  });

  /// REGRESYON: formda rol alanı OLMAMALI.
  testWidgets('rol alanı içermez', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          detailRoutes((_) => jsonResponse(200, <String, dynamic>{'data': member})),
        ),
      ),
    );
    await openEdit(tester);

    expect(find.byKey(const Key('member-role')), findsNothing);
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
  });

  /// REGRESYON: gövdede yalnızca name ve email bulunur.
  testWidgets('yalnızca ad ve e-posta gönderir, rol göndermez',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(
        detailRoutes(
          (http.Request request) => request.method == 'PUT'
              ? jsonResponse(200, <String, dynamic>{
                  'data': memberFixture(id: 22, name: 'Mert Demir-Kaya', role: 'member'),
                })
              : jsonResponse(200, <String, dynamic>{'data': member}),
        ),
      ),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openEdit(tester);

    await tester.enterText(find.byKey(const Key('member-name')), 'Mert Demir-Kaya');
    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    final Map<String, dynamic> body = putBody(recorder)! as Map<String, dynamic>;
    final List<String> keys = body.keys.toList()..sort();

    expect(keys, <String>['email', 'name']);
    expect(body, <String, dynamic>{
      'name': 'Mert Demir-Kaya',
      'email': 'mert@flowtiger.test',
    });
  });

  testWidgets('422 doğrulama hatalarını alan altında gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          detailRoutes(
            (http.Request request) => request.method == 'PUT'
                ? jsonResponse(422, <String, dynamic>{
                    'message': 'Gönderilen bilgiler geçersiz.',
                    'errors': <String, dynamic>{
                      'name': <String>['Ad alanı zorunludur.'],
                      'email': <String>['Bu e-posta zaten kullanılıyor.'],
                    },
                  })
                : jsonResponse(200, <String, dynamic>{'data': member}),
          ),
        ),
      ),
    );
    await openEdit(tester);

    await tester.enterText(find.byKey(const Key('member-name')), '');
    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Ad alanı zorunludur.'), findsOneWidget);
    expect(find.text('Bu e-posta zaten kullanılıyor.'), findsOneWidget);
  });

  testWidgets('kaydedince üye detayına döner', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          detailRoutes(
            (_) => jsonResponse(200, <String, dynamic>{
              'data': memberFixture(id: 22, name: 'Güncellenmiş Ad', role: 'member'),
            }),
          ),
        ),
      ),
    );
    await openEdit(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    // Düzenleme ekranı kapanmış, detay ekranı görünür olmalı.
    expect(find.byKey(const Key('member-name')), findsNothing);
    expect(find.text('E-posta'), findsOneWidget);
  });

  testWidgets('403 durumunda bölümün sahiplere açık olduğunu söyler',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          detailRoutes(
            (http.Request request) => request.method == 'PUT'
                ? jsonResponse(403, <String, dynamic>{'message': 'This action is unauthorized.'})
                : jsonResponse(200, <String, dynamic>{'data': member}),
          ),
        ),
      ),
    );
    await openEdit(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Bu bölüm yalnızca şirket sahiplerine açıktır.'), findsOneWidget);
    expect(find.textContaining('This action is unauthorized.'), findsNothing);
  });
}
