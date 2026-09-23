import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

void main() {
  testWidgets('reset bağlantısından tokenı çıkarıp gönderir', (tester) async {
    String? body;

    await tester.pumpWidget(
      appWith(
        storage: InMemoryTokenStorage(),
        handler: routes(<String, ApiRoute>{
          '/auth/password/reset': (http.Request request) {
            body = request.body;
            return jsonResponse(200, <String, dynamic>{
              'data': <String, dynamic>{
                'message': 'Parola sıfırlama tamamlandı.',
                'code': 'password_reset_completed',
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
    await tester.tap(find.text('Sıfırlama ekranını aç'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.enterText(
      find.byKey(const Key('reset-input')),
      'https://app.example.test/password/reset/abc-token?email=ada%40flowtiger.test',
    );
    await tester.enterText(find.byKey(const Key('reset-password')), 'new-password-value');
    await tester.enterText(find.byKey(const Key('reset-confirmation')), 'new-password-value');
    await tester.tap(find.text('Parolayı sıfırla'));
    await settle(tester);

    final Map<String, dynamic> sent =
        jsonDecode(body!) as Map<String, dynamic>;

    expect(sent['email'], 'ada@flowtiger.test');
    expect(sent['token'], 'abc-token');
    expect(sent['password'], 'new-password-value');
    expect(sent['password_confirmation'], 'new-password-value');
    expect(find.byKey(const Key('reset-success')), findsOneWidget);
  });

  testWidgets('geçersiz token hatasını form seviyesinde gösterir', (tester) async {
    await tester.pumpWidget(
      appWith(
        storage: InMemoryTokenStorage(),
        handler: routes(<String, ApiRoute>{
          '/auth/password/reset': (_) => jsonResponse(422, <String, dynamic>{
                'message': 'Sıfırlama bağlantısı geçersiz.',
                'code': 'invalid_password_reset_token',
              }),
        }),
      ),
    );
    await settle(tester);

    await tester.tap(find.text('Parolamı unuttum'));
    await settle(tester, advance: const Duration(milliseconds: 16));
    await tester.tap(find.text('Sıfırlama bağlantısı gönder'));
    await settle(tester);
    await tester.tap(find.text('Sıfırlama ekranını aç'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.enterText(find.byKey(const Key('reset-input')), 'invalid-token');
    await tester.enterText(find.byKey(const Key('reset-email')), 'ada@flowtiger.test');
    await tester.enterText(find.byKey(const Key('reset-password')), 'new-password-value');
    await tester.enterText(find.byKey(const Key('reset-confirmation')), 'new-password-value');
    await tester.tap(find.text('Parolayı sıfırla'));
    await settle(tester);

    expect(find.text('Sıfırlama bağlantısı geçersiz.'), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byKey(const Key('reset-password'))).controller!.text,
      isEmpty,
    );
    expect(
      tester.widget<TextField>(find.byKey(const Key('reset-confirmation'))).controller!.text,
      isEmpty,
    );
  });
}
