import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../models/models.dart';

/// Denetim listesi durumu.
///
/// SALT OKUNUR: bu dosyada create/update/delete yoktur ve olmayacak.
/// Backend'de audit için yalnızca GET /audit-logs var; store/update/
/// destroy yok, POST 405 döner. Audit kaydı yalnızca domain işlemlerinin
/// yan etkisi olarak doğar — API üzerinden yazılabilseydi iz uydurmak
/// mümkün olurdu.
///
/// Arama/sıralama/filtre YOK: uçta böyle bir parametre yok. Sıralama
/// backend'de SABİT (created_at DESC, id DESC).
enum AuditListStatus { loading, ready, error }

class AuditListState {
  const AuditListState({
    this.logs = const <AuditLog>[],
    this.status = AuditListStatus.loading,
    this.currentPage = 1,
    this.lastPage = 1,
    this.total = 0,
    this.error,
  });

  final List<AuditLog> logs;
  final AuditListStatus status;
  final int currentPage;
  final int lastPage;
  final int total;
  final Object? error;

  bool get isEmpty => status == AuditListStatus.ready && logs.isEmpty;
  bool get hasPreviousPage => currentPage > 1;
  bool get hasNextPage => currentPage < lastPage;
}

class AuditListController extends StateNotifier<AuditListState> {
  AuditListController({required ApiClient api})
      : _api = api,
        super(const AuditListState());

  final ApiClient _api;

  Future<void> load({int page = 1}) async {
    state = AuditListState(status: AuditListStatus.loading, currentPage: page);

    try {
      // YALNIZCA `page`. `per_page` bile gönderilmez: backend varsayılanı
      // 20 ve arayüzün bundan farklı bir isteği yok. Uçta olmayan bir
      // parametre eklemek ise sessizce yok sayılır ve arayüzde
      // "filtreledim" yanılsaması yaratır.
      final Map<String, dynamic> payload = await _api.getRaw(
        'audit-logs',
        query: <String, String>{'page': '$page'},
      );

      final List<AuditLog> logs = (payload['data'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic item) => AuditLog.fromJson(item as Map<String, dynamic>))
          .toList();

      final Map<String, dynamic> meta =
          payload['meta'] as Map<String, dynamic>? ?? <String, dynamic>{};

      state = AuditListState(
        logs: logs,
        status: AuditListStatus.ready,
        currentPage: meta['current_page'] as int? ?? page,
        lastPage: meta['last_page'] as int? ?? 1,
        total: meta['total'] as int? ?? logs.length,
      );
    } on ApiException catch (error) {
      // 401'de token zaten silindi ve oturum düştü; burada ek iş yok.
      state = AuditListState(
        status: AuditListStatus.error,
        error: error,
        currentPage: page,
      );
    } on NetworkException catch (error) {
      state = AuditListState(
        status: AuditListStatus.error,
        error: error,
        currentPage: page,
      );
    }
  }

  Future<void> nextPage() => load(page: state.currentPage + 1);

  Future<void> previousPage() => load(page: state.currentPage - 1);

  Future<void> reload() => load(page: state.currentPage);
}

final StateNotifierProvider<AuditListController, AuditListState> auditListControllerProvider =
    StateNotifierProvider<AuditListController, AuditListState>(
  (Ref ref) => AuditListController(api: ref.watch(apiClientProvider)),
);
