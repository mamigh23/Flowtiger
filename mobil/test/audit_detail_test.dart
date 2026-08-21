import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Denetim ayrıntı paneli — web ile AYNI sözleşme.
///
/// AYRI DETAY ROTASI YOK. Backend'de tekil audit ucu yoktur; ayrı bir
/// ekran ancak listedeki nesneyi taşıyarak ya da uydurma bir istekle
/// çalışırdı. Ayrıntı satırın İÇİNDE açılır ve EK İSTEK YAPMAZ.
///
/// HAM JSON HİÇBİR YERDE BASILMAZ. `metadata`, `old_values` ve
/// `new_values` serbest biçimli sözlüklerdir; içerikleri eyleme göre
/// değişir ve zamanla genişler. Ham sözlüğü ekrana dökmek, bugün zararsız
/// görünen bir alanın yarın kullanıcıya görünmesi demektir — üstelik
/// kimse fark etmeden.
///
/// Gösterim BEYAZ LİSTEYLE sınırlıdır (audit_format.dart). Ayrıntılı
/// gerekçe ve saf fonksiyon testleri: test/audit_format_test.dart.
void main() {
  bool isListRequest(http.Request request) =>
      request.url.queryParameters.containsKey('page');

  Map<String, ApiRoute> sessionRoutes() => <String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, dynamic>{'data': userFixture()}),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture()],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      };

  final List<Map<String, dynamic>> threeLogs = <Map<String, dynamic>>[
    auditLogFixture(
      id: 100,
      actorName: 'Ada Lovelace',
      newValues: <String, dynamic>{'name': 'Zeynep Kaya', 'phone': '05551112233'},
    ),
    auditLogFixture(
      id: 101,
      action: 'member.role_changed',
      actorId: 22,
      actorName: 'Mert Demir',
      auditableType: 'user',
      auditableId: 22,
      oldValues: <String, dynamic>{'role': 'member'},
      newValues: <String, dynamic>{'role': 'owner'},
    ),
    auditLogFixture(
      id: 102,
      action: 'invitation.created',
      actorId: 23,
      actorName: 'Elif Şahin',
      auditableType: 'invitation',
      auditableId: 41,
      metadata: <String, dynamic>{'role': 'member', 'created_new_account': true},
    ),
  ];

  Future<void> openAudit(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Profil'));
    await settle(tester);
    await tester.tap(find.text('Denetim Geçmişi'));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  Future<void> pumpWith(
    WidgetTester tester,
    List<Map<String, dynamic>> logs, {
    RecordingHandler? recorder,
  }) async {
    final http.Response Function(http.Request) handler = routes(<String, ApiRoute>{
      ...sessionRoutes(),
      '/audit-logs': (http.Request request) => isListRequest(request)
          ? jsonResponse(200, paginated(logs, logs.length))
          : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
    });

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: recorder == null ? handler : recorder.call,
      ),
    );
    await openAudit(tester);
  }

  Future<void> toggle(WidgetTester tester, int id) async {
    await tester.tap(find.byKey(Key('audit-toggle-$id')));
    await settle(tester);
  }

  // ------------------------------------------------------- açılıp kapanma

  testWidgets('ayrıntılar varsayılan olarak kapalıdır', (WidgetTester tester) async {
    await pumpWith(tester, threeLogs);

    expect(find.byKey(const Key('audit-toggle-100')), findsOneWidget);
    expect(find.byKey(const Key('audit-detail-100')), findsNothing);
    expect(find.byKey(const Key('audit-detail-101')), findsNothing);
    expect(find.byKey(const Key('audit-detail-102')), findsNothing);
  });

  testWidgets('ayrıntı düğmesine basınca satırın ayrıntısı açılır',
      (WidgetTester tester) async {
    await pumpWith(tester, threeLogs);
    await toggle(tester, 100);

    expect(find.byKey(const Key('audit-detail-100')), findsOneWidget);
    expect(find.text('Ad'), findsOneWidget);
    expect(find.textContaining('Zeynep Kaya'), findsOneWidget);
  });

  testWidgets('tekrar basınca ayrıntı kapanır', (WidgetTester tester) async {
    await pumpWith(tester, threeLogs);

    await toggle(tester, 100);
    expect(find.byKey(const Key('audit-detail-100')), findsOneWidget);

    await toggle(tester, 100);
    expect(find.byKey(const Key('audit-detail-100')), findsNothing);
  });

  testWidgets('yalnızca basılan kaydın ayrıntısı açılır', (WidgetTester tester) async {
    await pumpWith(tester, threeLogs);
    await toggle(tester, 101);

    expect(find.byKey(const Key('audit-detail-101')), findsOneWidget);
    expect(find.byKey(const Key('audit-detail-100')), findsNothing);
    expect(find.byKey(const Key('audit-detail-102')), findsNothing);
  });

  /// Gösterilecek hiçbir güvenli ayrıntı yoksa düğme HİÇ ÇIKMAZ. Boş bir
  /// paneli açan düğme, kullanıcıya bilgi gizlendiği izlenimi verir.
  testWidgets('gösterilecek ayrıntı yoksa ayrıntı düğmesi göstermez',
      (WidgetTester tester) async {
    await pumpWith(tester, <Map<String, dynamic>>[
      auditLogFixture(id: 300, action: 'company.selected'),
    ]);

    expect(find.text('Şirket seçildi'), findsOneWidget);
    expect(find.byKey(const Key('audit-toggle-300')), findsNothing);
  });

  /// AYRI ROTA YOK ve EK İSTEK YOK: ayrıntı listedeki nesneden gelir.
  testWidgets('ayrıntı ayrı bir ekrana gitmez ve yeni istek yapmaz',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/audit-logs': (http.Request request) => isListRequest(request)
            ? jsonResponse(200, paginated(threeLogs, 3))
            : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      }),
    );

    await pumpWith(tester, threeLogs, recorder: recorder);

    final int before = recorder.requests.length;
    await toggle(tester, 100);

    expect(recorder.requests.length, before);

    // Liste hâlâ ekranda: yeni bir rota açılsaydı diğer satırlar ve
    // başlık görünmezdi.
    expect(find.text('Denetim Geçmişi'), findsOneWidget);
    expect(find.text('Üye rolü değiştirildi'), findsOneWidget);
  });

  // ------------------------------------------------------------- metadata

  testWidgets('metadata anahtarlarını etiketli gösterir', (WidgetTester tester) async {
    await pumpWith(tester, <Map<String, dynamic>>[
      auditLogFixture(
        id: 301,
        action: 'invitation.created',
        metadata: <String, dynamic>{'role': 'member', 'created_new_account': true},
      ),
    ]);
    await toggle(tester, 301);

    expect(find.text('Rol'), findsOneWidget);
    expect(find.text('Üye'), findsOneWidget);
    expect(find.text('Yeni hesap oluşturuldu'), findsOneWidget);
    expect(find.text('Evet'), findsOneWidget);
  });

  /// `email_hash` audit'te GERÇEKTEN vardır. Sızıntı değil — ama
  /// kullanıcıya 64 karakterlik bir sha256 göstermek hiçbir şey anlatmaz.
  testWidgets('email_hash göstermez', (WidgetTester tester) async {
    const String hash =
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    await pumpWith(tester, <Map<String, dynamic>>[
      auditLogFixture(
        id: 302,
        action: 'invitation.created',
        metadata: <String, dynamic>{'email_hash': hash, 'role': 'member'},
      ),
    ]);
    await toggle(tester, 302);

    expect(find.text('Rol'), findsOneWidget);
    expect(find.textContaining(hash), findsNothing);
    expect(find.textContaining('email_hash'), findsNothing);
  });

  /// Beyaz listenin asıl sınavı: yarın backend'e eklenecek bir anahtar
  /// arayüzde KENDİLİĞİNDEN görünmemeli.
  testWidgets('tanınmayan metadata anahtarını göstermez', (WidgetTester tester) async {
    await pumpWith(tester, <Map<String, dynamic>>[
      auditLogFixture(
        id: 303,
        metadata: <String, dynamic>{'role': 'member', 'internal_ref': 'X-9912'},
      ),
    ]);
    await toggle(tester, 303);

    expect(find.textContaining('internal_ref'), findsNothing);
    expect(find.textContaining('X-9912'), findsNothing);
  });

  /// SAVUNMA AMAÇLI REGRESYON: bu anahtarlar backend'de zaten yazılmadan
  /// düşürülüyor, yani buraya normalde hiç ulaşmazlar. Arayüz yine de o
  /// tercihe körü körüne güvenmemeli.
  testWidgets('hassas görünümlü metadata anahtarlarını göstermez',
      (WidgetTester tester) async {
    await pumpWith(tester, <Map<String, dynamic>>[
      auditLogFixture(
        id: 304,
        metadata: <String, dynamic>{
          'role': 'member',
          'password': 'gizli',
          'token': 'plain-token',
          'authorization': 'Bearer x',
          'secret': 'sir',
          'company_id': 4242,
        },
      ),
    ]);
    await toggle(tester, 304);

    expect(find.textContaining('gizli'), findsNothing);
    expect(find.textContaining('plain-token'), findsNothing);
    expect(find.textContaining('Bearer'), findsNothing);
    expect(find.textContaining('4242'), findsNothing);
  });

  // ------------------------------------------------------------ değişimler

  testWidgets('eski ve yeni değeri insan okunur fark olarak gösterir',
      (WidgetTester tester) async {
    await pumpWith(tester, threeLogs);
    await toggle(tester, 101);

    expect(find.text('Rol'), findsOneWidget);
    expect(find.textContaining(RegExp(r'Üye\s*→\s*Sahip')), findsOneWidget);
  });

  /// Oluşturma kaydında eski değer YOKTUR. Boş tarafa "—" koyup sahte bir
  /// değişim iddiası kurulmaz: "— → Zeynep Kaya" satırı, olmayan bir eski
  /// değeri varmış gibi gösterirdi.
  testWidgets('oluşturma kaydında sahte bir eski değer üretmez',
      (WidgetTester tester) async {
    await pumpWith(tester, threeLogs);
    await toggle(tester, 100);

    expect(find.text('Ad'), findsOneWidget);
    expect(find.text('Zeynep Kaya'), findsOneWidget);
    expect(find.textContaining('→'), findsNothing);
    expect(find.textContaining('— →'), findsNothing);
  });

  /// Silme kaydında yeni değer YOKTUR; aynı kural tersine.
  testWidgets('silme kaydında sahte bir yeni değer üretmez', (WidgetTester tester) async {
    await pumpWith(tester, <Map<String, dynamic>>[
      auditLogFixture(
        id: 305,
        action: 'customer.deleted',
        oldValues: <String, dynamic>{'name': 'Silinen Müşteri', 'phone': '05551112233'},
      ),
    ]);
    await toggle(tester, 305);

    expect(find.text('Silinen Müşteri'), findsOneWidget);
    expect(find.textContaining('→'), findsNothing);
  });

  /// REGRESYON: `company_id` ve parola gibi alanlar farkta da görünmez.
  testWidgets('güvenli olmayan değer alanlarını farkta göstermez',
      (WidgetTester tester) async {
    await pumpWith(tester, <Map<String, dynamic>>[
      auditLogFixture(
        id: 306,
        action: 'member.updated',
        oldValues: <String, dynamic>{
          'name': 'Eski Ad',
          'password': 'gizli',
          'company_id': 4242,
          'email_hash': 'abc',
        },
        newValues: <String, dynamic>{
          'name': 'Yeni Ad',
          'password': 'gizli2',
          'company_id': 4242,
          'email_hash': 'def',
        },
      ),
    ]);
    await toggle(tester, 306);

    expect(find.textContaining(RegExp(r'Eski Ad\s*→\s*Yeni Ad')), findsOneWidget);
    expect(find.textContaining('gizli'), findsNothing);
    expect(find.textContaining('4242'), findsNothing);
    expect(find.textContaining('password'), findsNothing);
    expect(find.textContaining('email_hash'), findsNothing);
  });

  /// Ham sözlük basılsaydı süslü parantez ve tırnaklar görünürdü.
  testWidgets('ham JSON basmaz', (WidgetTester tester) async {
    await pumpWith(tester, <Map<String, dynamic>>[
      auditLogFixture(
        id: 307,
        action: 'invitation.created',
        metadata: <String, dynamic>{'role': 'member', 'email_hash': 'abc'},
        newValues: <String, dynamic>{'name': 'Zeynep Kaya'},
      ),
    ]);
    await toggle(tester, 307);

    expect(find.textContaining('{'), findsNothing);
    expect(find.textContaining('}'), findsNothing);
    expect(find.textContaining('":'), findsNothing);
  });
}
