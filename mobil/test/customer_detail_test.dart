import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Müşteri detayı ve silme — web ile AYNI sözleşme.
///
///   GET    /customers/{id} → 200 { data } | 404
///   DELETE /customers/{id} → 204 (gövdesiz) | 404
///
/// 404 KRİTİK: başka tenant'ın müşterisi de 404 döner, 403 değil. Bu
/// bilinçli bir gizlemedir; arayüz "yetkiniz yok" derse backend'in
/// sakladığı bilgiyi geri sızdırır.
void main() {
  Map<String, ApiRoute> sessionRoutes() => <String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, dynamic>{'data': userFixture()}),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture()],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      };

  final Map<String, dynamic> customer =
      customerFixture(id: 501, customerNo: 12, name: 'Zeynep Kaya');

  /// Müşteriler sekmesini açıp ilk müşterinin detayına girer.
  ///
  /// advance verilir: MaterialPageRoute geçişi zaman geçmeden tamamlanmaz.
  Future<void> openDetail(WidgetTester tester, {String name = 'Zeynep Kaya'}) async {
    await settle(tester);
    await tester.tap(find.text('Müşteriler'));
    await settle(tester);
    await tester.tap(find.text(name));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  testWidgets('müşteri numarasını, adını ve telefonunu gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers/501': (_) => jsonResponse(200, <String, dynamic>{'data': customer}),
          '/customers': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[customer], 1)),
        }),
      ),
    );
    await openDetail(tester);

    expect(find.text('Müşteri no'), findsOneWidget);
    expect(find.text('12'), findsOneWidget);
    expect(find.text('05551112233'), findsWidgets);
  });

  testWidgets('telefonu olmayan müşteride uydurma değer göstermez',
      (WidgetTester tester) async {
    final Map<String, dynamic> phoneless =
        customerFixture(id: 502, customerNo: 5, name: 'Telefonsuz', phone: null);

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers/502': (_) => jsonResponse(200, <String, dynamic>{'data': phoneless}),
          '/customers': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[phoneless], 1)),
        }),
      ),
    );
    await openDetail(tester, name: 'Telefonsuz');

    expect(find.text('—'), findsWidgets);
  });

  testWidgets('bilinmeyen müşteride bulunamadı der, yetki hatası demez',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers/501': (_) =>
              jsonResponse(404, <String, dynamic>{'message': 'Kayıt bulunamadı.'}),
          '/customers': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[customer], 1)),
        }),
      ),
    );
    await openDetail(tester);

    expect(find.text('Müşteri bulunamadı.'), findsOneWidget);
    expect(find.textContaining('yetki'), findsNothing);
    expect(find.textContaining('Erişim reddedildi'), findsNothing);
  });

  // --------------------------------------------------------------- silme

  testWidgets('silme işlemi onay ister ve onaysız istek göndermez',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers/501': (_) => jsonResponse(200, <String, dynamic>{'data': customer}),
        '/customers': (_) =>
            jsonResponse(200, paginated(<Map<String, dynamic>>[customer], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openDetail(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Sil'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    // Onay metni müşterinin adını içermeli: silme geri alınamaz, çünkü
    // backend'de soft delete YOK.
    expect(find.textContaining('Zeynep Kaya'), findsWidgets);
    expect(find.textContaining('kalıcı olarak silinecek'), findsOneWidget);

    final Iterable<http.Request> deletes =
        recorder.requests.where((http.Request request) => request.method == 'DELETE');
    expect(deletes, isEmpty);
  });

  testWidgets('onaylanınca DELETE gönderir ve listeye döner',
      (WidgetTester tester) async {
    // Sunucu durumu gerçekten değişir: silmeden önce liste doludur,
    // sonra boştur. Sabit bir liste dönseydi "listeye döndü" iddiası
    // silmenin etkisini değil yalnızca gezinmeyi ölçerdi.
    bool deleted = false;

    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers/501': (http.Request request) {
          if (request.method == 'DELETE') {
            deleted = true;
            return http.Response('', 204);
          }
          return jsonResponse(200, <String, dynamic>{'data': customer});
        },
        '/customers': (_) => jsonResponse(
              200,
              deleted
                  ? paginated(<Map<String, dynamic>>[], 0)
                  : paginated(<Map<String, dynamic>>[customer], 1),
            ),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openDetail(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Sil'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.tap(find.widgetWithText(FilledButton, 'Evet, sil'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    // Listeye dönülmüş ve liste yenilenmiş olmalı.
    expect(find.text('Henüz müşteri yok.'), findsOneWidget);
    expect(find.text('Müşteri no'), findsNothing, reason: 'detay ekranı kapanmalı');

    final Iterable<http.Request> deletes = recorder.requests.where(
      (http.Request request) =>
          request.method == 'DELETE' && request.url.path.endsWith('/customers/501'),
    );
    expect(deletes.length, 1);
  });

  testWidgets('vazgeçilirse silme isteği göndermez', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers/501': (_) => jsonResponse(200, <String, dynamic>{'data': customer}),
        '/customers': (_) =>
            jsonResponse(200, paginated(<Map<String, dynamic>>[customer], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openDetail(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Sil'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.tap(find.widgetWithText(TextButton, 'Vazgeç'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.textContaining('kalıcı olarak silinecek'), findsNothing);

    final Iterable<http.Request> deletes =
        recorder.requests.where((http.Request request) => request.method == 'DELETE');
    expect(deletes, isEmpty);
  });

  testWidgets('silme 404 dönerse bulunamadı der', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers/501': (http.Request request) => request.method == 'DELETE'
              ? jsonResponse(404, <String, dynamic>{'message': 'Kayıt bulunamadı.'})
              : jsonResponse(200, <String, dynamic>{'data': customer}),
          '/customers': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[customer], 1)),
        }),
      ),
    );
    await openDetail(tester);

    await tester.tap(find.widgetWithText(TextButton, 'Sil'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.tap(find.widgetWithText(FilledButton, 'Evet, sil'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Müşteri bulunamadı.'), findsOneWidget);
    expect(find.textContaining('yetki'), findsNothing);
  });
}
