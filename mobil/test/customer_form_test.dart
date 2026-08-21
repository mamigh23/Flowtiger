import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

/// Müşteri oluşturma ve düzenleme — web ile AYNI sözleşme.
///
///   POST /customers        { name, phone } → 201
///   PUT  /customers/{id}   { name, phone } → 200
///
/// PUT SEMANTİĞİ KRİTİK: uç PATCH değil PUT'tur. Gövde kaydın TAM halini
/// tanımlar; gönderilmeyen `phone` null olarak YAZILIR. Bu yüzden form
/// mevcut değeri doldurur ve `phone` HER İSTEKTE gönderilir — kullanıcı
/// telefona hiç dokunmasa bile. Aksi hâlde yalnızca adı düzelten biri,
/// farkında olmadan telefonu silerdi.
///
/// customer_no ve company_id GÖNDERİLMEZ.
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

  Object? bodyOf(RecordingHandler recorder, String method) {
    final Iterable<http.Request> matching =
        recorder.requests.where((http.Request request) => request.method == method);
    return matching.isEmpty ? null : jsonDecode(matching.first.body);
  }

  Future<void> openCustomers(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Müşteriler'));
    await settle(tester);
  }

  // ------------------------------------------------------------ oluşturma

  testWidgets('yeni müşteri formu ad ve telefon alanlarını gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await openCustomers(tester);

    await tester.tap(find.byTooltip('Yeni müşteri'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.byKey(const Key('customer-name')), findsOneWidget);
    expect(find.byKey(const Key('customer-phone')), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Kaydet'), findsOneWidget);
  });

  testWidgets('oluştururken yalnızca ad ve telefon gönderir',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers/777': (_) => jsonResponse(200, <String, dynamic>{
              'data': customerFixture(id: 777, name: 'Yeni Müşteri'),
            }),
        '/customers': (http.Request request) => request.method == 'POST'
            ? jsonResponse(201, <String, dynamic>{
                'data': customerFixture(id: 777, name: 'Yeni Müşteri'),
              })
            : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openCustomers(tester);

    await tester.tap(find.byTooltip('Yeni müşteri'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.enterText(find.byKey(const Key('customer-name')), 'Yeni Müşteri');
    await tester.enterText(find.byKey(const Key('customer-phone')), '05551112233');

    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(
      bodyOf(recorder, 'POST'),
      <String, dynamic>{'name': 'Yeni Müşteri', 'phone': '05551112233'},
    );
  });

  testWidgets('telefon boş bırakılırsa null gönderir', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers/778': (_) => jsonResponse(200, <String, dynamic>{
              'data': customerFixture(id: 778, name: 'Telefonsuz', phone: null),
            }),
        '/customers': (http.Request request) => request.method == 'POST'
            ? jsonResponse(201, <String, dynamic>{
                'data': customerFixture(id: 778, name: 'Telefonsuz', phone: null),
              })
            : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openCustomers(tester);

    await tester.tap(find.byTooltip('Yeni müşteri'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.enterText(find.byKey(const Key('customer-name')), 'Telefonsuz');
    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(
      bodyOf(recorder, 'POST'),
      <String, dynamic>{'name': 'Telefonsuz', 'phone': null},
    );
  });

  testWidgets('oluşturmada 422 hatasını alan altında gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers': (http.Request request) => request.method == 'POST'
              ? jsonResponse(422, <String, dynamic>{
                  'message': 'Gönderilen bilgiler geçersiz.',
                  'errors': <String, dynamic>{
                    'name': <String>['Ad alanı zorunludur.'],
                  },
                })
              : jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        }),
      ),
    );
    await openCustomers(tester);

    await tester.tap(find.byTooltip('Yeni müşteri'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.enterText(find.byKey(const Key('customer-name')), 'X');
    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Ad alanı zorunludur.'), findsOneWidget);
  });

  // ------------------------------------------------------------ düzenleme

  Future<void> openEdit(WidgetTester tester) async {
    await openCustomers(tester);
    await tester.tap(find.text('Zeynep Kaya'));
    await settle(tester, advance: const Duration(milliseconds: 16));
    await tester.tap(find.widgetWithText(TextButton, 'Düzenle'));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  testWidgets('düzenleme formu mevcut değerleri doldurur',
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
    await openEdit(tester);

    final TextField name =
        tester.widget<TextField>(find.byKey(const Key('customer-name')));
    final TextField phone =
        tester.widget<TextField>(find.byKey(const Key('customer-phone')));

    expect(name.controller?.text, 'Zeynep Kaya');
    expect(phone.controller?.text, '05551112233');
  });

  /// REGRESYON: kullanıcı yalnızca adı değiştirir, telefona dokunmaz.
  /// Telefon gövdeden düşerse backend onu null yazar ve veri kaybolur.
  testWidgets('telefona dokunulmasa bile mevcut telefonu gövdede gönderir',
      (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers/501': (http.Request request) => request.method == 'PUT'
            ? jsonResponse(200, <String, dynamic>{
                'data': customerFixture(id: 501, customerNo: 12, name: 'Zeynep Kaya-Demir'),
              })
            : jsonResponse(200, <String, dynamic>{'data': customer}),
        '/customers': (_) =>
            jsonResponse(200, paginated(<Map<String, dynamic>>[customer], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openEdit(tester);

    await tester.enterText(find.byKey(const Key('customer-name')), 'Zeynep Kaya-Demir');
    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(
      bodyOf(recorder, 'PUT'),
      <String, dynamic>{'name': 'Zeynep Kaya-Demir', 'phone': '05551112233'},
    );
  });

  /// REGRESYON: telefonu zaten null olan müşteride alan gövdeden DÜŞMEZ,
  /// açıkça null gider. "Alan eksik" ile "alan null" aynı şey değildir.
  testWidgets('telefonu olmayan müşteride phone alanını null olarak gönderir',
      (WidgetTester tester) async {
    final Map<String, dynamic> phoneless =
        customerFixture(id: 502, customerNo: 5, name: 'Telefonsuz', phone: null);

    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers/502': (http.Request request) => request.method == 'PUT'
            ? jsonResponse(200, <String, dynamic>{
                'data': customerFixture(id: 502, customerNo: 5, name: 'Yeni Ad', phone: null),
              })
            : jsonResponse(200, <String, dynamic>{'data': phoneless}),
        '/customers': (_) =>
            jsonResponse(200, paginated(<Map<String, dynamic>>[phoneless], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );

    await openCustomers(tester);
    await tester.tap(find.text('Telefonsuz'));
    await settle(tester, advance: const Duration(milliseconds: 16));
    await tester.tap(find.widgetWithText(TextButton, 'Düzenle'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    await tester.enterText(find.byKey(const Key('customer-name')), 'Yeni Ad');
    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    final Map<String, dynamic> body = bodyOf(recorder, 'PUT')! as Map<String, dynamic>;

    expect(body, <String, dynamic>{'name': 'Yeni Ad', 'phone': null});
    // Alan gövdede BULUNMALI; eksik olması null göndermekle aynı şey değil.
    expect(body.containsKey('phone'), isTrue);
  });

  testWidgets('gövdede yalnızca name ve phone bulunur', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers/501': (http.Request request) => request.method == 'PUT'
            ? jsonResponse(200, <String, dynamic>{'data': customer})
            : jsonResponse(200, <String, dynamic>{'data': customer}),
        '/customers': (_) =>
            jsonResponse(200, paginated(<Map<String, dynamic>>[customer], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openEdit(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    final Map<String, dynamic> body = bodyOf(recorder, 'PUT')! as Map<String, dynamic>;
    final List<String> keys = body.keys.toList()..sort();

    expect(keys, <String>['name', 'phone']);
  });

  testWidgets('telefon silinmek istenirse null gönderir', (WidgetTester tester) async {
    final RecordingHandler recorder = RecordingHandler(
      routes(<String, ApiRoute>{
        ...sessionRoutes(),
        '/customers/501': (http.Request request) => request.method == 'PUT'
            ? jsonResponse(200, <String, dynamic>{
                'data': customerFixture(id: 501, customerNo: 12, phone: null),
              })
            : jsonResponse(200, <String, dynamic>{'data': customer}),
        '/customers': (_) =>
            jsonResponse(200, paginated(<Map<String, dynamic>>[customer], 1)),
      }),
    );

    await tester.pumpWidget(
      appWith(storage: await signedInStorage(), handler: recorder.call),
    );
    await openEdit(tester);

    await tester.enterText(find.byKey(const Key('customer-phone')), '');
    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(
      bodyOf(recorder, 'PUT'),
      <String, dynamic>{'name': 'Zeynep Kaya', 'phone': null},
    );
  });

  testWidgets('düzenlemede 422 hatasını alan altında gösterir',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/customers/501': (http.Request request) => request.method == 'PUT'
              ? jsonResponse(422, <String, dynamic>{
                  'message': 'Gönderilen bilgiler geçersiz.',
                  'errors': <String, dynamic>{
                    'name': <String>['Ad alanı zorunludur.'],
                  },
                })
              : jsonResponse(200, <String, dynamic>{'data': customer}),
          '/customers': (_) =>
              jsonResponse(200, paginated(<Map<String, dynamic>>[customer], 1)),
        }),
      ),
    );
    await openEdit(tester);

    await tester.enterText(find.byKey(const Key('customer-name')), '');
    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester, advance: const Duration(milliseconds: 16));

    expect(find.text('Ad alanı zorunludur.'), findsOneWidget);
  });
}
