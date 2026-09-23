import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';

void main() {
  Map<String, ApiRoute> sessionRoutes() => <String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, dynamic>{
              'data': userFixture(),
            }),
        '/companies': (_) => jsonResponse(200, <String, dynamic>{
              'data': <Map<String, dynamic>>[companyFixture()],
              'meta': <String, dynamic>{'active_company_id': 7},
            }),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      };

  Map<String, dynamic> sessionsPayload(List<Map<String, dynamic>> items) =>
      <String, dynamic>{
        'data': items,
      };

  Map<String, dynamic> securityEventsPayload(
    List<Map<String, dynamic>> items, {
    int page = 1,
    int lastPage = 1,
    int total = 0,
  }) =>
      <String, dynamic>{
        'data': items,
        'links': <String, dynamic>{
          'first': null,
          'last': null,
          'prev': null,
          'next': null,
        },
        'meta': <String, dynamic>{
          'current_page': page,
          'last_page': lastPage,
          'per_page': 20,
          'total': total,
        },
      };

  Future<void> openSecurity(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('Profil'));
    await settle(tester);
    await tester.tap(find.text('Güvenlik ve oturumlar'));
    await settle(tester, advance: const Duration(milliseconds: 16));
  }

  testWidgets('oturumları ve güvenlik hareketlerini gösterir', (WidgetTester tester) async {
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/sessions': (_) => jsonResponse(
                200,
                sessionsPayload(<Map<String, dynamic>>[
                  <String, dynamic>{
                    'id': 11,
                    'name': 'Chrome · Windows',
                    'current': true,
                    'abilities': null,
                    'last_used_at': '2026-09-23T18:00:00Z',
                    'expires_at': null,
                    'created_at': '2026-09-23T10:00:00Z',
                  },
                  <String, dynamic>{
                    'id': 12,
                    'name': 'Safari · iPhone',
                    'current': false,
                    'abilities': null,
                    'last_used_at': '2026-09-22T12:00:00Z',
                    'expires_at': null,
                    'created_at': '2026-09-20T12:00:00Z',
                  },
                ]),
              ),
          '/profile/security-events': (_) => jsonResponse(
                200,
                securityEventsPayload(
                  <Map<String, dynamic>>[
                    <String, dynamic>{
                      'id': 21,
                      'action': 'login.success',
                      'ip_address': '203.0.113.10',
                      'metadata': null,
                      'created_at': '2026-09-23T18:00:00Z',
                    },
                  ],
                  total: 1,
                ),
              ),
        }),
      ),
    );
    await openSecurity(tester);

    expect(find.text('Chrome · Windows'), findsOneWidget);
    expect(find.text('Safari · iPhone'), findsOneWidget);
    expect(find.text('Bu oturum'), findsOneWidget);
    expect(find.text('Giriş yapıldı'), findsOneWidget);
    expect(find.text('203.0.113.10'), findsOneWidget);
  });

  testWidgets('başka oturumu kapatır ve listeyi yeniler', (WidgetTester tester) async {
    int revokeCount = 0;

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/sessions/12': (http.Request request) {
            expect(request.method, 'DELETE');
            revokeCount += 1;
            return jsonResponse(204, '');
          },
          '/profile/sessions': (_) => jsonResponse(
                200,
                sessionsPayload(<Map<String, dynamic>>[
                  <String, dynamic>{
                    'id': 11,
                    'name': 'Chrome · Windows',
                    'current': true,
                    'abilities': null,
                    'last_used_at': '2026-09-23T18:00:00Z',
                    'expires_at': null,
                    'created_at': '2026-09-23T10:00:00Z',
                  },
                  if (revokeCount == 0)
                    <String, dynamic>{
                      'id': 12,
                      'name': 'Safari · iPhone',
                      'current': false,
                      'abilities': null,
                      'last_used_at': '2026-09-22T12:00:00Z',
                      'expires_at': null,
                      'created_at': '2026-09-20T12:00:00Z',
                    },
                ]),
              ),
          '/profile/security-events': (_) => jsonResponse(
                200,
                securityEventsPayload(<Map<String, dynamic>>[], total: 0),
              ),
        }),
      ),
    );
    await openSecurity(tester);

    await tester.tap(find.text('Kapat'));
    await settle(tester);

    expect(revokeCount, 1);
    expect(find.text('Safari · iPhone'), findsNothing);
    expect(find.text('Chrome · Windows'), findsOneWidget);
  });

  testWidgets('diğer oturumların tamamını kapatır', (WidgetTester tester) async {
    int revokeOthersCount = 0;

    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        handler: routes(<String, ApiRoute>{
          ...sessionRoutes(),
          '/profile/sessions/others': (http.Request request) {
            expect(request.method, 'DELETE');
            revokeOthersCount += 1;
            return jsonResponse(204, '');
          },
          '/profile/sessions': (_) => jsonResponse(
                200,
                sessionsPayload(<Map<String, dynamic>>[
                  <String, dynamic>{
                    'id': 11,
                    'name': 'Chrome · Windows',
                    'current': true,
                    'abilities': null,
                    'last_used_at': '2026-09-23T18:00:00Z',
                    'expires_at': null,
                    'created_at': '2026-09-23T10:00:00Z',
                  },
                  if (revokeOthersCount == 0)
                    <String, dynamic>{
                      'id': 12,
                      'name': 'Safari · iPhone',
                      'current': false,
                      'abilities': null,
                      'last_used_at': '2026-09-22T12:00:00Z',
                      'expires_at': null,
                      'created_at': '2026-09-20T12:00:00Z',
                    },
                ]),
              ),
          '/profile/security-events': (_) => jsonResponse(
                200,
                securityEventsPayload(<Map<String, dynamic>>[], total: 0),
              ),
        }),
      ),
    );
    await openSecurity(tester);

    await tester.tap(find.text('Diğerlerini kapat'));
    await settle(tester);

    expect(revokeOthersCount, 1);
    expect(find.text('Safari · iPhone'), findsNothing);
    expect(find.text('Chrome · Windows'), findsOneWidget);
  });
}
