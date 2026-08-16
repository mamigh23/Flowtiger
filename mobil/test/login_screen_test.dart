import 'dart:convert';

import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Giriş ekranı — ilk gerçek ürün ekranı.
void main() {
  Future<void> fillCredentials(WidgetTester tester) async {
    await tester.enterText(find.byKey(const Key('login-email')), 'ada@flowtiger.test');
    await tester.enterText(find.byKey(const Key('login-password')), 'gizli-parola');
  }

  testWidgets('parola varsayılan olarak gizli, düğmeyle görünür olur',
      (WidgetTester tester) async {
    await tester.pumpWidget(appWith(storage: InMemoryTokenStorage()));
    await settle(tester);

    TextField passwordField() =>
        tester.widget<TextField>(find.byKey(const Key('login-password')));

    expect(passwordField().obscureText, isTrue);

    await tester.tap(find.byTooltip('Parolayı göster'));
    await tester.pump();
    expect(passwordField().obscureText, isFalse);

    await tester.tap(find.byTooltip('Parolayı gizle'));
    await tester.pump();
    expect(passwordField().obscureText, isTrue);
  });

  testWidgets('başarılı girişte token saklar ve doğru gövdeyi gönderir',
      (WidgetTester tester) async {
    final InMemoryTokenStorage storage = InMemoryTokenStorage();

    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        '/auth/login': (_) => jsonResponse(200, <String, dynamic>{
              'data': <String, dynamic>{
                'token': 'yeni-token',
                'user': userFixture(),
              },
            }),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture()],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      }),
    );

    await tester.pumpWidget(appWith(storage: storage, handler: recorder.call));
    await settle(tester);

    await fillCredentials(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Giriş yap'));
    await settle(tester);

    expect(await storage.read(), 'yeni-token');

    final http.Request login = recorder.requests
        .firstWhere((http.Request request) => request.url.path.endsWith('/auth/login'));

    expect(
      jsonDecode(login.body),
      <String, String>{'email': 'ada@flowtiger.test', 'password': 'gizli-parola'},
    );
  });

  testWidgets('gönderim sonrası parolayı arayüzde bırakmaz',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: InMemoryTokenStorage(),
        handler: routes(<String, ApiRoute>{
          '/auth/login': (_) => jsonResponse(
                401,
                <String, dynamic>{'message': 'Kimlik bilgileri hatalı.'},
              ),
        }),
      ),
    );
    await settle(tester);

    await fillCredentials(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Giriş yap'));
    await settle(tester);

    final TextField password =
        tester.widget<TextField>(find.byKey(const Key('login-password')));

    expect(password.controller?.text, isEmpty);
    // E-posta korunur: kullanıcı yeniden yazmak zorunda kalmamalı.
    final TextField email =
        tester.widget<TextField>(find.byKey(const Key('login-email')));
    expect(email.controller?.text, 'ada@flowtiger.test');
  });

  testWidgets('401 durumunda kullanıcı dostu mesaj gösterir',
      (WidgetTester tester) async {
    final InMemoryTokenStorage storage = InMemoryTokenStorage();

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(<String, ApiRoute>{
          '/auth/login': (_) => jsonResponse(
                401,
                <String, dynamic>{
                  'message': 'Kimlik bilgileri hatalı.',
                  'code': 'invalid_credentials',
                },
              ),
        }),
      ),
    );
    await settle(tester);

    await fillCredentials(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Giriş yap'));
    await settle(tester);

    expect(find.text('Kimlik bilgileri hatalı.'), findsOneWidget);
    expect(await storage.read(), isNull);
  });

  testWidgets('422 doğrulama hatalarını alan altında gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: InMemoryTokenStorage(),
        handler: routes(<String, ApiRoute>{
          '/auth/login': (_) => jsonResponse(422, <String, dynamic>{
                'message': 'Gönderilen bilgiler geçersiz.',
                'errors': <String, dynamic>{
                  'email': <String>['E-posta alanı zorunludur.'],
                },
              }),
        }),
      ),
    );
    await settle(tester);

    await fillCredentials(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Giriş yap'));
    await settle(tester);

    expect(find.text('E-posta alanı zorunludur.'), findsOneWidget);
  });

  testWidgets('429 durumunda bekleme süresini söyler', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: InMemoryTokenStorage(),
        handler: routes(<String, ApiRoute>{
          '/auth/login': (_) => http.Response(
                jsonEncode(<String, dynamic>{'message': 'Çok fazla deneme.'}),
                429,
                headers: <String, String>{
                  'content-type': 'application/json',
                  'retry-after': '60',
                },
              ),
        }),
      ),
    );
    await settle(tester);

    await fillCredentials(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Giriş yap'));
    await settle(tester);

    expect(find.textContaining('60 saniye'), findsOneWidget);
  });
}
