import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../models/models.dart';

/// Panelin veri durumu.
///
/// KURAL: sahte veri YOK. Her sayı gerçek bir uçtan gelir.
///
/// Üç panel BİRBİRİNDEN BAĞIMSIZ yüklenir. Sebebi rol farkı: /members ve
/// /audit-logs yalnızca owner'a açıktır, member 403 alır. Tek bir ortak
/// hata durumu kullanılsaydı, member rolündeki kullanıcının paneli
/// tamamen bozulmuş görünürdü.
enum PanelStatus {
  loading,
  ready,

  /// 403 — bir arıza değil, beklenen bir yetki durumu.
  forbidden,

  /// Diğer tüm hatalar.
  failed,
}

class Panel<T> {
  const Panel({required this.status, this.data});

  const Panel.loading() : this(status: PanelStatus.loading);
  const Panel.ready(T value) : this(status: PanelStatus.ready, data: value);

  final PanelStatus status;
  final T? data;

  bool get isLoading => status == PanelStatus.loading;
  bool get isForbidden => status == PanelStatus.forbidden;
  bool get isFailed => status == PanelStatus.failed;
}

class DashboardState {
  const DashboardState({
    this.customerCount = const Panel<int>.loading(),
    this.memberCount = const Panel<int>.loading(),
    this.recentActivity = const Panel<List<AuditLog>>.loading(),
  });

  final Panel<int> customerCount;
  final Panel<int> memberCount;
  final Panel<List<AuditLog>> recentActivity;

  DashboardState copyWith({
    Panel<int>? customerCount,
    Panel<int>? memberCount,
    Panel<List<AuditLog>>? recentActivity,
  }) {
    return DashboardState(
      customerCount: customerCount ?? this.customerCount,
      memberCount: memberCount ?? this.memberCount,
      recentActivity: recentActivity ?? this.recentActivity,
    );
  }
}

class DashboardController extends StateNotifier<DashboardState> {
  DashboardController({required ApiClient api})
      : _api = api,
        super(const DashboardState());

  final ApiClient _api;

  Future<void> load() async {
    state = const DashboardState();

    // Üçü paralel: biri diğerini beklemez.
    await Future.wait<void>(<Future<void>>[
      _loadCustomerCount(),
      _loadMemberCount(),
      _loadRecentActivity(),
    ]);
  }

  /// Sayım için per_page=1 kullanılır: kayıtların kendisi gerekmez,
  /// yalnızca meta.total. En küçük sayfa en ucuz sorgudur.
  Future<void> _loadCustomerCount() async {
    // ÖNCE bekle, SONRA state'e yaz. Tek satırda
    // `state = state.copyWith(x: await ...)` yazılamaz: Dart alıcıyı
    // argümandan önce değerlendirir, yani `state` await'ten ÖNCE okunur.
    // Üç yükleyici eşzamanlı koştuğu için her biri bayat bir anlık
    // görüntü üzerine yazar ve en son biten diğerlerinin panelini
    // loading'e geri döndürürdü.
    final Panel<int> panel = await _guard<int>(() async {
      final Map<String, dynamic> payload =
          await _api.getRaw('customers', query: <String, String>{'per_page': '1'});
      return _total(payload);
    });

    state = state.copyWith(customerCount: panel);
  }

  Future<void> _loadMemberCount() async {
    final Panel<int> panel = await _guard<int>(() async {
      final Map<String, dynamic> payload =
          await _api.getRaw('members', query: <String, String>{'per_page': '1'});
      return _total(payload);
    });

    state = state.copyWith(memberCount: panel);
  }

  Future<void> _loadRecentActivity() async {
    final Panel<List<AuditLog>> panel = await _guard<List<AuditLog>>(() async {
      final Map<String, dynamic> payload =
          await _api.getRaw('audit-logs', query: <String, String>{'per_page': '5'});

      return (payload['data'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic item) => AuditLog.fromJson(item as Map<String, dynamic>))
          .toList();
    });

    state = state.copyWith(recentActivity: panel);
  }

  /// 403'ü diğer hatalardan ayırır.
  Future<Panel<T>> _guard<T>(Future<T> Function() run) async {
    try {
      return Panel<T>.ready(await run());
    } on ApiException catch (error) {
      return Panel<T>(
        status: error.isForbidden ? PanelStatus.forbidden : PanelStatus.failed,
      );
    } on NetworkException {
      return Panel<T>(status: PanelStatus.failed);
    }
  }

  int _total(Map<String, dynamic> payload) {
    final Map<String, dynamic> meta =
        payload['meta'] as Map<String, dynamic>? ?? <String, dynamic>{};
    return meta['total'] as int? ?? 0;
  }
}

final StateNotifierProvider<DashboardController, DashboardState> dashboardControllerProvider =
    StateNotifierProvider<DashboardController, DashboardState>(
  (Ref ref) => DashboardController(api: ref.watch(apiClientProvider)),
);
