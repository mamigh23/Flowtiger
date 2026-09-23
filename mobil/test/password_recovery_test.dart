import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

void main() {
  testWidgets('login ekranından parola kurtarma ekranını açar', (tester) async {
    await tester.pumpWidget(appWith(storage: await signedInStorage()));
    await settle(tester);

    await tester.tap(find.text('Parolamı unuttum'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Parolanızı mı unuttunuz?'), findsOneWidget);
    expect(find.byKey(const Key('forgot-email')), findsOneWidget);
  });

  testWidgets('forgot isteğini gerçek endpoint gövdesiyle gönderir', (tester) async {
    await tester.pumpWidget(
      appWith(
        storage: InMemoryTokenStorage(),
        handler: routes(<String, ApiRoute>{
          '/auth/password/forgot': (http.Request request) {
            expect(request.method, 'POST');
            return jsonResponse(200, <String, dynamic>{
              'data': <String, dynamic>{
                'message': 'Sıfırlama bağlantısı istendi.',
                'code': 'password_reset_link_requested',
              },
            });
          },
        }),
      ),
    );
    await settle(tester);

    await tester.tap(find.text('Parolamı unuttum'));
    await settle(tester, advance: const Duration(milliseconds: 16));
    await tester.enterText(find.byKey(const Key('forgot-email')), 'ada@flowtiger.test');
    await tester.tap(find.text('Sıfırlama bağlantısı gönder'));
    await settle(tester);

    expect(find.byKey(const Key('forgot-success')), findsOneWidget);
  });

  testWidgets('422 e-posta hatasını gösterir', (tester) async {
    await tester.pumpWidget(
      appWith(
        storage: InMemoryTokenStorage(),
        handler: routes(<String, ApiRoute>{
          '/auth/password/forgot': (_) => jsonResponse(422, <String, dynamic>{
                'message': 'Gönderilen bilgiler geçersiz.',
                'errors': <String, dynamic>{
                  'email': <String>['E-posta alanı zorunludur.'],
                },
              }),
        }),
      ),
    );
    await settle(tester);

    await tester.tap(find.text('Parolamı unuttum'));
    await settle(tester, advance: const Duration(milliseconds: 16));
    await tester.tap(find.text('Sıfırlama bağlantısı gönder'));
    await settle(tester);

    expect(find.text('E-posta alanı zorunludur.'), findsOneWidget);
  });
}
