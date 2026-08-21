import 'dart:async';

import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Denetim kayıtları listesi — web ile AYNI sözleşme.
///
/// BACKEND SÖZLEŞMESİ (AuditLogController::index):
///   GET /audit-logs?page=N → { data, meta }
///   sıralama created_at DESC, id DESC — SABİT.
///   `per_page` dışında query parametresi YOK: arama, filtre, tarih
///   aralığı, eylem seçimi hiçbiri yok.
///
/// UÇ SALT OKUNURDUR: store/update/destroy yoktur, POST 405 döner. Audit
/// kaydı yalnızca domain işlemlerinin yan etkisi olarak doğar — API
/// üzerinden yazılabilseydi iz uydurmak mümkün olurdu. Bu yüzden bu
/// ekranda GET dışında hiçbir istek yoktur.
///
/// ALAN LİSTESİ (AuditLogResource, backend testiyle sabitlenmiş):
///   id, action, actor?, auditable?, old_values, new_values, metadata,
///   ip_address, created_at
/// `company_id` ve `user_agent` yanıtta HİÇ YOKTUR. `actor` yalnızca
/// id + name taşır.
///
/// "GİRİŞ GEÇMİŞİ" BU EKRANDA YOKTUR: login/logout kayıtlarının company_id
/// değeri NULL'dur ve CompanyScope onları bu uçtan tamamen dışarıda
/// bırakır. Arayüz böyle bir vaatte bulunmaz.
///
/// GEZİNME: Denetim'in alt çubukta SEKMESİ YOKTUR. Beş sekme zaten dolu ve
/// altıncısında etiketler sıkışırdı; üstelik denetim günlük bir iş değil,
/// ara sıra bakılan bir kayıt. Profil içinden açılır.
void main() {
  /// Uygulama panel sekmesiyle açılır ve panel de /audit-logs'a istek
  /// atar — ama özet için, `per_page=5` ile. Liste `page=N` gönderir.
  /// Durum bağımlı senaryolarda ikisi ayrılmazsa panelin isteği senaryoyu
  /// tüketir ve test yanlış şeyi ölçer.
  bool isListRequest(http.Request request) =>
      request.url.queryParameters.containsKey('page');

  Map<String, ApiRoute> sessionRoutes({String role = 'owner'}) => <String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, dynamic>{'data': userFixture()}),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture(role: role)],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      };

  /// Aktörleri BİLEREK farklı: aynı ad iki satırda görünürse
  /// `findsOneWidget` iddiaları anlamını yitirir.
  final List<Map<String, dynamic>> threeLogs = <Map<String, dynamic>>[
    auditLogFixture(
      id: 100,
      actorId: 21,
      actorName: 'Ada Lovelace',
      newValues: <String, dynamic>{'name': 'Zeynep Kaya', 'phone': '05551112233'},
      ipAddress: '198.51.100.4',
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
      ipAddress: '198.51.100.5',
    ),
    auditLogFixture(
      id: 102,
      action: 'invitation.created',
      actorId: 23,
      actorName: 'Elif Şahin',
      auditableType: 'invitation',
      auditableId: 41,
      metadata: <String, dynamic>{'email_hash': 'a', 'role': 'member'},
      ipAddress: '198.51.100.6',
    ),
  ];

  /// Panel → Profil → Denetim Geçmişi.
  ///
  /// `advance` YALNIZCA push sonrası verilir: MaterialPageRoute animasyonu
  /// zaman geçmeden tamamlanmaz ve eski ekran ağaçta asılı kalır.
  Future<void> openAudit(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Profil'));
    await settle(tester);
    await tester.tap(find.text('Denetim Geçmişi'));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  // ------------------------------------------------------------- gezinme

  /// REGRESYON: alt gezinme çubuğu BEŞ sekmede kalır.
  testWidgets('denetim alt gezinme sekmesi olarak eklenmez', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(200, paginated(threeLogs, 3)),
        }),
      ),
    );
    await settle(tester);

    expect(find.text('Panel'), findsOneWidget);
    expect(find.text('Müşteriler'), findsOneWidget);
    expect(find.text('Ekip'), findsOneWidget);
    expect(find.text('Davetler'), findsOneWidget);
    expect(find.text('Profil'), findsOneWidget);

    expect(find.text('Denetim'), findsNothing);
    expect(find.text('Denetim Geçmişi'), findsNothing);
  });

  testWidgets('profil içinden denetim geçmişi açılır', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(200, paginated(threeLogs, 3)),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.text('Denetim Geçmişi'), findsOneWidget);
    expect(find.text('Müşteri oluşturuldu'), findsOneWidget);
  });

  // --------------------------------------------------------------- liste

  testWidgets('kayıtları eylem, aktör ve IP ile listeler', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(200, paginated(threeLogs, 3)),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.text('Müşteri oluşturuldu'), findsOneWidget);
    expect(find.text('Üye rolü değiştirildi'), findsOneWidget);
    expect(find.text('Davet gönderildi'), findsOneWidget);

    expect(find.text('Ada Lovelace'), findsOneWidget);
    expect(find.text('Elif Şahin'), findsOneWidget);

    expect(find.text('198.51.100.4'), findsOneWidget);
  });

  /// Tanınmayan kod UYDURULMAZ. Backend enum'a yeni bir değer eklediğinde
  /// kullanıcı ham kodu görür; boş bir satır ya da yanlış bir metin değil.
  testWidgets('tanınmayan eylem kodunu ham hâliyle gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(
                200,
                paginated(
                  <Map<String, dynamic>>[
                    auditLogFixture(id: 200, action: 'warehouse.exported'),
                  ],
                  1,
                ),
              ),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.text('warehouse.exported'), findsOneWidget);
  });

  /// `actor` KOŞULLU bir alandır: user_id null olan kayıtta anahtar hiç
  /// gelmez. "Sistem" gibi bir metin yazmak doğrulanmamış bir varsayım
  /// olurdu.
  testWidgets('aktör alanı gelmeyen kayıtta belirsizlik işareti gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(
                200,
                paginated(
                  <Map<String, dynamic>>[auditLogFixture(id: 201, includeActor: false)],
                  1,
                ),
              ),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.text('—'), findsOneWidget);
  });

  /// REGRESYON — AKTÖR E-POSTASI GÖSTERİLMEZ.
  ///
  /// Backend `actor` içinde yalnızca id ve name gönderir. Bu test, yanıt
  /// bir gün fazladan alan taşısa bile arayüzün onu ekrana basmayacağını
  /// sabitler: arayüz `actor.name` okur, `actor` nesnesini dökmez.
  ///
  /// Adres BİLEREK oturum açan kullanıcınınkinden farklı; aksi hâlde
  /// iddia profil ekranındaki adresle karışırdı.
  testWidgets('aktörün e-postası yanıtta olsa bile gösterilmez',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(
                200,
                paginated(
                  <Map<String, dynamic>>[
                    <String, dynamic>{
                      ...auditLogFixture(id: 202, actorName: 'Ada Lovelace'),
                      'actor': <String, dynamic>{
                        'id': 21,
                        'name': 'Ada Lovelace',
                        'email': 'aktor@flowtiger.test',
                      },
                    },
                  ],
                  1,
                ),
              ),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.text('Ada Lovelace'), findsOneWidget);
    expect(find.textContaining('aktor@flowtiger.test'), findsNothing);
  });

  /// REGRESYON — company_id GÖSTERİLMEZ.
  ///
  /// Backend zaten göndermiyor. Yine de sabitleniyor: çok kiracılı bir
  /// üründe iç tenant kimliğini ekrana basmak, kullanıcıya hiçbir şey
  /// anlatmayan bir iç yapı sızıntısıdır.
  testWidgets('company_id yanıtta olsa bile gösterilmez', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(
                200,
                paginated(
                  <Map<String, dynamic>>[
                    auditLogFixture(
                      id: 203,
                      extra: <String, dynamic>{'company_id': 4242, 'user_agent': 'curl/8.4'},
                    ),
                  ],
                  1,
                ),
              ),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.textContaining('4242'), findsNothing);
    expect(find.textContaining('company_id'), findsNothing);
    expect(find.textContaining('curl/8.4'), findsNothing);
  });

  testWidgets('IP boşsa belirsizlik işareti gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(
                200,
                paginated(
                  <Map<String, dynamic>>[auditLogFixture(id: 204, ipAddress: null)],
                  1,
                ),
              ),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.text('—'), findsOneWidget);
  });

  /// Tarih okunur biçime çevrilir; ham ISO dizgesi kullanıcıya
  /// gösterilmez. Beklenti saat dilimine BAĞIMLI YAZILMAZ — sabitlenen
  /// şey biçim.
  testWidgets('tarihi okunur biçimde gösterir, ham ISO dizgesini değil',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(
                200,
                paginated(
                  <Map<String, dynamic>>[
                    auditLogFixture(id: 205, createdAt: '2026-08-16T09:15:00Z'),
                  ],
                  1,
                ),
              ),
        }),
      ),
    );
    await openAudit(tester);

    expect(
      find.textContaining(RegExp(r'\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}')),
      findsOneWidget,
    );
    expect(find.textContaining('2026-08-16T09:15:00Z'), findsNothing);
  });

  testWidgets('created_at boşsa belirsizlik işareti gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(
                200,
                paginated(
                  <Map<String, dynamic>>[auditLogFixture(id: 206, createdAt: null)],
                  1,
                ),
              ),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.text('—'), findsOneWidget);
  });

  // ------------------------------------------------------ istek sözleşmesi

  testWidgets('listeyi page=1 ile ister', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/audit-logs': (_) => jsonResponse(200, paginated(threeLogs, 3)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openAudit(tester);

    final Iterable<http.Request> listRequests = recorder.requests.where(
      (http.Request request) =>
          request.url.path.endsWith('/audit-logs') && isListRequest(request),
    );

    expect(listRequests, isNotEmpty);
    expect(listRequests.first.url.queryParameters['page'], '1');
  });

  /// REGRESYON — UÇTA OLMAYAN PARAMETRE GÖNDERİLMEZ.
  ///
  /// AuditLogController yalnızca `per_page`'i doğrular. Uydurma bir
  /// parametre sessizce yok sayılır ve arayüzde "filtreledim" yanılsaması
  /// yaratır.
  testWidgets('sıralama, arama veya filtre parametresi göndermez',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/audit-logs': (_) => jsonResponse(200, paginated(threeLogs, 3)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openAudit(tester);

    final http.Request listRequest = recorder.requests.firstWhere(
      (http.Request request) =>
          request.url.path.endsWith('/audit-logs') && isListRequest(request),
    );

    // Tek parametre: page. per_page bile gönderilmez — backend varsayılanı
    // 20 ve arayüzün bundan farklı bir isteği yok.
    expect(listRequest.url.queryParameters.keys.toList(), <String>['page']);
  });

  /// SALT OKUNUR UÇ: bu ekranda GET dışında istek yoktur.
  testWidgets('GET dışında istek yapmaz', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/audit-logs': (_) => jsonResponse(200, paginated(threeLogs, 3)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openAudit(tester);

    final Iterable<String> methods =
        recorder.requests.map((http.Request request) => request.method).toSet();

    expect(methods, <String>{'GET'});
  });

  // ------------------------------------------------- yükleme / boş / hata

  /// Yanıt BİLEREK askıda tutulur: eşzamanlı çözülen bir yanıtta ekran
  /// yükleme karesini hiç göstermeden sonuca geçebilir.
  testWidgets('yüklenirken bekleme göstergesi gösterir, veri gelince kaldırır',
      (WidgetTester tester) async {
    final Completer<http.Response> gate = Completer<http.Response>();
    final http.Response Function(http.Request) base = routes(<String, ApiRoute>{
      ...sessionRoutes(),
      '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
    });

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        asyncHandler: (http.Request request) {
          if (request.url.path.endsWith('/audit-logs') && isListRequest(request)) {
            return gate.future;
          }
          return Future<http.Response>.value(base(request));
        },
      ),
    );
    await openAudit(tester);

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Müşteri oluşturuldu'), findsNothing);

    gate.complete(jsonResponse(200, paginated(threeLogs, 3)));
    await settle(tester);

    expect(find.text('Müşteri oluşturuldu'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('hiç kayıt yokken boş durum gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.text('Henüz denetim kaydı yok.'), findsOneWidget);
  });

  testWidgets('sunucu hatasında hata durumu ve tekrar deneme sunar',
      (WidgetTester tester) async {
    int attempt = 0;

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (http.Request request) {
            // Panelin özet isteği senaryoyu tüketmemeli.
            if (!isListRequest(request)) {
              return jsonResponse(200, paginated(<Map<String, dynamic>>[], 0));
            }

            attempt += 1;
            return attempt == 1
                ? jsonResponse(500, <String, dynamic>{'message': 'Server Error'})
                : jsonResponse(200, paginated(threeLogs, 3));
          },
        }),
      ),
    );
    await openAudit(tester);

    expect(find.textContaining('Beklenmedik bir hata'), findsOneWidget);
    // Ham sunucu metni kullanıcıya gösterilmez.
    expect(find.textContaining('Server Error'), findsNothing);

    await tester.tap(find.widgetWithText(FilledButton, 'Tekrar dene'));
    await settle(tester);

    expect(find.text('Müşteri oluşturuldu'), findsOneWidget);
  });

  /// 403 GERÇEKTEN rol kısıtıdır (AuditLogPolicy → Role::viewsAuditLogs()),
  /// bu yüzden kullanıcıya bunu söylemek doğrudur.
  testWidgets('403 durumunda bölümün sahiplere açık olduğunu söyler',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(role: 'member'),
          '/audit-logs': (_) =>
              jsonResponse(403, <String, dynamic>{'message': 'This action is unauthorized.'}),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.text('Bu bölüm yalnızca şirket sahiplerine açıktır.'), findsOneWidget);
    // Backend'in ham İngilizce metni kullanıcıya gösterilmez.
    expect(find.textContaining('This action is unauthorized.'), findsNothing);
  });

  /// İSTEMCİDE YETKİ KARARI YOK: rol `member` olsa bile hem giriş noktası
  /// görünür hem de istek yapılır. Rolüne bakıp engellemek, backend'in
  /// yetki kararını istemcide yeniden uygulamak olurdu.
  testWidgets('rol member olsa bile isteği yapar, istemcide engellemez',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(role: 'member'),
        '/audit-logs': (_) =>
            jsonResponse(403, <String, dynamic>{'message': 'This action is unauthorized.'}),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openAudit(tester);

    expect(
      recorder.requests.any(
        (http.Request request) =>
            request.url.path.endsWith('/audit-logs') && isListRequest(request),
      ),
      isTrue,
    );
  });

  testWidgets('401 durumunda oturumu kapatır', (WidgetTester tester) async {
    final InMemoryTokenStorage storage = await signedInStorage('artik-gecersiz');

    await tester.pumpWidget(
      appWith(
        storage: storage,
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (http.Request request) => isListRequest(request)
              ? jsonResponse(401, <String, dynamic>{'message': 'Unauthenticated.'})
              : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.widgetWithText(FilledButton, 'Giriş yap'), findsOneWidget);
    expect(await storage.read(), isNull);
  });

  /// 422 bu uçta YALNIZCA `per_page` geçersizse doğar ve arayüz `per_page`
  /// göndermez — yani normal kullanımda hiç görülmez. Test yine de var:
  /// hata eşlemesinin 422'yi 500 gibi maskelemediğini sabitler.
  testWidgets('422 durumunda backend doğrulama mesajını olduğu gibi gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (http.Request request) => isListRequest(request)
              ? jsonResponse(422, <String, dynamic>{
                  'message': 'Sayfa boyutu en fazla 100 olabilir.',
                  'errors': <String, dynamic>{
                    'per_page': <String>['Sayfa boyutu en fazla 100 olabilir.'],
                  },
                })
              : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.textContaining('Sayfa boyutu en fazla 100 olabilir.'), findsOneWidget);
    expect(find.textContaining('Beklenmedik bir hata'), findsNothing);
  });

  // ------------------------------------------------------------ sayfalama

  testWidgets('tek sayfa varsa sayfalama göstermez', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(200, paginated(threeLogs, 3)),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.textContaining('Sayfa '), findsNothing);
    expect(find.widgetWithText(TextButton, 'Sonraki'), findsNothing);
  });

  testWidgets('birden çok sayfa varsa sayfa bilgisini gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(
                200,
                paginated(threeLogs, 45, currentPage: 1, lastPage: 3, perPage: 20),
              ),
        }),
      ),
    );
    await openAudit(tester);

    expect(find.text('Sayfa 1 / 3'), findsOneWidget);

    final TextButton previous =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Önceki'));
    final TextButton next =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Sonraki'));

    expect(previous.onPressed, isNull);
    expect(next.onPressed, isNotNull);
  });

  testWidgets('sonraki sayfaya geçince page=2 ister ve o sayfanın içeriğini gösterir',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/audit-logs': (http.Request request) {
          if (!isListRequest(request)) {
            return jsonResponse(200, paginated(<Map<String, dynamic>>[], 0));
          }

          final String page = request.url.queryParameters['page'] ?? '1';

          return jsonResponse(
            200,
            paginated(
              page == '2'
                  ? <Map<String, dynamic>>[
                      auditLogFixture(id: 400, action: 'customer.deleted'),
                    ]
                  : threeLogs,
              45,
              currentPage: int.parse(page),
              lastPage: 3,
              perPage: 20,
            ),
          );
        },
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openAudit(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Sonraki'));
    await settle(tester);

    expect(find.text('Müşteri silindi'), findsOneWidget);
    expect(find.text('Müşteri oluşturuldu'), findsNothing);

    expect(
      recorder.requests.any(
        (http.Request request) =>
            request.url.path.endsWith('/audit-logs') &&
            request.url.queryParameters['page'] == '2',
      ),
      isTrue,
    );
  });

  testWidgets('son sayfada sonraki düğmesi kapalıdır', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/audit-logs': (_) => jsonResponse(
                200,
                paginated(threeLogs, 45, currentPage: 3, lastPage: 3, perPage: 20),
              ),
        }),
      ),
    );
    await openAudit(tester);

    final TextButton previous =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Önceki'));
    final TextButton next =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'Sonraki'));

    expect(next.onPressed, isNull);
    expect(previous.onPressed, isNotNull);
  });
}
