import 'dart:convert';

import 'package:flowtiger/core/config/app_config.dart';
import 'package:flowtiger/core/providers.dart';
import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flowtiger/main.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Ürün ekranı testleri için ortak kurulum.
///
/// Gerçek Keychain/Keystore ve gerçek ağ KULLANILMAZ; ikisi de provider
/// override ile değiştirilir.

const AppConfig testConfig = AppConfig(
  apiBaseUrl: 'https://api.test/api/v1',
  environment: 'test',
);

http.Response jsonResponse(int status, Object body) => http.Response(
      jsonEncode(body),
      status,
      headers: <String, String>{'content-type': 'application/json'},
    );

/// Tek bir API ucunun sahte yanıtını üreten işlev.
///
/// İsim bilerek 'Route' DEĞİL: Flutter'ın material/widgets kütüphanesi
/// gezinme için `Route` sınıfını dışa verir. Bu dosyayı import eden her
/// test aynı zamanda material.dart'ı da import ettiğinden, `Route` adı
/// iki kaynaktan gelir ve derleme "ambiguous import" ile durur.
typedef ApiRoute = http.Response Function(http.Request request);

/// Yol sonuna göre eşleşen basit bir yönlendirici.
///
/// Sıra ÖNEMLİ: '/companies/9/select' kaydı '/companies' kaydından önce
/// gelmeli, yoksa daha genel olan önce eşleşir.
http.Response Function(http.Request) routes(Map<String, ApiRoute> table) {
  return (http.Request request) {
    final String path = request.url.path;

    for (final MapEntry<String, ApiRoute> entry in table.entries) {
      if (path.endsWith(entry.key)) return entry.value(request);
    }

    return jsonResponse(404, <String, dynamic>{'message': 'Taklit edilmemiş uç: $path'});
  };
}

/// Bekleyen tüm iş bitene kadar kare çevirir.
///
/// İKİ ŞEY BİLEREK YAPILMIYOR:
///
/// 1. `pumpAndSettle` KULLANILMAZ. Yükleme sırasında ekranda sonsuz dönen
///    bir CircularProgressIndicator var; "animasyon bitene kadar bekle"
///    davranışı testi askıda bırakır.
///
/// 2. SAAT İLERLETİLMEZ. `pump(Duration)` sahte saati `elapse` eder ve
///    animasyonları sürer. Uygulamada zamana bağlı hiçbir iş yok — ağ
///    taklidi de, depolama da microtask sınırında çözülüyor — dolayısıyla
///    saati ilerletmenin tek etkisi animasyon sürmek olurdu.
///
///    Bu zararsız değildi. Bu ekranlarda `home` alt ağacı arka arkaya
///    baştan kuruluyor (auth kapısı → şirket kapısı → ekran) ve son adımda
///    Scaffold'a bir AppBar giriyor; Scaffold slotlarını CustomMultiChildLayout
///    ile yerleştirdiği için yeni slot o render nesnesinin parentData'sını
///    geçersizleştiriyor. Sabit süreli pump, aynı karede hem bu sökme/kurma
///    işini hem de bir animasyon adımını sürüyordu. `pump` varsayılan olarak
///    EnginePhase.sendSemanticsUpdate'e kadar gittiğinden semantics de her
///    karede derleniyor; parentData'sı yeni geçersizleşmiş ama henüz yeniden
///    yerleşmemiş bir nesne bu derlemeye girdiğinde framework
///    '!semantics.parentDataDirty' doğrulamasına çarpıyordu.
///
/// Bunun yerine: her karede yalnızca bekleyen iş boşaltılır ve zamanlayıcıya
/// SORULUR — sabit kare sayısı tahmin etmek yerine "başka kare gerekiyor mu"
/// sorusunun cevabına göre durulur. Böylece her durum değişimi kendi
/// karesinde, düzen ile semantics doğru sırada işlenir.
///
/// [maxFrames] bir zaman aşımı emniyetidir: çözülmeyen bir Future testi
/// sonsuza kadar askıda bırakmasın diye. Ulaşılması beklenen bir sınır
/// değildir.
Future<void> settle(WidgetTester tester, {int maxFrames = 60}) async {
  int quietFrames = 0;

  for (int i = 0; i < maxFrames; i++) {
    // Süresiz pump: kare çizilir ve microtask kuyruğu boşaltılır,
    // ama sahte saat yerinde kalır.
    await tester.pump();

    quietFrames = tester.binding.hasScheduledFrame ? 0 : quietFrames + 1;

    // İki ardışık sessiz kare aranır. Tek sessiz karede çıkmak, henüz
    // setState çağırmamış ama çözülmek üzere olan bir zincirin ortasında
    // durmak anlamına gelebilirdi.
    if (quietFrames == 2) return;
  }
}

/// Gönderilen istekleri kaydeden koşum.
class RecordingHandler {
  RecordingHandler(this._inner);

  final http.Response Function(http.Request) _inner;
  final List<http.Request> requests = <http.Request>[];

  http.Response call(http.Request request) {
    requests.add(request);
    return _inner(request);
  }

  List<String> get paths =>
      requests.map((http.Request request) => request.url.toString()).toList();

  bool hitPath(String suffix) =>
      requests.any((http.Request request) => request.url.path.endsWith(suffix));
}

Widget appWith({
  required TokenStorage storage,
  http.Response Function(http.Request request)? handler,
}) {
  return ProviderScope(
    overrides: <Override>[
      appConfigProvider.overrideWithValue(testConfig),
      tokenStorageProvider.overrideWithValue(storage),

      // YALNIZCA ağ katmanı değiştirilir. apiClientProvider override
      // EDİLMEZ: 401 davranışı orada kuruluyor ve testlerde de gerçekten
      // çalışması gerekiyor.
      if (handler != null)
        httpClientProvider.overrideWithValue(
          MockClient((http.Request request) async => handler(request)),
        ),
    ],
    child: const FlowTigerApp(),
  );
}

/// Oturumu açık bir kullanıcı için hazır depolama.
Future<InMemoryTokenStorage> signedInStorage([String token = 'gecerli-token']) async {
  final InMemoryTokenStorage storage = InMemoryTokenStorage();
  await storage.write(token);
  return storage;
}

// ---------------------------------------------------------------------------
// Sabit veriler — backend Resource sözleşmesiyle birebir aynı alan adları.
// ---------------------------------------------------------------------------

Map<String, dynamic> userFixture({int? activeCompanyId = 7}) => <String, dynamic>{
      'id': 1,
      'name': 'Ada Lovelace',
      'email': 'ada@flowtiger.test',
      'email_verified_at': '2026-08-01T10:00:00Z',
      'active_company_id': activeCompanyId,
    };

Map<String, dynamic> companyFixture({
  int id = 7,
  String name = 'Kaplan Yazılım',
  String role = 'owner',
}) =>
    <String, dynamic>{'id': id, 'name': name, 'role': role};

Map<String, dynamic> auditLogFixture({
  int id = 1,
  String action = 'customer.created',
}) =>
    <String, dynamic>{
      'id': id,
      'action': action,
      'ip_address': '198.51.100.4',
      'created_at': '2026-08-16T09:15:00Z',
    };

/// Sayfalı liste zarfı — sayımlar meta.total üzerinden okunur.
Map<String, dynamic> paginated(List<Map<String, dynamic>> data, int total) =>
    <String, dynamic>{
      'data': data,
      'meta': <String, dynamic>{
        'current_page': 1,
        'last_page': 1,
        'per_page': 15,
        'total': total,
      },
    };
