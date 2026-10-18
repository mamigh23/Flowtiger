import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../models/models.dart';
import '../companies/company_scope.dart';

/// Davet listesi durumu.
///
/// Arama/sıralama/durum filtresi YOK: uçta böyle bir parametre yok.
/// Backend durum filtresi sunmadığı için iptal edilmiş ve süresi dolmuş
/// davetler de listelenir.
enum InvitationListStatus { loading, ready, error }

class InvitationListState {
  const InvitationListState({
    this.invitations = const <Invitation>[],
    this.status = InvitationListStatus.loading,
    this.currentPage = 1,
    this.lastPage = 1,
    this.total = 0,
    this.error,
  });

  final List<Invitation> invitations;
  final InvitationListStatus status;
  final int currentPage;
  final int lastPage;
  final int total;
  final Object? error;

  bool get isEmpty => status == InvitationListStatus.ready && invitations.isEmpty;
  bool get hasPreviousPage => currentPage > 1;
  bool get hasNextPage => currentPage < lastPage;
}

class InvitationListController extends StateNotifier<InvitationListState> {
  InvitationListController({required ApiClient api})
      : _api = api,
        super(const InvitationListState());

  final ApiClient _api;
  int _revision = 0;
  bool _current(int revision) => mounted && revision == _revision;

  void reset() {
    ++_revision;
    state = const InvitationListState();
  }

  Future<void> load({int page = 1}) async {
    final int revision = ++_revision;
    state = InvitationListState(status: InvitationListStatus.loading, currentPage: page);

    try {
      final Map<String, dynamic> payload = await _api.getRaw(
        'invitations',
        query: <String, String>{'page': '$page'},
      );
      if (!_current(revision)) return;

      final List<Invitation> invitations = (payload['data'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic item) => Invitation.fromJson(item as Map<String, dynamic>))
          .toList();

      final Map<String, dynamic> meta =
          payload['meta'] as Map<String, dynamic>? ?? <String, dynamic>{};

      state = InvitationListState(
        invitations: invitations,
        status: InvitationListStatus.ready,
        currentPage: meta['current_page'] as int? ?? page,
        lastPage: meta['last_page'] as int? ?? 1,
        total: meta['total'] as int? ?? invitations.length,
      );
    } on ApiException catch (error) {
      if (!_current(revision)) return;
      // 401'de token zaten silindi ve oturum düştü; burada ek iş yok.
      state = InvitationListState(
        status: InvitationListStatus.error,
        error: error,
        currentPage: page,
      );
    } on NetworkException catch (error) {
      if (!_current(revision)) return;
      state = InvitationListState(
        status: InvitationListStatus.error,
        error: error,
        currentPage: page,
      );
    }
  }

  Future<void> nextPage() => load(page: state.currentPage + 1);

  Future<void> previousPage() => load(page: state.currentPage - 1);

  Future<void> reload() => load(page: state.currentPage);
}

final StateNotifierProvider<InvitationListController, InvitationListState>
    invitationListControllerProvider =
    StateNotifierProvider<InvitationListController, InvitationListState>(
  (Ref ref) {
    final InvitationListController controller =
        InvitationListController(api: ref.watch(apiClientProvider));
    resetOnCompanyScopeChange(ref, controller.reset);
    return controller;
  },
);

/// Davet oluşturma ve iptal.
///
/// GÖVDE SÖZLEŞMESİ: yalnızca `email` ve `role`. `name` GÖNDERİLMEZ —
/// davet edilenin adı bu aşamada bilinmez, kendisi kabul ekranında girer.
///
/// Yanıtta `token` YOKTUR ve burada hiçbir yerde beklenmez; plaintext
/// token yalnızca gönderilen mailde yaşar.
///
/// POST /invitations/accept BU SINIFTA YOK: kimlik doğrulaması olmayan
/// public bir uç, kendi rate-limit'i ve iki ayrı gövde biçimi var.
/// Ayrı bir faz.
class InvitationRepository {
  const InvitationRepository(this._api);

  final ApiClient _api;

  Future<Invitation> create({required String email, required Role role}) async {
    final Map<String, dynamic> payload = await _api.post<Map<String, dynamic>>(
      'invitations',
      body: <String, dynamic>{'email': email, 'role': role.value},
    );

    return Invitation.fromJson(payload);
  }

  Future<void> revoke(int id) => _api.delete('invitations/$id');
}

final Provider<InvitationRepository> invitationRepositoryProvider = Provider<InvitationRepository>(
  (Ref ref) => InvitationRepository(ref.watch(apiClientProvider)),
);
