import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// Merkezi API istemcisi — web'deki ApiClient'ın Dart karşılığı.
///
/// Uygulamada http paketini doğrudan çağıran BAŞKA bir yer olmamalı.
/// Token ekleme, zarf açma, hata normalizasyonu ve 401 davranışı burada
/// bir kez tanımlanır (§13'ün istediği interceptor davranışı).
///
/// Yeniden deneme (retry) döngüsü YOK (§13): sessizce tekrarlanan bir
/// istek, 429 sınırını tetikler ve kullanıcıya yanlış bir "çalışıyor"
/// hissi verir.
class ApiClient {
  ApiClient({
    required AppConfig config,
    required TokenStorage tokenStorage,
    http.Client? httpClient,
    this.onUnauthenticated,
  })  : _config = config,
        _tokenStorage = tokenStorage,
        _http = httpClient ?? http.Client();

  final AppConfig _config;
  final TokenStorage _tokenStorage;
  final http.Client _http;

  /// 401 alındığında çağrılır: oturum temizliği tek noktadan yapılır.
  final Future<void> Function()? onUnauthenticated;

  Future<T> get<T>(String path, {Map<String, String>? query}) =>
      _send<T>('GET', path, query: query);

  Future<T> post<T>(String path, {Object? body, bool authenticated = true}) =>
      _send<T>('POST', path, body: body, authenticated: authenticated);

  Future<T> put<T>(String path, {Object? body}) => _send<T>('PUT', path, body: body);

  Future<T> patch<T>(String path, {Object? body}) => _send<T>('PATCH', path, body: body);

  Future<void> delete(String path) => _send<void>('DELETE', path);

  /// Sayfalanmış yanıtlar links/meta da taşır; zarf açılmaz.
  Future<Map<String, dynamic>> getRaw(String path, {Map<String, String>? query}) async {
    final Object? payload = await _request('GET', path, query: query);
    return (payload as Map<String, dynamic>?) ?? <String, dynamic>{};
  }

  /// `{ "data": X }` zarfını açar.
  Future<T> _send<T>(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    bool authenticated = true,
  }) async {
    final Object? payload = await _request(
      method,
      path,
      query: query,
      body: body,
      authenticated: authenticated,
    );

    if (payload is Map<String, dynamic> && payload.containsKey('data')) {
      return payload['data'] as T;
    }

    return payload as T;
  }

  Future<Object?> _request(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    bool authenticated = true,
  }) async {
    final Uri uri = _buildUri(path, query);

    final Map<String, String> headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
    };

    if (authenticated) {
      final String? token = await _tokenStorage.read();
      if (token != null) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    http.Response response;

    try {
      final http.Request request = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) {
        request.body = jsonEncode(body);
      }

      response = await http.Response.fromStream(await _http.send(request));
    } on Exception {
      // Ağ hatası; ayrıntı loglanmaz (URL ve başlıklar sır taşıyabilir).
      throw const NetworkException();
    }

    if (response.statusCode == 204 || response.statusCode == 205) {
      return null;
    }

    final Object? payload = _decode(response.body);

    if (response.statusCode >= 400) {
      throw await _toException(response, payload);
    }

    return payload;
  }

  Uri _buildUri(String path, Map<String, String>? query) {
    final String base = _config.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    final String normalisedPath = path.replaceAll(RegExp(r'^/+'), '');

    return Uri.parse('$base/$normalisedPath').replace(
      queryParameters: (query == null || query.isEmpty) ? null : query,
    );
  }

  Object? _decode(String body) {
    if (body.isEmpty) return null;

    try {
      return jsonDecode(body);
    } on FormatException {
      // Backend her zaman JSON döner. JSON olmayan bir gövde (proxy hata
      // sayfası) ham hâliyle kullanıcıya gösterilmemeli.
      return null;
    }
  }

  Future<ApiException> _toException(http.Response response, Object? payload) async {
    final Map<String, dynamic> data =
        payload is Map<String, dynamic> ? payload : <String, dynamic>{};

    if (response.statusCode == 401) {
      await onUnauthenticated?.call();
    }

    Map<String, List<String>>? errors;
    final Object? rawErrors = data['errors'];

    if (rawErrors is Map<String, dynamic>) {
      errors = rawErrors.map(
        (String key, Object? value) => MapEntry<String, List<String>>(
          key,
          value is List ? value.map((Object? item) => item.toString()).toList() : <String>[],
        ),
      );
    }

    final String? retryAfter = response.headers['retry-after'];

    return ApiException(
      statusCode: response.statusCode,
      message: (data['message'] as String?) ?? _defaultMessage(response.statusCode),
      code: data['code'] as String?,
      errors: errors,
      retryAfterSeconds: retryAfter == null ? null : int.tryParse(retryAfter),
    );
  }

  String _defaultMessage(int statusCode) {
    switch (statusCode) {
      case 401:
        return 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.';
      case 403:
        return 'Bu işlem için yetkiniz yok.';
      case 404:
        return 'Kayıt bulunamadı.';
      case 422:
        return 'Gönderilen bilgiler geçersiz.';
      case 429:
        return 'Çok fazla deneme yapıldı.';
      default:
        return 'Beklenmedik bir hata oluştu.';
    }
  }
}
