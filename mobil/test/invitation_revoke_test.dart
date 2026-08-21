import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Davet iptali — liste ekranından.
///
///   DELETE /invitations/{id} → 204 | 404 | 410 | 403
///
/// 410 GONE bu fazın yeni durumu. Kullanılamayan bir daveti iptal etmek
/// 410 döner ve backend ÜÇ AYRI KOD taşır:
///   invitation_revoked | invitation_accepted | invitation_expired
///
/// İPTAL DÜĞMESİ HER SATIRDA VARDIR — yalnızca `pending` olanlarda değil.
/// Durumu istemcide değerlendirip düğmeyi gizlemek geçerlilik kararını
/// istemciye taşımak olurdu; üstelik liste ile istek arasında durum
/// değişebilir. Karar backend'e ait, 410 da onun cevabı.
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

  final Map<String, dynamic> pending = invitationFixture(id: 41);
  final Map<String, dynamic> accepted =
      invitationFixture(id: 42, email: 'b***@flowtiger.test', status: 'accepted');

  Future<void> openInvitations(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Davetler'));
    await settle(tester);
  }

  Future<void> tapRevoke(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(TextButton, 'İptal et'));
    await settle(tester);
  }

  Iterable<http.Request> deletesOf(RecordingHandler recorder) =>
      recorder.requests.where((http.Request request) => request.method == 'DELETE');

  testWidgets('iptal onay ister ve onaysız istek göndermez',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/invitations': (_) =>
            jsonResponse(200, paginated(<Map<String, dynamic>>[pending], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openInvitations(tester);
    await tapRevoke(tester);

    expect(find.textContaining('a***@flowtiger.test'), findsWidgets);
    expect(find.textContaining('iptal edilecek'), findsOneWidget);

    expect(deletesOf(recorder), isEmpty);
  });

  testWidgets('onaylanınca DELETE gönderir ve liste tazelenir',
      (WidgetTester tester) async {
    bool revoked = false;

    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/invitations/41': (http.Request request) {
          if (request.method == 'DELETE') {
            revoked = true;
            return http.Response('', 204);
          }
          return jsonResponse(404, <String, dynamic>{'message': 'Beklenmeyen çağrı'});
        },
        '/invitations': (_) => jsonResponse(
              200,
              paginated(
                <Map<String, dynamic>>[
                  revoked ? invitationFixture(id: 41, status: 'revoked') : pending,
                ],
                1,
              ),
            ),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openInvitations(tester);
    await tapRevoke(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Evet, iptal et'));
    await settle(tester);

    // Liste yeniden yüklenmiş ve durum değişmiş olmalı.
    expect(find.text('İptal edildi'), findsOneWidget);

    expect(
      deletesOf(recorder)
          .where((http.Request request) => request.url.path.endsWith('/invitations/41'))
          .length,
      1,
    );
  });

  testWidgets('vazgeçilirse iptal isteği göndermez', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/invitations': (_) =>
            jsonResponse(200, paginated(<Map<String, dynamic>>[pending], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openInvitations(tester);
    await tapRevoke(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Vazgeç'));
    await settle(tester);

    expect(find.textContaining('iptal edilecek'), findsNothing);
    expect(deletesOf(recorder), isEmpty);
  });

  /// Durum istemcide değerlendirilmez: kabul edilmiş davette de düğme
  /// vardır ve backend 410 ile cevaplar.
  testWidgets('kabul edilmiş davette de iptal düğmesi gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[accepted], 1)),
        }),
      ),
    );
    await openInvitations(tester);

    final TextButton revoke =
        tester.widget<TextButton>(find.widgetWithText(TextButton, 'İptal et'));
    expect(revoke.onPressed, isNotNull);
  });

  /// 410'un üç kodu ayrı mesaj alır: kullanıcı için sonuçları farklıdır.
  Future<void> expectGoneMessage(
    WidgetTester tester, {
    required int id,
    required String code,
    required String backendMessage,
    required Map<String, dynamic> invitation,
    required String expected,
  }) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations/$id': (http.Request request) => request.method == 'DELETE'
              ? jsonResponse(410, <String, dynamic>{
                  'message': backendMessage,
                  'code': code,
                })
              : jsonResponse(404, <String, dynamic>{'message': 'Beklenmeyen çağrı'}),
          '/invitations': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[invitation], 1)),
        }),
      ),
    );
    await openInvitations(tester);
    await tapRevoke(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Evet, iptal et'));
    await settle(tester);

    expect(find.text(expected), findsOneWidget);
  }

  testWidgets('zaten iptal edilmiş davette 410 mesajını gösterir',
      (WidgetTester tester) async {
    await expectGoneMessage(
      tester,
      id: 41,
      code: 'invitation_revoked',
      backendMessage: 'Davet artık kullanılamaz (durum: revoked).',
      invitation: pending,
      expected: 'Bu davet zaten iptal edilmiş.',
    );
  });

  testWidgets('kabul edilmiş davette 410 için farklı mesaj gösterir',
      (WidgetTester tester) async {
    await expectGoneMessage(
      tester,
      id: 42,
      code: 'invitation_accepted',
      backendMessage: 'Davet artık kullanılamaz (durum: accepted).',
      invitation: accepted,
      expected: 'Bu davet zaten kabul edilmiş.',
    );

    // İki 410 durumu birbirinden ayrılmalı.
    expect(find.text('Bu davet zaten iptal edilmiş.'), findsNothing);
  });

  testWidgets('süresi dolmuş davette 410 için kendi mesajını gösterir',
      (WidgetTester tester) async {
    await expectGoneMessage(
      tester,
      id: 44,
      code: 'invitation_expired',
      backendMessage: 'Davet artık kullanılamaz (durum: expired).',
      invitation: invitationFixture(id: 44, status: 'expired'),
      expected: 'Bu davetin süresi dolmuş.',
    );
  });

  testWidgets('404 durumunda davet bulunamadı der', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations/41': (http.Request request) => request.method == 'DELETE'
              ? jsonResponse(404, <String, dynamic>{
                  'message': 'Davet bulunamadı.',
                  'code': 'invitation_not_found',
                })
              : jsonResponse(404, <String, dynamic>{'message': 'Beklenmeyen çağrı'}),
          '/invitations': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[pending], 1)),
        }),
      ),
    );
    await openInvitations(tester);
    await tapRevoke(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Evet, iptal et'));
    await settle(tester);

    expect(find.text('Davet bulunamadı.'), findsOneWidget);
    expect(find.textContaining('sahiplerine açıktır'), findsNothing);
  });

  testWidgets('403 durumunda bölümün sahiplere açık olduğunu söyler',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/invitations/41': (http.Request request) => request.method == 'DELETE'
              ? jsonResponse(403, <String, dynamic>{'message': 'This action is unauthorized.'})
              : jsonResponse(404, <String, dynamic>{'message': 'Beklenmeyen çağrı'}),
          '/invitations': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[pending], 1)),
        }),
      ),
    );
    await openInvitations(tester);
    await tapRevoke(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Evet, iptal et'));
    await settle(tester);

    expect(find.text('Bu bölüm yalnızca şirket sahiplerine açıktır.'), findsOneWidget);
    expect(find.textContaining('This action is unauthorized.'), findsNothing);
  });
}
