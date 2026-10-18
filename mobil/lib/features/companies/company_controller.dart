import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../models/models.dart';
import '../auth/auth_controller.dart';

/// Aktif şirket durumu.
///
/// KRİTİK KURAL (playbook §3.1): aktif şirket İSTEMCİDE SEÇİLMEZ.
///
/// Buradaki değer backend'in söylediğinin bir kopyasıdır. İstemci hiçbir
/// istekte active_company_id göndermez; şirket değiştirmek için yalnızca
/// select ucu çağrılır ve karar backend'e aittir.
enum CompanyStatus { idle, loading, ready, error }

class CompanyState {
  const CompanyState({
    this.companies = const <Company>[],
    this.activeCompanyId,
    this.status = CompanyStatus.idle,
    this.error,
    this.selectingId,
    this.selectError,
  });

  final List<Company> companies;
  final int? activeCompanyId;
  final CompanyStatus status;
  final String? error;

  /// Seçimi süren şirketin kimliği (kart bazında kilitleme için).
  final int? selectingId;
  final String? selectError;

  bool get isBusy => status == CompanyStatus.loading || selectingId != null;

  Company? get activeCompany {
    for (final Company company in companies) {
      if (company.id == activeCompanyId) return company;
    }
    return null;
  }

  CompanyState copyWith({
    List<Company>? companies,
    int? activeCompanyId,
    CompanyStatus? status,
    String? error,
    int? selectingId,
    String? selectError,
    bool clearError = false,
    bool clearSelecting = false,
    bool clearSelectError = false,
    bool clearActiveCompany = false,
  }) {
    return CompanyState(
      companies: companies ?? this.companies,
      activeCompanyId: clearActiveCompany ? null : (activeCompanyId ?? this.activeCompanyId),
      status: status ?? this.status,
      error: clearError ? null : (error ?? this.error),
      selectingId: clearSelecting ? null : (selectingId ?? this.selectingId),
      selectError: clearSelectError ? null : (selectError ?? this.selectError),
    );
  }
}

class CompanyController extends StateNotifier<CompanyState> {
  CompanyController({required ApiClient api})
      : _api = api,
        super(const CompanyState());

  final ApiClient _api;

  /// Otomatik seçim yalnızca BİR KEZ denenir; başarısız olursa tekrar
  /// denemek sonsuz istek döngüsü yaratırdı.
  bool _autoSelectAttempted = false;
  int _revision = 0;
  bool _current(int revision) => mounted && revision == _revision;

  Future<void> load() async {
    if (state.selectingId != null) return;
    final int revision = ++_revision;
    state = state.copyWith(status: CompanyStatus.loading, clearError: true);

    try {
      // Liste ucu meta.active_company_id de taşır; zarf açılmaz.
      final Map<String, dynamic> payload = await _api.getRaw('companies');
      if (!_current(revision)) return;

      final List<Company> companies = (payload['data'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic item) => Company.fromJson(item as Map<String, dynamic>))
          .toList();

      final Map<String, dynamic> meta =
          payload['meta'] as Map<String, dynamic>? ?? <String, dynamic>{};

      state = CompanyState(
        companies: companies,
        activeCompanyId: meta['active_company_id'] as int?,
        status: CompanyStatus.ready,
      );

      await _autoSelectSingleCompany();
    } on ApiException catch (error) {
      if (!_current(revision)) return;
      if (error.isUnauthenticated) {
        // Oturum bitti: token silindi, AuthController giriş ekranına aldı.
        // Burada hata durumu BIRAKILMAZ — bırakılsaydı bir sonraki girişte
        // controller "error" hâlinde kalır ve şirketler bir daha hiç
        // yüklenmezdi.
        _autoSelectAttempted = false;
        state = const CompanyState();
        return;
      }

      state = state.copyWith(status: CompanyStatus.error, error: error.userMessage);
    } on NetworkException catch (error) {
      if (!_current(revision)) return;
      state = state.copyWith(status: CompanyStatus.error, error: error.userMessage);
    }
  }

  /// Aktif şirketi değiştirmenin TEK yolu.
  Future<void> select(int companyId) async {
    if (state.isBusy) return;
    final int revision = ++_revision;
    state = state.copyWith(selectingId: companyId, clearSelectError: true);

    try {
      final Map<String, dynamic> payload =
          await _api.post<Map<String, dynamic>>('companies/$companyId/select');
      if (!_current(revision)) return;

      state = state.copyWith(
        activeCompanyId: Company.fromJson(payload).id,
        clearSelecting: true,
      );
    } on ApiException catch (error) {
      if (!_current(revision)) return;
      state = state.copyWith(selectError: error.userMessage, clearSelecting: true);
    } on NetworkException catch (error) {
      if (!_current(revision)) return;
      state = state.copyWith(selectError: error.userMessage, clearSelecting: true);
    }
  }

  /// Tek şirketi olan kullanıcıya seçim ekranı gösterilmez.
  Future<void> _autoSelectSingleCompany() async {
    if (_autoSelectAttempted) return;
    if (state.activeCompanyId != null) return;
    if (state.companies.length != 1) return;

    _autoSelectAttempted = true;

    await select(state.companies.first.id);
  }

  /// Oturum kapandığında çağrılır.
  void reset() {
    ++_revision;
    _autoSelectAttempted = false;
    state = const CompanyState();
  }
}

final StateNotifierProvider<CompanyController, CompanyState> companyControllerProvider =
    StateNotifierProvider<CompanyController, CompanyState>(
  (Ref ref) {
    final CompanyController controller = CompanyController(api: ref.watch(apiClientProvider));
    ref.listen<AuthState>(
      authControllerProvider,
      (_, __) => controller.reset(),
    );
    return controller;
  },
);
