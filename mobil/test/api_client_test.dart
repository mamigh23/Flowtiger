import 'dart:convert';

import 'package:flowtiger/core/config/app_config.dart';
import 'package:flowtiger/core/network/api_client.dart';
import 'package:flowtiger/core/network/api_exception.dart';
import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Gerçek ağ olmadan ApiClient davranışı.
void main() {
  const AppConfig config = AppConfig(
    apiBaseUrl: 'https://api.test/api/v1',
    environment: 'test',
  );

  http.Response json(int status, Object? body, {Map<String, String>? headers}) {
    return http.Response(
      body == null ? '' : jsonEncode(body),
      status,
      headers: <String, String>{'content-type': 'application/json', ...?headers},
    );
  }

  ApiClient clientReturning(
    http.Response Function(http.Request request) handler, {
    TokenStorage? storage,
    Future<void> Function()? onUnauthenticated,
  }) {
    return ApiClient(
      config: config,
      tokenStorage: storage ?? (InMemoryTokenStorage()..write('test-token')),
      httpClient: MockClient((http.Request request) async => handler(request)),
      onUnauthenticated: onUnauthenticated,
    );
  }

  group('ApiClient', () {
    test('data zarfını açar', () async {
      final ApiClient api = clientReturning(
        (_) => json(200, <String, dynamic>{
          'data': <String, dynamic>{'id': 1, 'name': 'Ada'},
        }),
      );

      final Map<String, dynamic> result = await api.get<Map<String, dynamic>>('me');

      expect(result['name'], 'Ada');
    });

    test('Authorization başlığını ekler', () async {
      String? sentHeader;

      final ApiClient api = clientReturning((http.Request request) {
        sentHeader = request.headers['Authorization'];
        return json(200, <String, dynamic>{'data': null});
      });

      await api.get<void>('me');

      expect(sentHeader, 'Bearer test-token');
    });

    test('authenticated:false verildiğinde token göndermez', () async {
      String? sentHeader;

      final ApiClient api = clientReturning((http.Request request) {
        sentHeader = request.headers['Authorization'];
        return json(200, <String, dynamic>{'data': null});
      });

      await api.post<void>('auth/login', body: <String, String>{}, authenticated: false);

      expect(sentHeader, isNull);
    });

    test('204 yanıtını gövdesiz döndürür', () async {
      final ApiClient api = clientReturning((_) => http.Response('', 204));

      await expectLater(api.delete('customers/1'), completes);
    });

    test('401 alındığında oturum temizliğini tetikler', () async {
      bool cleared = false;

      final ApiClient api = clientReturning(
        (_) => json(401, <String, dynamic>{'message': 'Unauthenticated.'}),
        onUnauthenticated: () async => cleared = true,
      );

      await expectLater(api.get<void>('me'), throwsA(isA<ApiException>()));
      expect(cleared, isTrue);
    });

    test('403 kodu taşır', () async {
      final ApiClient api = clientReturning(
        (_) => json(403, <String, dynamic>{
          'message': 'Yetkiniz yok.',
          'code': 'no_active_company',
        }),
      );

      try {
        await api.get<void>('customers');
        fail('ApiException bekleniyordu.');
      } on ApiException catch (error) {
        expect(error.isForbidden, isTrue);
        expect(error.code, 'no_active_company');
      }
    });

    test('422 doğrulama hatalarını alan bazında sunar', () async {
      final ApiClient api = clientReturning(
        (_) => json(422, <String, dynamic>{
          'message': 'Gönderilen bilgiler geçersiz.',
          'errors': <String, dynamic>{
            'email': <String>['E-posta gerekli.'],
          },
        }),
      );

      try {
        await api.post<void>('customers', body: <String, String>{});
        fail('ApiException bekleniyordu.');
      } on ApiException catch (error) {
        expect(error.isValidation, isTrue);
        expect(error.fieldError('email'), 'E-posta gerekli.');
      }
    });

    test('429 için Retry-After saniyesini taşır', () async {
      final ApiClient api = clientReturning(
        (_) => json(
          429,
          <String, dynamic>{'message': 'Çok fazla deneme.'},
          headers: <String, String>{'retry-after': '42'},
        ),
      );

      try {
        await api.post<void>('auth/login', body: <String, String>{});
        fail('ApiException bekleniyordu.');
      } on ApiException catch (error) {
        expect(error.isRateLimited, isTrue);
        expect(error.retryAfterSeconds, 42);
        expect(error.userMessage, contains('42'));
      }
    });

    test('500 mesajı kullanıcıya ham gösterilmez', () async {
      final ApiClient api = clientReturning(
        (_) => json(500, <String, dynamic>{'message': 'Server Error'}),
      );

      try {
        await api.get<void>('me');
        fail('ApiException bekleniyordu.');
      } on ApiException catch (error) {
        expect(error.isServerError, isTrue);
        expect(error.userMessage, isNot(contains('Server Error')));
      }
    });

    test('ağ hatasını NetworkException olarak sarar', () async {
      final ApiClient api = ApiClient(
        config: config,
        tokenStorage: InMemoryTokenStorage(),
        httpClient: MockClient((_) async => throw http.ClientException('kesildi')),
      );

      await expectLater(api.get<void>('me'), throwsA(isA<NetworkException>()));
    });

    test('sorgu parametrelerini kurar', () async {
      Uri? sentUri;

      final ApiClient api = clientReturning((http.Request request) {
        sentUri = request.url;
        return json(200, <String, dynamic>{'data': <dynamic>[]});
      });

      await api.get<void>('customers', query: <String, String>{'page': '2'});

      expect(sentUri.toString(), 'https://api.test/api/v1/customers?page=2');
    });
  });
}
