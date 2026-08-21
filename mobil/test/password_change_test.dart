import 'dart:async';
import 'dart:convert';

import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Parola değiştirme — web ile AYNI sözleşme.
///
/// BACKEND SÖZLEŞMESİ (PUT /profile/password):
///   current_password          : required | current_password
///   new_password              : required | min:8 | confirmed
///                             | different:current_password
///   new_password_confirmation : `confirmed` kuralı bunu ZORUNLU kılar
///
/// PUT, PATCH değil: parola kısmen güncellenmez.
///
/// YANLIŞ MEVCUT PAROLA 422 DÖNER, 401 DEĞİL — ve bu ayrım arayüz için
/// hayatidir. Kullanıcının kimliği doğrulanmış durumda; hatalı olan tek
/// şey gönderdiği alan. 401 sanılıp oturum kapatılırsa, parolasını
/// yanlış yazan kullanıcı sistemden atılır.
///
/// OTURUM ETKİSİ: backend mevcut token'ı KORUR, diğerlerini iptal eder.
/// Yanıttaki `other_logins_revoked` gösterilmelidir — "hesabım ele
/// geçirilmiş miydi" sorusunu araştıran kullanıcı için tek anlamlı
/// sinyal odur.
///
/// BU UÇ OWNER-ONLY DEĞİLDİR; 403 senaryosu yoktur. Ama 429 GERÇEKTEN
/// VARDIR: `current_password` kuralı bu ucu, oturumu ele geçirmiş ama
/// parolayı bilmeyen bir saldırgan için parola DENEME yüzeyine çevirir.
/// Sınır 6/dk ve Laravel `Retry-After` başlığı gönderir.
///
/// PAROLA HİÇBİR YERE YAZILMAZ: ne log'a, ne yanıta, ne de başarıdan
/// sonra ekranda kalan bir alana.
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

  Map<String, dynamic> successBody(int revoked) => <String, dynamic>{
        'data': <String, dynamic>{
          'message': 'Parola güncellendi.',
          'other_logins_revoked': revoked,
        },
      };

  Object? requestBody(RecordingHandler recorder) {
    final Iterable<http.Request> matching = recorder.requests
        .where((http.Request request) => request.url.path.endsWith('/profile/password'));
    return matching.isEmpty ? null : jsonDecode(matching.first.body);
  }

  /// Panel → Profil → Parola değiştir.
  Future<void> openPassword(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Profil'));
    await settle(tester);
    await tester.tap(find.text('Parola değiştir'));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  Future<void> submit(
    WidgetTester tester, {
    String current = 'eski-parola',
    String next = 'yeni-parola-123',
    String? confirm,
  }) async {
    await tester.enterText(find.byKey(const Key('current-password')), current);
    await tester.enterText(find.byKey(const Key('new-password')), next);
    await tester.enterText(
      find.byKey(const Key('new-password-confirmation')),
      confirm ?? next,
    );

    await tester.tap(find.widgetWithText(FilledButton, 'Parolayı değiştir'));
    await settle(tester);
  }

  // --------------------------------------------------------------- form

  testWidgets('üç parola alanı ve bir düğme gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: routes(sessionRoutes())),
    );
    await openPassword(tester);

    expect(find.byKey(const Key('current-password')), findsOneWidget);
    expect(find.byKey(const Key('new-password')), findsOneWidget);
    expect(find.byKey(const Key('new-password-confirmation')), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Parolayı değiştir'), findsOneWidget);
  });

  /// REGRESYON: alanlar gizlidir. Düz metin bir alan omuz üstünden
  /// okunabilir ve ekran görüntüsüne düşer.
  testWidgets('alanlar parolayı gizler', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: routes(sessionRoutes())),
    );
    await openPassword(tester);

    for (final String key in <String>[
      'current-password',
      'new-password',
      'new-password-confirmation',
    ]) {
      final TextField field = tester.widget<TextField>(find.byKey(Key(key)));
      expect(field.obscureText, isTrue, reason: '$key gizlenmiyor');
    }
  });

  /// REGRESYON — GÖVDE TAM OLARAK ÜÇ ALAN.
  ///
  /// `email` ya da `user_id` eklenseydi, kimliğin gövdeden gelebileceği
  /// izlenimi doğardı. Kimlik DAİMA oturumdan gelir.
  testWidgets('yalnızca üç parola alanını PUT ile gönderir', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/profile/password': (_) => jsonResponse(200, successBody(0)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openPassword(tester);
    await submit(tester);

    final Map<String, dynamic> body = requestBody(recorder)! as Map<String, dynamic>;
    final List<String> keys = body.keys.toList()..sort();

    expect(keys, <String>[
      'current_password',
      'new_password',
      'new_password_confirmation',
    ]);
    expect(body, <String, dynamic>{
      'current_password': 'eski-parola',
      'new_password': 'yeni-parola-123',
      'new_password_confirmation': 'yeni-parola-123',
    });
    expect(
      recorder.requests.any(
        (http.Request request) =>
            request.method == 'PUT' && request.url.path.endsWith('/profile/password'),
      ),
      isTrue,
    );
  });

  // ---------------------------------------------------------- doğrulama

  /// EN KRİTİK TEST: yanlış mevcut parola bir DOĞRULAMA hatasıdır,
  /// oturum sorunu değil. Kullanıcı ekranda kalır.
  testWidgets('yanlış mevcut parolada alan hatası gösterir ve oturumu kapatmaz',
      (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage();

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/password': (_) => jsonResponse(422, <String, dynamic>{
                'message': 'Gönderilen bilgiler geçersiz.',
                'errors': <String, dynamic>{
                  'current_password': <String>['Parola hatalı.'],
                },
              }),
        }),
      ),
    );
    await openPassword(tester);
    await submit(tester);

    expect(find.text('Parola hatalı.'), findsOneWidget);

    expect(await storage.read(), 'gecerli-token');
    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsNothing);
  });

  testWidgets('kısa yeni parolada alan hatası gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/password': (_) => jsonResponse(422, <String, dynamic>{
                'message': 'Gönderilen bilgiler geçersiz.',
                'errors': <String, dynamic>{
                  'new_password': <String>['Parola en az 8 karakter olmalıdır.'],
                },
              }),
        }),
      ),
    );
    await openPassword(tester);
    await submit(tester, next: 'kisa');

    expect(find.text('Parola en az 8 karakter olmalıdır.'), findsOneWidget);
  });

  /// `confirmed` kuralının hatası `new_password` alanında döner.
  testWidgets('onay eşleşmediğinde alan hatası gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/password': (_) => jsonResponse(422, <String, dynamic>{
                'message': 'Gönderilen bilgiler geçersiz.',
                'errors': <String, dynamic>{
                  'new_password': <String>['Parola tekrarı eşleşmiyor.'],
                },
              }),
        }),
      ),
    );
    await openPassword(tester);
    await submit(tester, confirm: 'baska-bir-parola');

    expect(find.text('Parola tekrarı eşleşmiyor.'), findsOneWidget);
  });

  /// `different:current_password` kuralı.
  testWidgets('yeni parola eskisiyle aynıysa alan hatası gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/password': (_) => jsonResponse(422, <String, dynamic>{
                'message': 'Gönderilen bilgiler geçersiz.',
                'errors': <String, dynamic>{
                  'new_password': <String>['Yeni parola mevcut parolayla aynı olamaz.'],
                },
              }),
        }),
      ),
    );
    await openPassword(tester);
    await submit(tester, next: 'eski-parola');

    expect(find.text('Yeni parola mevcut parolayla aynı olamaz.'), findsOneWidget);
  });

  // ------------------------------------------------------------- başarı

  testWidgets('kapatılan diğer oturum sayısını gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/password': (_) => jsonResponse(200, successBody(3)),
        }),
      ),
    );
    await openPassword(tester);
    await submit(tester);

    final Text result = tester.widget<Text>(find.byKey(const Key('password-result')));

    expect(result.data, contains('Parola güncellendi.'));
    expect(result.data, contains('3'));
  });

  /// Mevcut oturum KORUNUR: parolasını değiştiren kullanıcıyı sistemden
  /// atmak, doğru davranışı cezalandırmak olurdu.
  testWidgets('başarıdan sonra oturum açık kalır', (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage();

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/password': (_) => jsonResponse(200, successBody(1)),
        }),
      ),
    );
    await openPassword(tester);
    await submit(tester);

    expect(await storage.read(), 'gecerli-token');
    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsNothing);
  });

  /// REGRESYON: alanlar temizlenir. Parolanın ekranda gereğinden uzun
  /// durması, cihazı elinden bırakan kullanıcı için gereksiz bir risk.
  testWidgets('başarıdan sonra parola alanlarını temizler', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/password': (_) => jsonResponse(200, successBody(0)),
        }),
      ),
    );
    await openPassword(tester);
    await submit(tester);

    for (final String key in <String>[
      'current-password',
      'new-password',
      'new-password-confirmation',
    ]) {
      final TextField field = tester.widget<TextField>(find.byKey(Key(key)));
      expect(field.controller?.text, '', reason: '$key temizlenmedi');
    }
  });

  // ---------------------------------------------------------------- 429

  /// GERÇEK SÖZLEŞME: sınır 6/dk ve Laravel `Retry-After` başlığını
  /// saniye olarak gönderir. ApiClient bunu okur; arayüz uydurma bir
  /// bekleme süresi üretmez.
  testWidgets('429 durumunda backendin bildirdiği bekleme süresini gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/password': (_) => http.Response(
                jsonEncode(<String, dynamic>{'message': 'Too Many Attempts.'}),
                429,
                headers: <String, String>{
                  'content-type': 'application/json',
                  'retry-after': '42',
                },
              ),
        }),
      ),
    );
    await openPassword(tester);
    await submit(tester);

    expect(find.textContaining('42 saniye'), findsOneWidget);
    // Backend'in ham İngilizce metni kullanıcıya gösterilmez.
    expect(find.textContaining('Too Many Attempts.'), findsNothing);
  });

  testWidgets('429 durumunda oturumu kapatmaz', (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage();

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/password': (_) => http.Response(
                jsonEncode(<String, dynamic>{'message': 'Too Many Attempts.'}),
                429,
                headers: <String, String>{
                  'content-type': 'application/json',
                  'retry-after': '42',
                },
              ),
        }),
      ),
    );
    await openPassword(tester);
    await submit(tester);

    expect(await storage.read(), 'gecerli-token');
    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsNothing);
  });

  // ---------------------------------------------------------------- 401

  testWidgets('401 durumunda oturumu kapatır', (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage('artik-gecersiz');

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/password': (_) =>
              jsonResponse(401, <String, dynamic>{'message': 'Unauthenticated.'}),
        }),
      ),
    );
    await openPassword(tester);
    await submit(tester);

    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsOneWidget);
    expect(await storage.read(), isNull);
  });

  // ----------------------------------------------------------- gönderim

  testWidgets('gönderim sürerken düğmeyi kapatır', (WidgetTester tester) async {
    final Completer<http.Response> gate = Completer<http.Response>();
    final http.Response Function(http.Request) base = routes(sessionRoutes());

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        asyncHandler: (http.Request request) {
          if (request.url.path.endsWith('/profile/password')) return gate.future;
          return Future<http.Response>.value(base(request));
        },
      ),
    );
    await openPassword(tester);
    await submit(tester);

    // Anahtarla aranır, metinle DEĞİL: gönderim sırasında düğmenin
    // çocuğu göstergeye dönüşebilir ve metin bir an için kaybolur.
    FilledButton button() =>
        tester.widget<FilledButton>(find.byKey(const Key('password-submit')));

    expect(button().onPressed, isNull);

    gate.complete(jsonResponse(200, successBody(0)));
    await settle(tester);

    expect(button().onPressed, isNotNull);
  });
}
