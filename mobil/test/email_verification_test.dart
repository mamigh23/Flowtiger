import 'dart:async';

import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flowtiger/widgets/ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// E-posta doğrulama — YALNIZCA "yeniden gönder" tarafı.
///
/// BACKEND SÖZLEŞMESİ:
///   POST /auth/email/verification-notification → 200, gövde BOŞ
///
/// GET /auth/email/verify/{id}/{hash} BU ALT FAZIN DIŞINDADIR: kimlik
/// doğrulaması olmayan, imzalı bir uçtur ve bağlantı mail istemcisinden
/// tıklanır. Üstelik backend'de o bağlantı için bir frontend URL şablonu
/// tanımlı değil — link doğrudan API'ye gidiyor. Bunu uygulamada taklit
/// etmek, olmayan bir akışı varmış gibi göstermek olurdu.
///
/// AYRI BİR "DURUM" UCU YOKTUR. Doğrulama durumu `email_verified_at`
/// alanından okunur; GET /profile zaten onu döndürüyor.
///
/// HEDEF ADRES PARAMETRESİ YOKTUR ve olmamalı: kullanıcı yalnızca KENDİ
/// adresi için bağlantı ister. Başkasının adresini hedefleyen bir alan,
/// "bu adres sistemde kayıtlı mı?" sorusunu herkese açık hâle getirirdi.
///
/// ZATEN DOĞRULANMIŞ HESAP HATA DÖNDÜRMEZ: yanıt yine 200'dür ve durumu
/// makine-okunur bir `code` ile bildirir.
///
/// THROTTLE GERÇEKTİR: 6/dk, kullanıcı id bazlı.
void main() {
  const String verificationPath = '/auth/email/verification-notification';

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

  Map<String, dynamic> profileFixture({String? verifiedAt}) => <String, dynamic>{
        'id': 1,
        'name': 'Ada Lovelace',
        'email': 'ada@flowtiger.test',
        'email_verified_at': verifiedAt,
        'active_company_id': 7,
        'created_at': '2026-08-01T10:00:00Z',
      };

  Map<String, dynamic> notificationBody(String code, String message) => <String, dynamic>{
        'data': <String, dynamic>{'message': message, 'code': code},
      };

  Map<String, ApiRoute> screenRoutes(ApiRoute notification, {String? verifiedAt}) =>
      <String, ApiRoute>{
        ...sessionRoutes(),
        verificationPath: notification,
        '/profile': (_) =>
            jsonResponse(200, <String, dynamic>{'data': profileFixture(verifiedAt: verifiedAt)}),
      };

  Future<void> openAccount(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Profil'));
    await settle(tester);
    await tester.tap(find.text('Hesap bilgileri'));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  Future<void> send(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(FilledButton, 'Doğrulama bağlantısı gönder'));
    await settle(tester);
  }

  // -------------------------------------------------------------- durum

  testWidgets('doğrulanmamış hesapta durumu ve gönder düğmesini gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          screenRoutes((_) => jsonResponse(200, notificationBody('verification_link_sent', 'x'))),
        ),
      ),
    );
    await openAccount(tester);

    expect(find.text('Doğrulama bekliyor'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Doğrulama bağlantısı gönder'), findsOneWidget);
  });

  testWidgets('doğrulanmış hesapta gönder düğmesi göstermez', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          screenRoutes(
            (_) => jsonResponse(200, notificationBody('verification_link_sent', 'x')),
            verifiedAt: '2026-08-01T10:00:00Z',
          ),
        ),
      ),
    );
    await openAccount(tester);

    expect(find.text('Doğrulandı'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Doğrulama bağlantısı gönder'), findsNothing);
  });

  // ----------------------------------------------------------- gönderim

  /// REGRESYON — GÖVDE BOŞ, SORGU BOŞ.
  ///
  /// `email` alanı eklenseydi uç, kimliği doğrulanmış bir çağıran için
  /// adres sayım (enumeration) yüzeyine dönüşürdü.
  testWidgets('boş gövdeyle POST eder, hedef adres göndermez', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(
        screenRoutes(
          (_) => jsonResponse(
            200,
            notificationBody(
              'verification_link_sent',
              'Doğrulama bağlantısı e-posta adresinize gönderildi.',
            ),
          ),
        ),
      ),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openAccount(tester);
    await send(tester);

    final http.Request request = recorder.requests.firstWhere(
      (http.Request request) => request.url.path.endsWith(verificationPath),
    );

    expect(request.method, 'POST');
    expect(request.body, isEmpty);
    expect(request.url.queryParameters, isEmpty);
  });

  testWidgets('verification_link_sent kodunda gönderildi bilgisi gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          screenRoutes(
            (_) => jsonResponse(
              200,
              notificationBody(
                'verification_link_sent',
                'Doğrulama bağlantısı e-posta adresinize gönderildi.',
              ),
            ),
          ),
        ),
      ),
    );
    await openAccount(tester);
    await send(tester);

    expect(
      find.text('Doğrulama bağlantısı e-posta adresinize gönderildi.'),
      findsOneWidget,
    );
  });

  /// Zaten doğrulanmış hesap HATA DEĞİLDİR: 200 döner. Arayüz bunu bir
  /// hata gibi göstermemeli.
  testWidgets('already_verified kodunda hata göstermez', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          screenRoutes(
            (_) => jsonResponse(
              200,
              notificationBody('already_verified', 'E-posta adresiniz zaten doğrulanmış.'),
            ),
          ),
        ),
      ),
    );
    await openAccount(tester);
    await send(tester);

    expect(find.text('E-posta adresiniz zaten doğrulanmış.'), findsOneWidget);
    expect(find.byType(FtErrorState), findsNothing);
  });

  /// REGRESYON — KARAR `code` ALANINA GÖRE VERİLİR, METNE GÖRE DEĞİL.
  ///
  /// Backend mesajı bir gün değişebilir (dil, noktalama, kelime). Metin
  /// eşleştiren bir arayüz o gün sessizce yanlış davranır. Burada backend
  /// bilerek "gönderildi" diyen bir mesajla `already_verified` kodu
  /// döndürüyor; arayüz koda uymalı.
  testWidgets('kararını backend metnine değil code alanına göre verir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          screenRoutes(
            (_) => jsonResponse(
              200,
              notificationBody(
                'already_verified',
                'Doğrulama bağlantısı e-posta adresinize gönderildi.',
              ),
            ),
          ),
        ),
      ),
    );
    await openAccount(tester);
    await send(tester);

    expect(find.text('Doğrulandı'), findsOneWidget);
    expect(find.text('Doğrulama bekliyor'), findsNothing);
  });

  /// `already_verified` geldiyse adres başka bir yerde doğrulanmış
  /// demektir; gönder düğmesinin durması anlamsız olurdu.
  testWidgets('already_verified sonrası gönder düğmesini kaldırır',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(
          screenRoutes(
            (_) => jsonResponse(
              200,
              notificationBody('already_verified', 'E-posta adresiniz zaten doğrulanmış.'),
            ),
          ),
        ),
      ),
    );
    await openAccount(tester);
    await send(tester);

    expect(find.widgetWithText(FilledButton, 'Doğrulama bağlantısı gönder'), findsNothing);
  });

  // ---------------------------------------------------------------- 429

  testWidgets('429 durumunda backendin bildirdiği bekleme süresini gösterir',
      (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage();

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(
          screenRoutes(
            (_) => http.Response(
              '{"message":"Too Many Attempts."}',
              429,
              headers: <String, String>{
                'content-type': 'application/json',
                'retry-after': '30',
              },
            ),
          ),
        ),
      ),
    );
    await openAccount(tester);
    await send(tester);

    expect(find.textContaining('30 saniye'), findsOneWidget);
    expect(find.textContaining('Too Many Attempts.'), findsNothing);
    expect(await storage.read(), 'gecerli-token');
  });

  // ---------------------------------------------------------------- 401

  testWidgets('401 durumunda oturumu kapatır', (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage('artik-gecersiz');

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(
          screenRoutes(
            (_) => jsonResponse(401, <String, dynamic>{'message': 'Unauthenticated.'}),
          ),
        ),
      ),
    );
    await openAccount(tester);
    await send(tester);

    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsOneWidget);
    expect(await storage.read(), isNull);
  });

  // ------------------------------------------------- çift gönderim kilidi

  testWidgets('gönderim sürerken düğmeyi kapatır', (WidgetTester tester) async {
    final Completer<http.Response> gate = Completer<http.Response>();
    final http.Response Function(http.Request) base = routes(
      screenRoutes((_) => jsonResponse(200, notificationBody('verification_link_sent', 'x'))),
    );

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        asyncHandler: (http.Request request) {
          if (request.url.path.endsWith(verificationPath)) return gate.future;
          return Future<http.Response>.value(base(request));
        },
      ),
    );
    await openAccount(tester);
    await send(tester);

    // Anahtarla aranır, metinle DEĞİL: gönderim sırasında düğmenin
    // çocuğu göstergeye dönüşebilir ve metin bir an için kaybolur.
    FilledButton button() =>
        tester.widget<FilledButton>(find.byKey(const Key('verification-send')));

    expect(button().onPressed, isNull);

    gate.complete(
      jsonResponse(
        200,
        notificationBody(
          'verification_link_sent',
          'Doğrulama bağlantısı e-posta adresinize gönderildi.',
        ),
      ),
    );
    await settle(tester);

    expect(
      find.text('Doğrulama bağlantısı e-posta adresinize gönderildi.'),
      findsOneWidget,
    );
  });
}
