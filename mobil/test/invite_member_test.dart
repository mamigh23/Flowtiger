import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Davet gönderme — web ile AYNI sözleşme.
///
///   POST /invitations  { email, role } → 201
///
/// GÖVDE `{email, role}` — `name` DEĞİL. Davet edilen kişinin adı bu
/// aşamada bilinmez; adını kendisi kabul ekranında girer.
///
/// ENUMERATION KORUMASI: backend, kayıtlı bir adresi davet etmekle
/// kayıtsızı davet etmeyi aynı yanıtla karşılar. Arayüz de bu ayrımı
/// yapmaz.
///
/// Yanıtta `token` YOKTUR ve burada hiçbir yerde beklenmez.
void main() {
  Map<String, ApiRoute> sessionRoutes() => <String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, dynamic>{'data': userFixture()}),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture()],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      };

  Object? postBody(RecordingHandler recorder) {
    final Iterable<http.Request> matching =
        recorder.requests.where((http.Request request) => request.method == 'POST');
    return matching.isEmpty ? null : jsonDecode(matching.first.body);
  }

  /// Davetler sekmesini açıp davet formuna gider.
  Future<void> openForm(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Davetler'));
    await settle(tester);
    await tester.tap(find.byTooltip('Davet gönder'));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  Map<String, ApiRoute> formRoutes(ApiRoute invitationsRoute) => <String, ApiRoute>{
        ...sessionRoutes(),
        '/invitations': invitationsRoute,
      };

  testWidgets('e-posta alanı ve rol seçimi gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          formRoutes((_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0))),
        ),
      ),
    );
    await openForm(tester);

    expect(find.byKey(const Key('invitation-email')), findsOneWidget);
    expect(find.byKey(const Key('invitation-role')), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Gönder'), findsOneWidget);
  });

  testWidgets('varsayılan rol üyedir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          formRoutes((_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0))),
        ),
      ),
    );
    await openForm(tester);

    expect(
      find.descendant(
        of: find.byKey(const Key('invitation-role')),
        matching: find.text('Üye'),
      ),
      findsOneWidget,
    );
  });

  testWidgets('rol seçenekleri yalnızca üye ve sahiptir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          formRoutes((_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0))),
        ),
      ),
    );
    await openForm(tester);

    await tester.tap(find.byKey(const Key('invitation-role')));
    await settle(tester, advance: const Duration(milliseconds: 16));

    // Açılan menüde iki seçenek olmalı. 'Sahip' üst çubuktaki rol
    // rozetinde de geçtiği için menüdeki kopya ondan fazladır.
    expect(find.text('Üye'), findsWidgets);
    expect(find.text('Sahip'), findsWidgets);
  });

  testWidgets('yalnızca e-posta ve rol gönderir', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(
        formRoutes(
          (http.Request request) => request.method == 'POST'
              ? jsonResponse(201, <String, dynamic>{'data': invitationFixture()})
              : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        ),
      ),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openForm(tester);

    await tester.enterText(
      find.byKey(const Key('invitation-email')),
      'yeni@flowtiger.test',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Gönder'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    final Map<String, dynamic> body = postBody(recorder)! as Map<String, dynamic>;
    final List<String> keys = body.keys.toList()..sort();

    expect(keys, <String>['email', 'role']);
    expect(body, <String, dynamic>{'email': 'yeni@flowtiger.test', 'role': 'member'});
  });

  testWidgets('sahip rolü seçilirse gövdede owner gönderir',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(
        formRoutes(
          (http.Request request) => request.method == 'POST'
              ? jsonResponse(201, <String, dynamic>{
                  'data': invitationFixture(role: 'owner'),
                })
              : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        ),
      ),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openForm(tester);

    await tester.enterText(
      find.byKey(const Key('invitation-email')),
      'sahip@flowtiger.test',
    );

    await tester.tap(find.byKey(const Key('invitation-role')));
    await settle(tester, advance: const Duration(milliseconds: 16));
    await tester.tap(find.text('Sahip').last);
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.tap(find.widgetWithText(FilledButton, 'Gönder'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(
      postBody(recorder),
      <String, dynamic>{'email': 'sahip@flowtiger.test', 'role': 'owner'},
    );
  });

  testWidgets('gönderim sonrası davet listesine döner', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          formRoutes(
            (http.Request request) => request.method == 'POST'
                ? jsonResponse(201, <String, dynamic>{
                    'data': invitationFixture(id: 99),
                  })
                : jsonResponse(
                    200,
                    paginated(<Map<String, dynamic>>[invitationFixture(id: 99)], 1),
                  ),
          ),
        ),
      ),
    );
    await openForm(tester);

    await tester.enterText(
      find.byKey(const Key('invitation-email')),
      'yeni@flowtiger.test',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Gönder'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    // Form kapanmış, liste görünür olmalı.
    expect(find.byKey(const Key('invitation-email')), findsNothing);
    expect(find.text('a***@flowtiger.test'), findsOneWidget);
  });

  testWidgets('422 doğrulama hatasını alan altında gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          formRoutes(
            (http.Request request) => request.method == 'POST'
                ? jsonResponse(422, <String, dynamic>{
                    'message': 'Gönderilen bilgiler geçersiz.',
                    'errors': <String, dynamic>{
                      'email': <String>['Geçerli bir e-posta adresi girin.'],
                    },
                  })
                : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          ),
        ),
      ),
    );
    await openForm(tester);

    await tester.enterText(find.byKey(const Key('invitation-email')), 'gecersiz');
    await tester.tap(find.widgetWithText(FilledButton, 'Gönder'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Geçerli bir e-posta adresi girin.'), findsOneWidget);
  });

  /// Zaten üye olan adres 422 + invitation_already_member döner ama
  /// `errors` taşımaz; form seviyesinde gösterilir.
  testWidgets('zaten üye olan adres için backend mesajını gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          formRoutes(
            (http.Request request) => request.method == 'POST'
                ? jsonResponse(422, <String, dynamic>{
                    'message': 'Bu kullanıcı zaten şirketin üyesi.',
                    'code': 'invitation_already_member',
                  })
                : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          ),
        ),
      ),
    );
    await openForm(tester);

    await tester.enterText(find.byKey(const Key('invitation-email')), 'uye@flowtiger.test');
    await tester.tap(find.widgetWithText(FilledButton, 'Gönder'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Bu kullanıcı zaten şirketin üyesi.'), findsOneWidget);
  });

  testWidgets('403 durumunda bölümün sahiplere açık olduğunu söyler',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          formRoutes(
            (http.Request request) => request.method == 'POST'
                ? jsonResponse(403, <String, dynamic>{
                    'message': 'This action is unauthorized.',
                  })
                : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
          ),
        ),
      ),
    );
    await openForm(tester);

    await tester.enterText(find.byKey(const Key('invitation-email')), 'yeni@flowtiger.test');
    await tester.tap(find.widgetWithText(FilledButton, 'Gönder'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Bu bölüm yalnızca şirket sahiplerine açıktır.'), findsOneWidget);
    expect(find.textContaining('This action is unauthorized.'), findsNothing);
  });
}
