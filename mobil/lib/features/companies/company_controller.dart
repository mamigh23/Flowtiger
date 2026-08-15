import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../models/models.dart';

/// Aktif şirket durumu.
///
/// KRİTİK KURAL: aktif şirket İSTEMCİDE SEÇİLMEZ.
///
/// Buradaki değer backend'in söylediğinin bir kopyasıdır. İstemci
/// hiçbir istekte active_company_id göndermez; şirket değiştirmek için
/// yalnızca select ucu çağrılır ve karar backend'e aittir.
class CompanyState {
  const CompanyState({
    this.companies = const <Company>[],
    this.activeCompanyId,
    this.loading = false,
    this.error,
  });

  final List<Company> companies;
  final int? activeCompanyId;
  final bool loading;
  final String? error;

  Company? get activeCompany {
    for (final Company company in companies) {
      if (company.id == activeCompanyId) return company;
    }
    return null;
  }

  CompanyState copyWith({
    List<Company>? companies,
    int? activeCompanyId,
    bool? loading,
    String? error,
    bool clearError = false,
  }) {
    return CompanyState(
      companies: companies ?? this.companies,
      activeCompanyId: activeCompanyId ?? this.activeCompanyId,
      loading: loading ?? this.loading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class CompanyController extends StateNotifier<CompanyState> {
  CompanyController({required ApiClient api})
      : _api = api,
        super(const CompanyState());

  final ApiClient _api;

  Future<void> load() async {
    state = state.copyWith(loading: true, clearError: true);

    try {
      // Liste ucu meta.active_company_id de taşır; zarf açılmaz.
      final Map<String, dynamic> payload = await _api.getRaw('companies');

      final List<Company> companies = (payload['data'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic item) => Company.fromJson(item as Map<String, dynamic>))
          .toList();

      final Map<String, dynamic> meta =
          payload['meta'] as Map<String, dynamic>? ?? <String, dynamic>{};

      state = CompanyState(
        companies: companies,
        activeCompanyId: meta['active_company_id'] as int?,
      );
    } on Object {
      state = state.copyWith(loading: false, error: 'Şirket listesi alınamadı.');
    }
  }

  /// Aktif şirketi değiştirmenin TEK yolu.
  Future<void> select(int companyId) async {
    final Map<String, dynamic> payload =
        await _api.post<Map<String, dynamic>>('companies/$companyId/select');

    state = state.copyWith(activeCompanyId: Company.fromJson(payload).id);
  }
}

final StateNotifierProvider<CompanyController, CompanyState> companyControllerProvider =
    StateNotifierProvider<CompanyController, CompanyState>(
  (Ref ref) => CompanyController(api: ref.watch(apiClientProvider)),
);
