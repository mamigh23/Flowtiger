import 'dart:async';
import 'dart:convert';

import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Profil — kullanıcının KENDİ hesabı. Web ile AYNI sözleşme.
///
/// BACKEND SÖZLEŞMESİ:
///   GET /profile → UserResource
///   PUT /profile → UserResource   gövde: { name, email }
///
/// PATCH YOK. Gövde TAM OLARAK iki alan taşır.
///
/// BU UÇ OWNER-ONLY DEĞİLDİR ve hiçbir rol kontrolü içermez. Kullanıcı
/// kendi kaydını düzenliyor; yetkilendirilecek bir "başkası" kavramı hiç
/// oluşmuyor. Bu yüzden burada 403 senaryosu YOKTUR — olmayan bir duruma
/// test yazmak, bir gün yanlış yerde gösterilecek bir arayüz yazmaktır.
///
/// `company.context` de yok: hesap yönetimi hiçbir şirkete üye olmayı
/// gerektirmez.
///
/// GÖVDEYE KONSA BİLE ETKİSİ OLMAYAN ALANLAR (ProfileUpdateRequest):
///   user_id, role, active_company_id, company_id, password
/// Backend bunlar için `prohibited` kuralı YAZMAMIŞTIR — 422 dönmek
/// "hangi alan adları tanınıyor" bilgisini sızdırırdı. Yani arayüzün
/// onları göndermemesi bir nezaket değil, sözleşmenin kendisidir.
///
/// KRİTİK YAN ETKİ: e-posta DEĞİŞİRSE `email_verified_at` null'a düşer.
/// Aynı adres yeniden gönderilirse doğrulama bozulmaz.
///
/// GEZİNME: Profil sekmesi bir başlangıç noktasıdır; hesap formu ayrı
/// bir ekrana açılır. Hepsini tek sekmeye yığmak, parola alanlarını
/// ekranın altına düşürür ve mobilde gerçek bir kullanım kusuru olurdu.
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

  /// Backend UserResource'u — doğrulanmış hesap.
  Map<String, dynamic> profileFixture({
    String name = 'Ada Lovelace',
    String email = 'ada@flowtiger.test',
    String? verifiedAt = '2026-08-01T10:00:00Z',
  }) =>
      <String, dynamic>{
        'id': 1,
        'name': name,
        'email': email,
        'email_verified_at': verifiedAt,
        'active_company_id': 7,
        'created_at': '2026-08-01T10:00:00Z',
      };

  Object? putBody(RecordingHandler recorder) {
    final Iterable<http.Request> matching = recorder.requests.where(
      (http.Request request) =>
          request.method == 'PUT' && request.url.path.endsWith('/profile'),
    );
    return matching.isEmpty ? null : jsonDecode(matching.first.body);
  }

  /// Panel → Profil → Hesap bilgileri.
  ///
  /// `advance` YALNIZCA push sonrası verilir: MaterialPageRoute animasyonu
  /// zaman geçmeden tamamlanmaz ve eski ekran ağaçta asılı kalır.
  Future<void> openAccount(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Profil'));
    await settle(tester);
    await tester.tap(find.text('Hesap bilgileri'));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  Future<void> save(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester);
  }

  // ------------------------------------------------------------ yükleme

  testWidgets('profil bilgilerini forma doldurur', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile': (_) => jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
        }),
      ),
    );
    await openAccount(tester);

    final TextField name = tester.widget<TextField>(find.byKey(const Key('profile-name')));
    final TextField email = tester.widget<TextField>(find.byKey(const Key('profile-email')));

    expect(name.controller?.text, 'Ada Lovelace');
    expect(email.controller?.text, 'ada@flowtiger.test');
  });

  /// REGRESYON — VERİ /profile'DAN GELİR.
  ///
  /// /me ile /profile aynı gövdeyi döndürür ama aynı şey değildir: /me
  /// kimlik sorgusu, /profile profil kaynağının kökü. Ekran kendi
  /// kaynağını okumazsa, başka bir cihazdan yapılmış bir değişiklik hiç
  /// görünmez.
  testWidgets('formu /profile ucundan doldurur, oturumdaki kullanıcıdan değil',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/me': (_) => jsonResponse(200, <String, dynamic>{
                'data': <String, dynamic>{...userFixture(), 'name': 'Bayat Ada'},
              }),
          '/profile': (_) => jsonResponse(
                200,
                <String, dynamic>{'data': profileFixture(name: 'Güncel Ada')},
              ),
        }),
      ),
    );
    await openAccount(tester);

    final TextField name = tester.widget<TextField>(find.byKey(const Key('profile-name')));
    expect(name.controller?.text, 'Güncel Ada');
  });

  /// Yanıt BİLEREK askıda tutulur: eşzamanlı çözülen bir yanıtta ekran
  /// yükleme karesini hiç göstermeden sonuca geçebilir.
  testWidgets('yüklenirken bekleme göstergesi gösterir, veri gelince kaldırır',
      (WidgetTester tester) async {
    final Completer<http.Response> gate = Completer<http.Response>();
    final http.Response Function(http.Request) base = routes(sessionRoutes());

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        asyncHandler: (http.Request request) {
          if (request.url.path.endsWith('/profile')) return gate.future;
          return Future<http.Response>.value(base(request));
        },
      ),
    );
    await openAccount(tester);

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.byKey(const Key('profile-name')), findsNothing);

    gate.complete(jsonResponse(200, <String, dynamic>{'data': profileFixture()}));
    await settle(tester);

    expect(find.byKey(const Key('profile-name')), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  // ----------------------------------------------------------- kaydetme

  /// REGRESYON — GÖVDE TAM OLARAK { name, email }.
  testWidgets('yalnızca ad ve e-posta gönderir', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/profile': (http.Request request) => request.method == 'PUT'
            ? jsonResponse(
                200,
                <String, dynamic>{'data': profileFixture(name: 'Ada L. Byron')},
              )
            : jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openAccount(tester);

    await tester.enterText(find.byKey(const Key('profile-name')), 'Ada L. Byron');
    await save(tester);

    final Map<String, dynamic> body = putBody(recorder)! as Map<String, dynamic>;
    final List<String> keys = body.keys.toList()..sort();

    expect(keys, <String>['email', 'name']);
    expect(body, <String, dynamic>{
      'name': 'Ada L. Byron',
      'email': 'ada@flowtiger.test',
    });
  });

  /// REGRESYON — YASAK ALANLAR GÖVDEDE YOK.
  testWidgets('rol, şirket, kimlik ve parola alanlarını göndermez',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/profile': (_) => jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openAccount(tester);
    await save(tester);

    final Map<String, dynamic> body = putBody(recorder)! as Map<String, dynamic>;

    expect(body.containsKey('role'), isFalse);
    expect(body.containsKey('company_id'), isFalse);
    expect(body.containsKey('active_company_id'), isFalse);
    expect(body.containsKey('user_id'), isFalse);
    expect(body.containsKey('password'), isFalse);
  });

  testWidgets('kaydedince başarı bildirimi gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile': (_) => jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
        }),
      ),
    );
    await openAccount(tester);
    await save(tester);

    expect(find.text('Profil bilgileriniz güncellendi.'), findsOneWidget);
  });

  /// Baştaki/sondaki boşluk backend'in `email` kuralına takılır ve
  /// kullanıcı sebebini anlamaz. Normalizasyonun kendisi (küçük harf)
  /// backend'in işidir; arayüz yalnızca boşluğu temizler.
  testWidgets('e-postanın baştaki ve sondaki boşluklarını temizleyerek gönderir',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/profile': (http.Request request) => request.method == 'PUT'
            ? jsonResponse(
                200,
                <String, dynamic>{'data': profileFixture(email: 'yeni@flowtiger.test')},
              )
            : jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openAccount(tester);

    await tester.enterText(
      find.byKey(const Key('profile-email')),
      '  Yeni@FlowTiger.test  ',
    );
    await save(tester);

    final Map<String, dynamic> body = putBody(recorder)! as Map<String, dynamic>;
    expect(body['email'], 'Yeni@FlowTiger.test');
  });

  /// Normalizasyonun sahibi backend; arayüz dönen değeri yansıtır.
  testWidgets('backendin normalize ettiği adresi forma yansıtır', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile': (http.Request request) => request.method == 'PUT'
              ? jsonResponse(
                  200,
                  <String, dynamic>{'data': profileFixture(email: 'yeni@flowtiger.test')},
                )
              : jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
        }),
      ),
    );
    await openAccount(tester);

    await tester.enterText(find.byKey(const Key('profile-email')), 'Yeni@FlowTiger.test');
    await save(tester);

    final TextField email = tester.widget<TextField>(find.byKey(const Key('profile-email')));
    expect(email.controller?.text, 'yeni@flowtiger.test');
  });

  // ------------------------------------------------- doğrulama durumu

  /// E-posta değişirse backend `email_verified_at`'i null'a çeker.
  /// Arayüz bunu PUT yanıtından okur; ek bir istek atmaz.
  testWidgets('e-posta değişince doğrulama durumu beklemeye döner',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile': (http.Request request) => request.method == 'PUT'
              ? jsonResponse(200, <String, dynamic>{
                  'data': profileFixture(email: 'yeni@flowtiger.test', verifiedAt: null),
                })
              : jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
        }),
      ),
    );
    await openAccount(tester);

    expect(find.text('Doğrulandı'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('profile-email')), 'yeni@flowtiger.test');
    await save(tester);

    expect(find.text('Doğrulama bekliyor'), findsOneWidget);
    expect(find.text('Doğrulandı'), findsNothing);
  });

  testWidgets('aynı e-posta gönderilince doğrulama durumu korunur',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile': (http.Request request) => request.method == 'PUT'
              ? jsonResponse(
                  200,
                  <String, dynamic>{'data': profileFixture(name: 'Ada L. Byron')},
                )
              : jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
        }),
      ),
    );
    await openAccount(tester);

    await tester.enterText(find.byKey(const Key('profile-name')), 'Ada L. Byron');
    await save(tester);

    expect(find.text('Doğrulandı'), findsOneWidget);
    expect(find.text('Doğrulama bekliyor'), findsNothing);
  });

  // ------------------------------------------------------------ sınırlar

  /// REGRESYON: profil formunda rol ya da şirket alanı YOKTUR. Rol
  /// değişimi ayrı bir uçtur ve owner'a aittir; kullanıcı kendi rolünü
  /// kendi değiştiremez.
  testWidgets('formda rol ya da şirket alanı bulunmaz', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile': (_) => jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
        }),
      ),
    );
    await openAccount(tester);

    expect(find.byKey(const Key('profile-role')), findsNothing);
    expect(find.byKey(const Key('profile-company')), findsNothing);

    // Ekranda YALNIZCA ad ve e-posta alanı vardır. Sayı iddiası, ileride
    // sessizce eklenecek üçüncü bir alanı da yakalar.
    expect(find.byType(TextField), findsNWidgets(2));
  });

  /// İSTEMCİDE ROL KAPISI YOK — ve burada rol zaten hiç sorulmaz: bu uç
  /// owner-only değildir.
  testWidgets('rol member olsa bile profil düzenlenebilir', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(role: 'member'),
        '/profile': (_) => jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openAccount(tester);
    await save(tester);

    expect(find.text('Profil bilgileriniz güncellendi.'), findsOneWidget);
    expect(
      recorder.requests.any((http.Request request) => request.method == 'PUT'),
      isTrue,
    );
  });

  // -------------------------------------------------------------- hata

  testWidgets('422 doğrulama hatalarını alan altında gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile': (http.Request request) => request.method == 'PUT'
              ? jsonResponse(422, <String, dynamic>{
                  'message': 'Gönderilen bilgiler geçersiz.',
                  'errors': <String, dynamic>{
                    'name': <String>['Ad alanı zorunludur.'],
                    'email': <String>['Bu e-posta zaten kullanılıyor.'],
                  },
                })
              : jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
        }),
      ),
    );
    await openAccount(tester);
    await save(tester);

    expect(find.text('Ad alanı zorunludur.'), findsOneWidget);
    expect(find.text('Bu e-posta zaten kullanılıyor.'), findsOneWidget);
  });

  testWidgets('sunucu hatasında ham metni göstermez', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile': (_) => jsonResponse(500, <String, dynamic>{'message': 'Server Error'}),
        }),
      ),
    );
    await openAccount(tester);

    expect(find.textContaining('Beklenmedik bir hata'), findsOneWidget);
    expect(find.textContaining('Server Error'), findsNothing);
  });

  /// Profil ekranı `push` ile açılır. Oturum düşünce yalnızca kabuğun
  /// altındaki rota değil, YIĞIN da köke inmelidir (main.dart'taki
  /// popUntil) — aksi halde kullanıcı oturumu düşmüş hâlde korumalı bir
  /// sayfaya bakmayı sürdürürdü.
  testWidgets('401 durumunda oturumu kapatır', (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage('artik-gecersiz');

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile': (_) => jsonResponse(401, <String, dynamic>{'message': 'Unauthenticated.'}),
        }),
      ),
    );
    await openAccount(tester);

    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsOneWidget);
    expect(await storage.read(), isNull);
  });

  // ---------------------------------------------------------- gönderim

  testWidgets('gönderim sürerken düğmeyi kapatır', (WidgetTester tester) async {
    final Completer<http.Response> gate = Completer<http.Response>();
    final http.Response Function(http.Request) base = routes(<String, ApiRoute>{
      ...sessionRoutes(),
      '/profile': (_) => jsonResponse(200, <String, dynamic>{'data': profileFixture()}),
    });

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        asyncHandler: (http.Request request) {
          if (request.method == 'PUT' && request.url.path.endsWith('/profile')) {
            return gate.future;
          }
          return Future<http.Response>.value(base(request));
        },
      ),
    );
    await openAccount(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester);

    // Anahtarla aranır, metinle DEĞİL: gönderim sırasında düğmenin
    // çocuğu göstergeye dönüşebilir ve metin bir an için kaybolur.
    FilledButton button() =>
        tester.widget<FilledButton>(find.byKey(const Key('profile-save')));

    expect(button().onPressed, isNull);

    gate.complete(jsonResponse(200, <String, dynamic>{'data': profileFixture()}));
    await settle(tester);

    expect(button().onPressed, isNotNull);
  });
}
