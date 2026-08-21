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
/// [advance] verilirse saat her karede o kadar ilerletilir. YALNIZCA ekran
/// geçişi olan testlerde gerekir: MaterialPageRoute animasyonu zaman
/// geçmeden tamamlanmaz, eski ekran ağaçta asılı kalır ve `findsOneWidget`
/// iddiaları iki eşleşme görür. Geçiş olmayan testlerde verilmez —
/// yukarıdaki parentDataDirty gerekçesi orada hâlâ geçerli.
///
/// [maxFrames] bir zaman aşımı emniyetidir: çözülmeyen bir Future testi
/// sonsuza kadar askıda bırakmasın diye. Ulaşılması beklenen bir sınır
/// değildir.
Future<void> settle(WidgetTester tester, {int maxFrames = 60, Duration? advance}) async {
  int quietFrames = 0;

  for (int i = 0; i < maxFrames; i++) {
    // Süresiz pump: kare çizilir ve microtask kuyruğu boşaltılır,
    // ama sahte saat yerinde kalır (advance verilmedikçe).
    await tester.pump(advance);

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

/// [asyncHandler], yanıtı BİLEREK askıda tutabilmek içindir.
///
/// Yükleme durumunu ve çift gönderim kilidini sınamanın başka yolu yok:
/// eşzamanlı bir [handler] ile yanıt aynı olay turunda çözülür ve ekran
/// yükleme karesini hiç göstermeden sonuca geçebilir. Askıda bir Completer
/// döndürmek, göstergenin gerçekten çıktığını VE veri gelince kalktığını
/// kanıtlamayı mümkün kılar.
///
/// İkisinden yalnızca biri verilir; ikisi de verilirse [asyncHandler]
/// kazanır.
Widget appWith({
  required TokenStorage storage,
  http.Response Function(http.Request request)? handler,
  Future<http.Response> Function(http.Request request)? asyncHandler,
}) {
  Future<http.Response> Function(http.Request)? send = asyncHandler;

  if (send == null && handler != null) {
    // Yerel değişkene alınır: kapanış içinde tip yükseltmesine
    // güvenilmez, kural değişirse sessizce bozulurdu.
    final http.Response Function(http.Request) sync = handler;
    send = (http.Request request) async => sync(request);
  }

  return ProviderScope(
    overrides: <Override>[
      appConfigProvider.overrideWithValue(testConfig),
      tokenStorageProvider.overrideWithValue(storage),

      // YALNIZCA ağ katmanı değiştirilir. apiClientProvider override
      // EDİLMEZ: 401 davranışı orada kuruluyor ve testlerde de gerçekten
      // çalışması gerekiyor.
      if (send != null) httpClientProvider.overrideWithValue(MockClient(send)),
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

/// Denetim kaydı — backend AuditLogResource ile birebir alanlar.
///
/// Yanıtın TAM alan listesi (backend testiyle sabitlenmiş):
///   id, action, actor?, auditable?, old_values, new_values, metadata,
///   ip_address, created_at
///
/// `company_id` ve `user_agent` yanıtta HİÇ YOKTUR; burada da yok.
/// `actor` yalnızca id + name taşır — e-posta backend'de bilinçli olarak
/// dışarıda bırakılmıştır.
///
/// `actor` ve `auditable` KOŞULLU alanlardır ($this->when): aktörü olmayan
/// bir kayıtta anahtar hiç gelmez. [includeActor] / [includeAuditable] bu
/// durumu sınamak içindir — alanı null göndermek DEĞİL, hiç göndermemek.
///
/// [extra], sözleşmede olmayan bir alan gelse bile arayüzün onu ekrana
/// basmadığını sınamak için vardır (company_id regresyonu).
Map<String, dynamic> auditLogFixture({
  int id = 1,
  String action = 'customer.created',
  int actorId = 21,
  String actorName = 'Ada Lovelace',
  bool includeActor = true,
  String auditableType = 'customer',
  int auditableId = 5,
  bool includeAuditable = true,
  Map<String, dynamic>? oldValues,
  Map<String, dynamic>? newValues,
  Map<String, dynamic>? metadata,
  String? ipAddress = '198.51.100.4',
  String? createdAt = '2026-08-16T09:15:00Z',
  Map<String, dynamic> extra = const <String, dynamic>{},
}) =>
    <String, dynamic>{
      'id': id,
      'action': action,
      if (includeActor)
        'actor': <String, dynamic>{'id': actorId, 'name': actorName},
      if (includeAuditable)
        'auditable': <String, dynamic>{'type': auditableType, 'id': auditableId},
      'old_values': oldValues,
      'new_values': newValues,
      'metadata': metadata,
      'ip_address': ipAddress,
      'created_at': createdAt,
      ...extra,
    };

/// Üye — backend MemberResource ile birebir alanlar.
///
/// `role` pivot'tan gelir ve pivot yüklenmemişse alan HİÇ görünmez;
/// [includeRole] false verilerek bu durum sınanabilir.
Map<String, dynamic> memberFixture({
  int id = 21,
  String name = 'Ada Lovelace',
  String email = 'ada@flowtiger.test',
  String role = 'owner',
  bool includeRole = true,
}) =>
    <String, dynamic>{
      'id': id,
      'name': name,
      'email': email,
      if (includeRole) 'role': role,
      'created_at': '2026-07-01T08:00:00+00:00',
      'updated_at': '2026-08-01T12:00:00+00:00',
    };

/// Davet — backend InvitationResource ile birebir alanlar.
///
/// `email` MASKELİ gelir; gerçek adres backend'den hiç çıkmaz.
/// `status` hesaplanan alandır. `token` yanıtta ASLA yer almaz.
Map<String, dynamic> invitationFixture({
  int id = 41,
  String email = 'a***@flowtiger.test',
  String role = 'member',
  String status = 'pending',
}) =>
    <String, dynamic>{
      'id': id,
      'email': email,
      'role': role,
      'status': status,
      'expires_at': '2026-08-24T09:00:00+00:00',
      'created_at': '2026-08-17T09:00:00+00:00',
    };

Map<String, dynamic> customerFixture({
  int id = 501,
  int customerNo = 1,
  String name = 'Zeynep Kaya',
  String? phone = '05551112233',
}) =>
    <String, dynamic>{
      'id': id,
      'customer_no': customerNo,
      'name': name,
      'phone': phone,
      'created_at': '2026-08-10T08:00:00+00:00',
      'updated_at': '2026-08-12T14:30:00+00:00',
    };

/// Sayfalı liste zarfı — sayımlar meta.total üzerinden okunur.
///
/// Varsayılanlar tek sayfalık bir sonuç üretir; sayfalama testleri
/// [currentPage] / [lastPage] / [perPage] ile çok sayfalı yanıtı kurar.
Map<String, dynamic> paginated(
  List<Map<String, dynamic>> data,
  int total, {
  int currentPage = 1,
  int lastPage = 1,
  int perPage = 15,
}) =>
    <String, dynamic>{
      'data': data,
      'meta': <String, dynamic>{
        'current_page': currentPage,
        'last_page': lastPage,
        'per_page': perPage,
        'total': total,
      },
    };
